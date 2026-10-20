/**
 * The audit log: every change, who made it, and what it was before and
 * after. Call recordChange() in the same transaction as every write.
 *
 * Entries are hash-chained: each entry's `hash` is SHA-256 over the previous
 * entry's hash and this entry's canonical content, so an entry changed,
 * removed or inserted outside the app (the table's triggers stop it from
 * inside) breaks the chain from that point, and verifyAuditChain() names it.
 *
 * Values in fields named like secrets (password, token, secret) are never
 * written; sealed `*_enc` values are recorded only as a short fingerprint,
 * so a change still shows without the value.
 */
import { createHash } from 'node:crypto'
import type { Actor } from '@shared/domain/roles'
import type { Db } from '../db/connection'

export interface SystemActor {
  kind: 'system'
  /** Who to show: 'AETERNA CRM', 'Companies House check'. */
  name: string
}

export const SYSTEM_ACTOR: SystemActor = Object.freeze({ kind: 'system', name: 'AETERNA CRM' })

export interface ChangeRecord {
  /** What happened, as '<area>.<verb>': 'clients.update'. */
  action: string
  /** The kind of record: 'client', 'invoice'. */
  entity: string
  entityId?: string | number | null
  /** The client the record belongs to, so the client's history shows it. */
  clientId?: number | null
  /** A short sentence for the log: 'Changed the year end'. */
  summary?: string | null
  before?: unknown
  after?: unknown
}

/** The chain's starting value. */
export const GENESIS_HASH = createHash('sha256').update('aeterna-crm audit log v1').digest('hex')

interface AuditRow {
  id: number
  actor_kind: string
  actor_id: number | null
  actor_name: string
  action: string
  entity: string
  entity_id: string | null
  client_id: number | null
  summary: string | null
  before_json: string | null
  after_json: string | null
  prev_hash: string
  hash: string
  created_at: string
}

const SECRET_KEY = /(password|passphrase|secret|token)/i

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || depth > 6) return value ?? null
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(k)) out[k] = v === null || v === undefined ? null : '[not recorded]'
    else if (k.endsWith('_enc') && typeof v === 'string' && v !== '') out[k] = `[sealed ${createHash('sha256').update(v).digest('hex').slice(0, 8)}]`
    else out[k] = redact(v, depth + 1)
  }
  return out
}

function toJson(value: unknown): string | null {
  if (value === undefined) return null
  return JSON.stringify(redact(value))
}

/** The exact text the hash covers, in a fixed order. */
export function canonicalEntry(r: Omit<AuditRow, 'hash'>): string {
  return JSON.stringify([
    r.id,
    r.created_at,
    r.actor_kind,
    r.actor_id,
    r.actor_name,
    r.action,
    r.entity,
    r.entity_id,
    r.client_id,
    r.summary,
    r.before_json,
    r.after_json,
    r.prev_hash
  ])
}

export function entryHash(r: Omit<AuditRow, 'hash'>): string {
  return createHash('sha256').update(r.prev_hash).update('\n').update(canonicalEntry(r)).digest('hex')
}

function isSystem(actor: Actor | SystemActor | null): actor is SystemActor | null {
  return actor === null || (actor as SystemActor).kind === 'system'
}

/** Adds one entry to the log and returns its id. Runs inside the caller's transaction (or its own). */
export function recordChange(db: Db, actor: Actor | SystemActor | null, change: ChangeRecord, now: Date = new Date()): number {
  const write = (): number => {
    const last = db.prepare('SELECT id, hash FROM audit_log ORDER BY id DESC LIMIT 1').get() as { id: number; hash: string } | undefined
    const system = isSystem(actor)
    const row: Omit<AuditRow, 'hash'> = {
      id: (last?.id ?? 0) + 1,
      actor_kind: system ? 'system' : 'user',
      actor_id: system ? null : actor.id,
      actor_name: system ? (actor?.name ?? SYSTEM_ACTOR.name) : actor.name,
      action: change.action,
      entity: change.entity,
      entity_id: change.entityId === null || change.entityId === undefined ? null : String(change.entityId),
      client_id: change.clientId ?? null,
      summary: change.summary ?? null,
      before_json: toJson(change.before),
      after_json: toJson(change.after),
      prev_hash: last?.hash ?? GENESIS_HASH,
      created_at: now.toISOString()
    }
    const hash = entryHash(row)
    db.prepare(
      `INSERT INTO audit_log (id, actor_kind, actor_id, actor_name, action, entity, entity_id, client_id, summary,
         before_json, after_json, prev_hash, hash, created_at)
       VALUES (@id, @actor_kind, @actor_id, @actor_name, @action, @entity, @entity_id, @client_id, @summary,
         @before_json, @after_json, @prev_hash, @hash, @created_at)`
    ).run({ ...row, hash })
    return row.id
  }
  return db.inTransaction ? write() : db.transaction(write)()
}

/** The fields whose values differ between two versions of a record, with both values. */
export function changedFields(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined): Record<string, { before: unknown; after: unknown }> {
  const out: Record<string, { before: unknown; after: unknown }> = {}
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  for (const k of keys) {
    const b = before?.[k] ?? null
    const a = after?.[k] ?? null
    if (JSON.stringify(b) !== JSON.stringify(a)) out[k] = { before: b, after: a }
  }
  return out
}

export type ChainCheck =
  | { ok: true; entries: number }
  | {
      ok: false
      entries: number
      /** The first entry that doesn't fit the chain. */
      firstBadId: number
      reason: 'changed' | 'missing_before' | 'reordered'
      message: string
    }

/** Runs the chain from the first entry and names the first that was changed, removed or inserted outside the app. */
export function verifyAuditChain(db: Db): ChainCheck {
  let expectedPrev = GENESIS_HASH
  let expectedId = 1
  let entries = 0
  for (const r of db.prepare('SELECT * FROM audit_log ORDER BY id').iterate() as IterableIterator<AuditRow>) {
    entries += 1
    if (r.id !== expectedId) {
      return { ok: false, entries, firstBadId: r.id, reason: 'missing_before', message: `Entries ${expectedId} to ${r.id - 1} are missing from the audit log.` }
    }
    if (r.prev_hash !== expectedPrev) {
      return { ok: false, entries, firstBadId: r.id, reason: 'reordered', message: `Audit entry ${r.id} doesn’t follow the entry before it.` }
    }
    const { hash, ...rest } = r
    if (entryHash(rest) !== hash) {
      return { ok: false, entries, firstBadId: r.id, reason: 'changed', message: `Audit entry ${r.id} was changed outside the app.` }
    }
    expectedPrev = hash
    expectedId += 1
  }
  return { ok: true, entries }
}
