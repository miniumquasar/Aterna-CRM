/**
 * Import engine — plan, commit, roll back. Source-format-agnostic.
 *
 * PLAN (read-only). For every row intent:
 *   1. find the CRM row: external id (re-import) → natural key → for clients
 *      also company number → UTR → exact unique name;
 *   2. three-way merge each column against the snapshot this source wrote
 *      last time:  CRM untouched → take source;  source unchanged → keep CRM;
 *      both changed → keep CRM and report a conflict. Rows matched for the
 *      first time (no snapshot) only fill blanks — imports never overwrite
 *      data someone typed into the CRM;
 *   3. fingerprint the whole plan (SHA-256 over every operation).
 *
 * COMMIT re-plans inside one transaction and refuses unless the fingerprint
 * equals the one the user reviewed — what you previewed is exactly what is
 * written. Every write is journalled in import_changes (append-only).
 *
 * ROLLBACK replays the journal backwards for the most recent batch only, and
 * refuses if anything it would undo was edited after the import.
 */

import { createHash, randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { SourceRef } from './canonical'
import { nameKey } from './normalise'
import { TABLE_ORDER, type CellIn, type ClientToken, type EntityTable, type ParentToken, type RowIntent, type Scalar } from './project'

export const REQUIRED_MIGRATION = '0007_practice_registers'

type Row = Record<string, Scalar>
type MatchedBy = 'external_id' | 'natural_key' | 'crn' | 'utr' | 'name'

export interface PlannedOp {
  table: EntityTable
  key: string
  source: SourceRef
  action: 'insert' | 'update' | 'unchanged'
  entityId: number | null
  /** The external id mapping that existed before this import, if any (restored on rollback). */
  prevMapping: { entity_id: number; snapshot: Record<string, Scalar> } | null
  /** Columns to write — all of them for inserts, only changed ones for updates. */
  set: Record<string, CellIn>
  /** Source-side values, stored as the merge base for the next import. */
  snapshot: Record<string, CellIn>
  conflicts: Array<{ column: string; crm: Scalar; source: Scalar }>
  matchedBy: MatchedBy | null
}

export interface Plan {
  sourceSystem: string
  ops: PlannedOp[]
  skipped: Array<{ table: EntityTable; key: string; reason: string }>
  clientMatching: { externalId: number; crn: number; utr: number; name: number; new: number }
  warnings: string[]
  fingerprint: string
}

export class FingerprintMismatchError extends Error {
  constructor() {
    super('The source file or the database changed after the preview. Run the preview again and review it before committing.')
    this.name = 'FingerprintMismatchError'
  }
}

export class RollbackBlockedError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Rollback refused — ${problems.length} change(s) were made after the import:\n  ${problems.slice(0, 10).join('\n  ')}` +
      (problems.length > 10 ? `\n  …and ${problems.length - 10} more` : ''))
    this.name = 'RollbackBlockedError'
  }
}

// ── small helpers ────────────────────────────────────────────────────────────

const isParent = (v: CellIn): v is ParentToken => typeof v === 'object' && v !== null && '$parent' in v
const isClient = (v: CellIn): v is ClientToken => typeof v === 'object' && v !== null && '$client' in v
const blank = (v: Scalar | undefined): boolean => v === null || v === undefined || v === ''
const same = (a: Scalar | undefined, b: Scalar | undefined): boolean =>
  blank(a) && blank(b) ? true : blank(a) || blank(b) ? false : String(a) === String(b)

const IDENT = /^[a-z_][a-z0-9_]*$/
function q(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`)
  return `"${name}"`
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

function statementCache(db: Database): (sql: string) => ReturnType<Database['prepare']> {
  const cache = new Map<string, ReturnType<Database['prepare']>>()
  return (sql) => {
    let s = cache.get(sql)
    if (!s) {
      s = db.prepare(sql)
      cache.set(sql, s)
    }
    return s
  }
}

function columnsOf(db: Database, table: string): Set<string> {
  return new Set((db.prepare(`PRAGMA table_info(${q(table)})`).all() as Array<{ name: string }>).map((r) => r.name))
}

export function assertSchemaCurrent(db: Database): void {
  const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get()
  const applied = hasTable && db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(REQUIRED_MIGRATION)
  if (!applied) {
    throw new Error(`Database schema is not current: migration ${REQUIRED_MIGRATION} has not been applied. ` +
      'Start the app once with the migration runner wired in, or run the CLI "migrate" command.')
  }
}

const digits10 = (v: Scalar): string | null => {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length === 10 ? d : null
}
const crnKey = (v: Scalar): string | null => {
  const s = String(v ?? '').toUpperCase().replace(/\s/g, '')
  if (!s) return null
  return /^\d{1,8}$/.test(s) ? s.padStart(8, '0') : s
}

// ── PLAN ─────────────────────────────────────────────────────────────────────

export function planImport(db: Database, sourceSystem: string, intents: RowIntent[]): Plan {
  assertSchemaCurrent(db)
  const prep = statementCache(db)
  const cols = new Map<string, Set<string>>()
  const colsOf = (t: string): Set<string> => {
    let c = cols.get(t)
    if (!c) {
      c = columnsOf(db, t)
      cols.set(t, c)
    }
    return c
  }
  for (const i of intents) {
    for (const c of Object.keys(i.values)) {
      if (!colsOf(i.table).has(c)) throw new Error(`Schema drift: column ${i.table}.${c} does not exist`)
    }
  }

  const ext = new Map<string, { entity_id: number; snapshot: Record<string, Scalar> }>()
  for (const r of prep('SELECT entity_table, external_key, entity_id, snapshot_json FROM external_ids WHERE source_system = ?')
    .all(sourceSystem) as Array<{ entity_table: string; external_key: string; entity_id: number; snapshot_json: string }>) {
    ext.set(`${r.entity_table}:${r.external_key}`, { entity_id: r.entity_id, snapshot: JSON.parse(r.snapshot_json) })
  }
  const rowById = (table: string, id: number): Row | undefined =>
    prep(`SELECT * FROM ${q(table)} WHERE id = ?`).get(id) as Row | undefined

  const ops: PlannedOp[] = []
  const skipped: Plan['skipped'] = []
  const warnings: string[] = []
  const clientMatching = { externalId: 0, crn: 0, utr: 0, name: 0, new: 0 }
  const clientRef = new Map<string, string>()
  /** `${table}:${key}` → existing row id, or 'pending' for rows this plan inserts. */
  const known = new Map<string, number | 'pending'>()
  let recreated = 0

  const merge = (
    i: RowIntent, row: Row, values: Record<string, CellIn>, matchedBy: MatchedBy
  ): PlannedOp => {
    const prev = ext.get(`${i.table}:${i.key}`) ?? null
    const base = prev && prev.entity_id === row.id ? prev.snapshot : null
    const set: Record<string, CellIn> = {}
    const conflicts: PlannedOp['conflicts'] = []
    if (i.policy === 'sync') {
      for (const [col, theirs] of Object.entries(values)) {
        if (isParent(theirs)) {
          set[col] = theirs // parent inserted by this plan — id known only at commit
          continue
        }
        const t = theirs as Scalar
        const ours = row[col]
        if (same(t, ours)) continue
        if (base && col in base) {
          if (same(ours, base[col])) set[col] = t
          else if (!same(t, base[col])) conflicts.push({ column: col, crm: ours ?? null, source: t })
        } else if (blank(ours)) set[col] = t
        else if (!blank(t)) conflicts.push({ column: col, crm: ours ?? null, source: t })
      }
    }
    return {
      table: i.table, key: i.key, source: i.source, action: Object.keys(set).length ? 'update' : 'unchanged',
      entityId: row.id as number, prevMapping: prev, set, snapshot: values, conflicts, matchedBy
    }
  }
  const insert = (i: RowIntent, values: Record<string, CellIn>): PlannedOp => {
    const prev = ext.get(`${i.table}:${i.key}`) ?? null
    if (prev) recreated += 1
    return {
      table: i.table, key: i.key, source: i.source, action: 'insert', entityId: null, prevMapping: prev,
      set: values, snapshot: values, conflicts: [], matchedBy: null
    }
  }

  // ── clients: resolved first so every child can reference them ─────────────
  const existing = prep('SELECT id, ref, client_name, reg_no, utr FROM clients').all() as Row[]
  const index = (f: (r: Row) => string | null): Map<string, number[]> => {
    const m = new Map<string, number[]>()
    for (const r of existing) {
      const k = f(r)
      if (k) m.set(k, [...(m.get(k) ?? []), r.id as number])
    }
    return m
  }
  const byCrn = index((r) => crnKey(r.reg_no))
  const byUtr = index((r) => digits10(r.utr))
  const byName = index((r) => nameKey(r.client_name))
  const takenRefs = new Set(existing.map((r) => r.ref).filter((r): r is string => typeof r === 'string' && r !== ''))
  const claimed = new Set<number>()
  const clientIntents = intents.filter((i) => i.table === 'clients')
  const sourceNames = new Map<string, number>()
  for (const i of clientIntents) {
    const k = nameKey(i.values.client_name as string)
    if (k) sourceNames.set(k, (sourceNames.get(k) ?? 0) + 1)
  }
  const pickFree = (ids: number[] | undefined): number | undefined => {
    const free = (ids ?? []).filter((id) => !claimed.has(id))
    return free.length === 1 ? free[0] : undefined
  }

  for (const i of clientIntents) {
    const values = { ...i.values }
    const proposed = String(values.ref)
    delete values.ref
    let row: Row | undefined
    let matchedBy: MatchedBy | null = null
    const e = ext.get(`clients:${i.key}`)
    if (e && !claimed.has(e.entity_id)) {
      row = rowById('clients', e.entity_id)
      if (row) matchedBy = 'external_id'
    }
    const tryMatch = (how: MatchedBy, id: number | undefined): void => {
      if (row || id === undefined) return
      row = rowById('clients', id)
      if (row) matchedBy = how
    }
    tryMatch('crn', pickFree(byCrn.get(crnKey(values.reg_no as Scalar) ?? '')))
    tryMatch('utr', pickFree(byUtr.get(digits10(values.utr as Scalar) ?? '')))
    const nk = nameKey(values.client_name as string)
    if (nk && sourceNames.get(nk) === 1) tryMatch('name', pickFree(byName.get(nk)))

    if (row && matchedBy) {
      claimed.add(row.id as number)
      let ref = typeof row.ref === 'string' && row.ref ? row.ref : null
      if (!ref) {
        ref = takenRefs.has(proposed) ? `${proposed}-WB` : proposed
        values.ref = ref
        takenRefs.add(ref)
      }
      clientRef.set(i.key, ref)
      known.set(`clients:${i.key}`, row.id as number)
      ops.push(merge(i, row, values, matchedBy))
      clientMatching[matchedBy === 'external_id' ? 'externalId' : matchedBy] += 1
    } else {
      let ref = proposed
      if (takenRefs.has(ref)) {
        ref = `${proposed}-WB`
        warnings.push(`Client ref ${proposed} is already used by another CRM client; imported as ${ref}`)
      }
      takenRefs.add(ref)
      clientRef.set(i.key, ref)
      known.set(`clients:${i.key}`, 'pending')
      ops.push(insert(i, { ref, ...values }))
      clientMatching.new += 1
    }
  }

  // ── everything else, parents before children ──────────────────────────────
  const naturalSeen = new Set<string>()
  for (const table of TABLE_ORDER) {
    if (table === 'clients') continue
    for (const i of intents) {
      if (i.table !== table) continue
      const values: Record<string, CellIn> = {}
      let skip: string | null = null
      for (const [col, v] of Object.entries(i.values)) {
        if (isClient(v)) {
          const ref = clientRef.get(v.$client)
          if (ref === undefined) skip = `unknown client ${v.$client}`
          values[col] = ref ?? null
        } else if (isParent(v)) {
          const id = known.get(`${v.$parent.table}:${v.$parent.key}`)
          if (id === undefined) skip = `missing parent ${v.$parent.table} ${v.$parent.key}`
          values[col] = id === 'pending' ? v : id ?? null
        } else values[col] = v
      }
      if (skip) {
        skipped.push({ table, key: i.key, reason: skip })
        continue
      }
      const resolvable = i.match.length > 0 && i.match.every((c) => !isParent(values[c]))
      if (resolvable) {
        const nk = `${table}|${stable(i.match.map((c) => values[c]))}`
        if (naturalSeen.has(nk)) {
          skipped.push({ table, key: i.key, reason: 'duplicate of another row in this import' })
          continue
        }
        naturalSeen.add(nk)
      }
      let row: Row | undefined
      let matchedBy: MatchedBy | null = null
      const e = ext.get(`${table}:${i.key}`)
      if (e) {
        row = rowById(table, e.entity_id)
        if (row) matchedBy = 'external_id'
      }
      if (!row && resolvable) {
        row = prep(`SELECT * FROM ${q(table)} WHERE ${i.match.map((c) => `${q(c)} IS ?`).join(' AND ')} ORDER BY id LIMIT 1`)
          .get(...i.match.map((c) => values[c] as Scalar)) as Row | undefined
        if (row) matchedBy = 'natural_key'
      }
      if (row && matchedBy) {
        known.set(`${table}:${i.key}`, row.id as number)
        ops.push(merge(i, row, values, matchedBy))
      } else {
        known.set(`${table}:${i.key}`, 'pending')
        ops.push(insert(i, values))
      }
    }
  }
  if (recreated) warnings.push(`${recreated} row(s) imported before were deleted in the CRM and will be recreated`)

  const fp = createHash('sha256').update(sourceSystem)
  for (const o of ops) fp.update(stable([o.table, o.key, o.action, o.entityId, o.set, o.conflicts.map((c) => c.column)]))
  return { sourceSystem, ops, skipped, clientMatching, warnings, fingerprint: fp.digest('hex') }
}

// ── COMMIT ───────────────────────────────────────────────────────────────────

export interface CommitMeta {
  adapter: { id: string; version: string }
  file: { name: string; sha256: string; size: number }
  options: Record<string, unknown>
  committedBy: string | null
}

export interface CommitResult {
  batchId: number
  batchUid: string
  totals: { insert: number; update: number; unchanged: number; link: number; conflicts: number }
}

export function commitImport(
  db: Database, sourceSystem: string, intents: RowIntent[], expectedFingerprint: string, meta: CommitMeta
): CommitResult {
  return db.transaction((): CommitResult => {
    const plan = planImport(db, sourceSystem, intents)
    if (plan.fingerprint !== expectedFingerprint) throw new FingerprintMismatchError()
    const prep = statementCache(db)
    const batchUid = randomUUID()
    const batchId = Number(prep(`INSERT INTO import_batches (batch_uid, adapter_id, adapter_version, source_system, file_name,
      file_sha256, file_size, plan_fingerprint, options_json, status, committed_by) VALUES (?,?,?,?,?,?,?,?,?, 'committed', ?)`)
      .run(batchUid, meta.adapter.id, meta.adapter.version, sourceSystem, meta.file.name, meta.file.sha256, meta.file.size,
        plan.fingerprint, JSON.stringify(meta.options), meta.committedBy).lastInsertRowid)

    const ids = new Map<string, number>()
    for (const o of plan.ops) if (o.entityId !== null) ids.set(`${o.table}:${o.key}`, o.entityId)
    const resolve = (v: CellIn): Scalar => {
      if (!isParent(v)) return v as Scalar
      const id = ids.get(`${v.$parent.table}:${v.$parent.key}`)
      if (id === undefined) throw new Error(`Internal: unresolved parent ${v.$parent.table} ${v.$parent.key}`)
      return id
    }
    const resolveAll = (rec: Record<string, CellIn>): Record<string, Scalar> =>
      Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, resolve(v)]))
    const rowById = (table: string, id: number): Row => prep(`SELECT * FROM ${q(table)} WHERE id = ?`).get(id) as Row
    const hasUpdatedAt = new Map<string, boolean>()
    const journal = prep(`INSERT INTO import_changes (batch_id, entity_table, entity_id, external_key, action, before_json,
      after_json, external_id_created, prev_snapshot_json) VALUES (?,?,?,?,?,?,?,?,?)`)
    const mapExternal = prep(`INSERT INTO external_ids (source_system, entity_table, external_key, entity_id, snapshot_json,
      first_batch_id, last_batch_id) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT (source_system, entity_table, external_key) DO UPDATE SET entity_id = excluded.entity_id,
      snapshot_json = excluded.snapshot_json, last_batch_id = excluded.last_batch_id, updated_at = datetime('now')`)

    const totals = { insert: 0, update: 0, unchanged: 0, link: 0, conflicts: 0 }
    for (const o of plan.ops) {
      totals.conflicts += o.conflicts.length
      const snapshot = JSON.stringify(resolveAll(o.snapshot))
      const prev = o.prevMapping ? JSON.stringify(o.prevMapping) : null
      const created = o.prevMapping ? 0 : 1
      if (o.action === 'insert') {
        const rec = resolveAll(o.set)
        const c = Object.keys(rec)
        const id = Number(prep(`INSERT INTO ${q(o.table)} (${c.map(q).join(', ')}) VALUES (${c.map(() => '?').join(', ')})`)
          .run(...c.map((k) => rec[k])).lastInsertRowid)
        ids.set(`${o.table}:${o.key}`, id)
        journal.run(batchId, o.table, id, o.key, 'insert', null, JSON.stringify(rowById(o.table, id)), created, prev)
        mapExternal.run(sourceSystem, o.table, o.key, id, snapshot, batchId, batchId)
        totals.insert += 1
      } else if (o.action === 'update') {
        const rec = resolveAll(o.set)
        const c = Object.keys(rec)
        if (!hasUpdatedAt.has(o.table)) hasUpdatedAt.set(o.table, columnsOf(db, o.table).has('updated_at'))
        const before = JSON.stringify(rowById(o.table, o.entityId!))
        prep(`UPDATE ${q(o.table)} SET ${c.map((k) => `${q(k)} = ?`).join(', ')}${hasUpdatedAt.get(o.table) ? ", updated_at = datetime('now')" : ''} WHERE id = ?`)
          .run(...c.map((k) => rec[k]), o.entityId)
        journal.run(batchId, o.table, o.entityId, o.key, 'update', before, JSON.stringify(rowById(o.table, o.entityId!)), created, prev)
        mapExternal.run(sourceSystem, o.table, o.key, o.entityId, snapshot, batchId, batchId)
        totals.update += 1
      } else if (!o.prevMapping || o.prevMapping.entity_id !== o.entityId || stable(o.prevMapping.snapshot) !== stable(JSON.parse(snapshot))) {
        journal.run(batchId, o.table, o.entityId, o.key, 'link', null, null, created, prev)
        mapExternal.run(sourceSystem, o.table, o.key, o.entityId, snapshot, batchId, batchId)
        totals.link += 1
      } else totals.unchanged += 1
    }
    prep('UPDATE import_batches SET stats_json = ? WHERE id = ?').run(JSON.stringify({ totals, clientMatching: plan.clientMatching }), batchId)
    prep(`INSERT INTO audit_log (user_name, action, table_name, record_id, new_value) VALUES (?, 'Import committed', 'import_batches', ?, ?)`)
      .run(meta.committedBy, String(batchId), JSON.stringify({ file: meta.file.name, sha256: meta.file.sha256, totals }))
    return { batchId, batchUid, totals }
  })()
}

// ── ROLLBACK ─────────────────────────────────────────────────────────────────

/** Tables that can hold rows hanging off a client created by an import. */
const CLIENT_DEPENDENTS = [
  'tasks', 'interactions', 'payments', 'documents', 'wip_items', 'hmrc_submissions', 'aml_records', 'communication_log',
  'payment_receipts', 'onboarding_observations', 'personal_info', 'addresses', 'gdpr_consent', 'partnership_members',
  'trust_members', 'client_services', 'logins', 'client_contacts', 'client_aliases', 'compliance_periods',
  'payroll_schemes', 'pension_schemes', 'sa_registrations', 'client_income_sources'
]

interface ChangeRow {
  id: number
  entity_table: string
  entity_id: number
  external_key: string
  action: 'insert' | 'update' | 'link'
  before_json: string | null
  after_json: string | null
  external_id_created: number
  prev_snapshot_json: string | null
}

export function rollbackImport(
  db: Database, batchId: number, by: string | null, opts: { force?: boolean } = {}
): { batchId: number; reverted: number } {
  const batch = db.prepare('SELECT status, source_system FROM import_batches WHERE id = ?').get(batchId) as
    { status: string; source_system: string } | undefined
  if (!batch) throw new Error(`No import batch ${batchId}`)
  if (batch.status !== 'committed') throw new Error(`Import batch ${batchId} is ${batch.status}, not committed`)
  const latest = db.prepare("SELECT MAX(id) AS id FROM import_batches WHERE status = 'committed'").get() as { id: number }
  if (latest.id !== batchId) throw new Error('Only the most recent committed import can be rolled back — roll back later imports first.')

  const changes = db.prepare('SELECT * FROM import_changes WHERE batch_id = ? ORDER BY id DESC').all(batchId) as ChangeRow[]
  const rowById = (table: string, id: number): Row | undefined =>
    db.prepare(`SELECT * FROM ${q(table)} WHERE id = ?`).get(id) as Row | undefined
  const changed = (before: Row, after: Row): string[] =>
    Object.keys(after).filter((k) => k !== 'updated_at' && !same(before[k], after[k]))

  const insertedBy = new Map<string, Set<number>>()
  for (const ch of changes) {
    if (ch.action === 'insert') insertedBy.set(ch.entity_table, (insertedBy.get(ch.entity_table) ?? new Set()).add(ch.entity_id))
  }

  const problems: string[] = []
  for (const ch of changes) {
    if (ch.action === 'link') continue
    const current = rowById(ch.entity_table, ch.entity_id)
    const after = JSON.parse(ch.after_json ?? '{}') as Row
    if (!current) {
      if (ch.action === 'update') problems.push(`${ch.entity_table} #${ch.entity_id} (${ch.external_key}) was deleted after the import`)
      continue
    }
    const watch = ch.action === 'insert' ? Object.keys(after).filter((k) => k !== 'updated_at') : changed(JSON.parse(ch.before_json ?? '{}'), after)
    const edited = watch.filter((k) => !same(current[k], after[k]))
    if (edited.length) problems.push(`${ch.entity_table} #${ch.entity_id} (${ch.external_key}) edited after the import: ${edited.join(', ')}`)
    if (ch.entity_table === 'clients' && ch.action === 'insert') {
      for (const t of CLIENT_DEPENDENTS) {
        if (!columnsOf(db, t).has('client_ref')) continue
        const rows = db.prepare(`SELECT id FROM ${q(t)} WHERE client_ref = ?`).all(current.ref) as Array<{ id: number }>
        const later = rows.filter((r) => !insertedBy.get(t)?.has(r.id)).length
        if (later) problems.push(`client ${String(current.ref)} has ${later} ${t} row(s) created after the import`)
      }
    }
  }
  if (problems.length && !opts.force) throw new RollbackBlockedError(problems)

  db.transaction(() => {
    for (const ch of changes) {
      if (ch.action === 'insert') {
        db.prepare(`DELETE FROM ${q(ch.entity_table)} WHERE id = ?`).run(ch.entity_id)
      } else if (ch.action === 'update') {
        const before = JSON.parse(ch.before_json ?? '{}') as Row
        const cols = changed(before, JSON.parse(ch.after_json ?? '{}') as Row)
        if (cols.length) {
          db.prepare(`UPDATE ${q(ch.entity_table)} SET ${cols.map((c) => `${q(c)} = ?`).join(', ')} WHERE id = ?`)
            .run(...cols.map((c) => before[c] ?? null), ch.entity_id)
        }
      }
      if (ch.external_id_created) {
        db.prepare('DELETE FROM external_ids WHERE source_system = ? AND entity_table = ? AND external_key = ?')
          .run(batch.source_system, ch.entity_table, ch.external_key)
      } else if (ch.prev_snapshot_json) {
        const prev = JSON.parse(ch.prev_snapshot_json) as { entity_id: number; snapshot: Record<string, Scalar> }
        db.prepare(`UPDATE external_ids SET entity_id = ?, snapshot_json = ?, updated_at = datetime('now')
          WHERE source_system = ? AND entity_table = ? AND external_key = ?`)
          .run(prev.entity_id, JSON.stringify(prev.snapshot), batch.source_system, ch.entity_table, ch.external_key)
      }
    }
    db.prepare(`UPDATE import_batches SET status = 'rolled_back', rolled_back_at = datetime('now'), rolled_back_by = ? WHERE id = ?`)
      .run(by, batchId)
    db.prepare(`INSERT INTO audit_log (user_name, action, table_name, record_id, new_value) VALUES (?, 'Import rolled back', 'import_batches', ?, ?)`)
      .run(by, String(batchId), JSON.stringify({ reverted: changes.length, forced: !!opts.force && problems.length > 0 }))
  })()
  return { batchId, reverted: changes.length }
}

export function listImportBatches(db: Database): Row[] {
  return db.prepare('SELECT * FROM import_batches ORDER BY id DESC').all() as Row[]
}
