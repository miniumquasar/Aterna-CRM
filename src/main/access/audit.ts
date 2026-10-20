/**
 * The audit log: every change, who made it, and what it was before and
 * after. Call recordChange() in the same transaction as every write.
 *
 * Entries are hash-chained: each entry's `hash` is SHA-256 over the previous
 * entry's hash and this entry's canonical content, so an entry changed,
 * removed or inserted outside the app (the table's triggers stop it from
 * inside) breaks the chain from that point, and verifyAuditChain() names it.
 * The newest entry's id and hash are also kept in app_meta ('audit_head'),
 * in the same transaction, and the next entry chains from there: so entries
 * removed from the end, or added after it, outside the app are noticed too,
 * and stay noticed after the app writes again.
 *
 * Values in fields named like secrets (password, passphrase, secret, token,
 * NI number, authentication code, recovery words, backup codes) are never
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

/** Field names whose values never go into the log (in any letter case, with or without underscores). */
const SECRET_KEY = /(password|passphrase|secret|token|nino|ni_?number|auth_?code|recovery_?words|backup_?codes)/i

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || depth > 6) return value ?? null
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k.endsWith('_enc') && typeof v === 'string' && v !== '') out[k] = `[sealed ${createHash('sha256').update(v).digest('hex').slice(0, 8)}]`
    else if (SECRET_KEY.test(k)) out[k] = v === null || v === undefined ? null : '[not recorded]'
    else out[k] = redact(v, depth + 1)
  }
  return out
}

/** Where the newest entry is kept, so the end of the chain can be checked too. */
export const AUDIT_HEAD_KEY = 'audit_head'

interface ChainHead {
  id: number
  hash: string
}

function readHead(db: Db): ChainHead | null {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(AUDIT_HEAD_KEY) as { value: string } | undefined
  if (!row) return null
  try {
    const v = JSON.parse(row.value) as Partial<ChainHead>
    return typeof v.id === 'number' && Number.isInteger(v.id) && typeof v.hash === 'string' && /^[0-9a-f]{64}$/.test(v.hash) ? { id: v.id, hash: v.hash } : null
  } catch {
    return null
  }
}

function writeHead(db: Db, head: ChainHead, at: string): void {
  db.prepare(
    `INSERT INTO app_meta (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(AUDIT_HEAD_KEY, JSON.stringify(head), at, at)
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
    const last = db.prepare('SELECT id, hash FROM audit_log ORDER BY id DESC LIMIT 1').get() as ChainHead | undefined
    // Chain from the recorded head, so a tail removed (or rows added) outside the app stays visible; never reuse an id.
    const head = readHead(db) ?? last ?? null
    const system = isSystem(actor)
    const row: Omit<AuditRow, 'hash'> = {
      id: Math.max(head?.id ?? 0, last?.id ?? 0) + 1,
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
      prev_hash: head?.hash ?? GENESIS_HASH,
      created_at: now.toISOString()
    }
    const hash = entryHash(row)
    db.prepare(
      `INSERT INTO audit_log (id, actor_kind, actor_id, actor_name, action, entity, entity_id, client_id, summary,
         before_json, after_json, prev_hash, hash, created_at)
       VALUES (@id, @actor_kind, @actor_id, @actor_name, @action, @entity, @entity_id, @client_id, @summary,
         @before_json, @after_json, @prev_hash, @hash, @created_at)`
    ).run({ ...row, hash })
    writeHead(db, { id: row.id, hash }, row.created_at)
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
      /** The first entry that doesn't fit the chain (for entries removed from the end, the first one missing). */
      firstBadId: number
      /**
       * changed         an entry's content no longer matches its hash
       * missing_before  entries before this one are gone
       * reordered       this entry doesn't follow the one before it
       * missing_at_end  the newest entries are gone
       * added_outside   entries after the newest the app wrote
       */
      reason: 'changed' | 'missing_before' | 'reordered' | 'missing_at_end' | 'added_outside'
      message: string
    }

/** Runs the chain from the first entry and names the first that was changed, removed or inserted outside the app. */
export function verifyAuditChain(db: Db): ChainCheck {
  let expectedPrev = GENESIS_HASH
  let expectedId = 1
  let entries = 0
  const head = readHead(db)
  for (const r of db.prepare('SELECT * FROM audit_log ORDER BY id').iterate() as IterableIterator<AuditRow>) {
    if (head && r.id > head.id) {
      return { ok: false, entries: entries + 1, firstBadId: r.id, reason: 'added_outside', message: `Audit entry ${r.id} was added outside the app, after the newest entry the app wrote.` }
    }
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
  if (head) {
    const lastId = expectedId - 1
    if (head.id > lastId) {
      return {
        ok: false,
        entries,
        firstBadId: lastId + 1,
        reason: 'missing_at_end',
        message: lastId + 1 === head.id ? `Audit entry ${head.id}, the newest, is missing from the audit log.` : `Entries ${lastId + 1} to ${head.id}, the newest, are missing from the audit log.`
      }
    }
    if (head.hash !== expectedPrev) {
      return { ok: false, entries, firstBadId: lastId, reason: 'changed', message: `Audit entry ${lastId} was changed outside the app.` }
    }
  }
  return { ok: true, entries }
}
