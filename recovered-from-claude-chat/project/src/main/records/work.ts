/**
 * Records held for clients — tasks, HMRC submissions, work in progress,
 * interactions, invoices and AML checks — one set of rules for all of them.
 *
 *   seeing     staff see the records of the clients assigned to them, and tasks
 *              assigned to them; partners and managers see everything
 *   adding     staff add records only for their own clients; a task with no client
 *              is the person's own (assigned to them unless they say otherwise)
 *   changing   the same scope; moving a record to another client needs access to both
 *   deleting   invoices, HMRC submissions and work in progress are records the
 *              practice must keep: only a partner deletes them
 *   names      a record's copy of the client name is taken from the client record,
 *              never from the screen, and shown from it when listing
 *   audit      every change, with the previous values of what changed
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import { auditChanges, auditRow, writeAudit, type Row } from '../access/audit'
import { clientForActor, idArg, isRetained, requirePartner, staffClients, UserFacingError, where, type Actor, type SqlPart } from '../access/policy'
import { checkMoney, clientName, columnsOf, friendly, pickColumns } from './common'

export type WorkTable = 'tasks' | 'hmrc_submissions' | 'wip_items' | 'interactions' | 'payments'

export interface WorkSpec {
  table: WorkTable
  /** "task", "invoice" — for messages and the audit log. */
  noun: string
  order: string
  /** Columns holding whole pence. */
  money?: readonly string[]
}

export const WORK: Readonly<Record<'tasks' | 'hmrc' | 'wip' | 'interactions' | 'payments', WorkSpec>> = {
  tasks: { table: 'tasks', noun: 'task', order: 't.due_date ASC, t.id DESC' },
  hmrc: { table: 'hmrc_submissions', noun: 'HMRC submission', order: 't.id DESC' },
  wip: { table: 'wip_items', noun: 'work-in-progress item', order: 't.id DESC' },
  interactions: { table: 'interactions', noun: 'interaction', order: 't.date DESC, t.id DESC' },
  payments: { table: 'payments', noun: 'invoice', order: 't.id DESC', money: ['amount_pence', 'vat_pence'] }
}

/** Rows the person may see: their clients' records, and (tasks) anything assigned to them. */
function scope(spec: WorkSpec, actor: Actor): SqlPart {
  const mine = staffClients(actor, 't.client_ref')
  if (!mine.sql || spec.table !== 'tasks') return mine
  return { sql: `${mine.sql} OR t.assigned_to = ?`, params: [...mine.params, actor.name] }
}

/** The select list: every column, with the client name read from the client record. */
function selectList(db: Database, spec: WorkSpec): string {
  const cols = [...columnsOf(db, spec.table)].filter((c) => c !== 'client_name').map((c) => `t."${c}"`)
  const own = columnsOf(db, spec.table).has('client_name') ? 'COALESCE(c.client_name, t.client_name)' : 'c.client_name'
  return `${cols.join(', ')}, ${own} AS client_name`
}

export function listWork(db: Database, actor: Actor, spec: WorkSpec, clientRef?: unknown): Row[] {
  const parts: SqlPart[] = [scope(spec, actor)]
  if (typeof clientRef === 'string' && clientRef !== '') {
    clientForActor(db, clientRef, actor)
    parts.push({ sql: 't.client_ref = ?', params: [clientRef] })
  }
  const w = where(...parts)
  return db.prepare(`SELECT ${selectList(db, spec)} FROM ${spec.table} t LEFT JOIN clients c ON c.ref = t.client_ref${w.sql} ORDER BY ${spec.order}`)
    .all(...w.params) as Row[]
}

/** Throws unless the person may work on this record. */
function checkAccess(db: Database, actor: Actor, spec: WorkSpec, row: Row): void {
  const ref = typeof row.client_ref === 'string' && row.client_ref !== '' ? row.client_ref : null
  if (actor.role !== 'staff') return
  if (spec.table === 'tasks' && row.assigned_to === actor.name) return
  if (ref) {
    clientForActor(db, ref, actor)
    return
  }
  throw new UserFacingError(`Only partners and managers can work on a ${spec.noun} that isn’t for a client.`)
}

function load(db: Database, spec: WorkSpec, id: number): Row {
  const row = db.prepare(`SELECT * FROM ${spec.table} WHERE id = ?`).get(id) as Row | undefined
  if (!row) throw new UserFacingError(`That ${spec.noun} no longer exists.`)
  return row
}

/** Validates what a screen sends and fills in what the app, not the screen, decides. */
function prepare(db: Database, actor: Actor, spec: WorkSpec, input: unknown, creating: boolean): Row {
  const values = pickColumns(db, spec.table, input)
  if (spec.money) checkMoney(spec.table, values, spec.money)
  if ('client_ref' in values) {
    const ref = typeof values.client_ref === 'string' ? values.client_ref.trim() : values.client_ref
    if (ref === '' || ref === null || ref === undefined) values.client_ref = null
    else {
      const client = clientForActor(db, String(ref), actor)
      values.client_ref = client.ref
    }
  }
  const ref = values.client_ref as string | null | undefined
  if (columnsOf(db, spec.table).has('client_name') && ref !== undefined) values.client_name = ref ? clientName(db, ref) : null
  else delete values.client_name
  if (creating && !ref && actor.role === 'staff') {
    if (spec.table !== 'tasks') throw new UserFacingError(`Choose the client this ${spec.noun} is for.`)
    if (!values.assigned_to) values.assigned_to = actor.name
  }
  return values
}

export function createWork(db: Database, actor: Actor, spec: WorkSpec, input: unknown): { id: number } {
  const values = prepare(db, actor, spec, input, true)
  const cols = Object.keys(values)
  if (cols.length === 0) throw new UserFacingError('Nothing to save.')
  return db.transaction(() => {
    let id: number
    try {
      id = Number(db.prepare(`INSERT INTO ${spec.table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(...cols.map((c) => values[c])).lastInsertRowid)
    } catch (err) {
      friendly(err, spec.table)
    }
    const row = load(db, spec, id)
    writeAudit(db, actor, `Created ${spec.noun}`, spec.table, id, null, auditRow(spec.table, row))
    return { id }
  })()
}

export function updateWork(db: Database, actor: Actor, spec: WorkSpec, id: unknown, input: unknown): void {
  const rowId = idArg(id, spec.noun)
  const before = load(db, spec, rowId)
  checkAccess(db, actor, spec, before)
  const values = prepare(db, actor, spec, input, false)
  const cols = Object.keys(values).filter((c) => (values[c] ?? null) !== (before[c] ?? null))
  if (cols.length === 0) return
  const stamp = columnsOf(db, spec.table).has('updated_at') ? `, updated_at = datetime('now')` : ''
  db.transaction(() => {
    try {
      db.prepare(`UPDATE ${spec.table} SET ${cols.map((c) => `"${c}" = ?`).join(', ')}${stamp} WHERE id = ?`).run(...cols.map((c) => values[c]), rowId)
    } catch (err) {
      friendly(err, spec.table)
    }
    const after = load(db, spec, rowId)
    // A member of staff may not move a record somewhere they couldn't then see it.
    if (actor.role === 'staff') checkAccess(db, actor, spec, after)
    const diff = auditChanges(spec.table, before, after)
    if (diff) writeAudit(db, actor, `Updated ${spec.noun}`, spec.table, rowId, diff.before, diff.after)
  })()
}

export function deleteWork(db: Database, actor: Actor, spec: WorkSpec, id: unknown): void {
  const rowId = idArg(id, spec.noun)
  const before = load(db, spec, rowId)
  if (isRetained(spec.table)) requirePartner(actor, `delete ${spec.noun === 'work-in-progress item' ? 'work in progress' : `${spec.noun}s`} — the practice must keep them`)
  checkAccess(db, actor, spec, before)
  db.transaction(() => {
    db.prepare(`DELETE FROM ${spec.table} WHERE id = ?`).run(rowId)
    writeAudit(db, actor, `Deleted ${spec.noun}`, spec.table, rowId, auditRow(spec.table, before), null)
  })()
}

// ── AML checks: one per client ───────────────────────────────────────────────

export function listAml(db: Database, actor: Actor): Row[] {
  const w = where(staffClients(actor, 't.client_ref'))
  const cols = [...columnsOf(db, 'aml_records')].filter((c) => c !== 'client_name').map((c) => `t."${c}"`)
  return db.prepare(`SELECT ${cols.join(', ')}, COALESCE(c.client_name, t.client_name) AS client_name
      FROM aml_records t LEFT JOIN clients c ON c.ref = t.client_ref${w.sql} ORDER BY client_name COLLATE NOCASE ASC`).all(...w.params) as Row[]
}

/** Saves a client's AML check, adding it the first time. */
export function upsertAml(db: Database, actor: Actor, input: unknown): { id: number } {
  const values = pickColumns(db, 'aml_records', input)
  if (typeof values.client_ref !== 'string' || !values.client_ref) throw new UserFacingError('Choose the client this check is for.')
  const client = clientForActor(db, values.client_ref, actor)
  values.client_ref = client.ref
  values.client_name = client.client_name
  return db.transaction(() => {
    const before = db.prepare('SELECT * FROM aml_records WHERE client_ref = ?').get(client.ref) as Row | undefined
    const cols = Object.keys(values)
    try {
      if (before) {
        const set = cols.filter((c) => c !== 'client_ref' && (values[c] ?? null) !== (before[c] ?? null))
        if (set.length) {
          db.prepare(`UPDATE aml_records SET ${set.map((c) => `"${c}" = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
            .run(...set.map((c) => values[c]), before.id)
        }
      } else {
        db.prepare(`INSERT INTO aml_records (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => values[c]))
      }
    } catch (err) {
      friendly(err, 'aml_records')
    }
    const after = db.prepare('SELECT * FROM aml_records WHERE client_ref = ?').get(client.ref) as Row
    if (!before) writeAudit(db, actor, 'Created AML check', 'aml_records', after.id as number, null, auditRow('aml_records', after))
    else {
      const diff = auditChanges('aml_records', before, after)
      if (diff) writeAudit(db, actor, 'Updated AML check', 'aml_records', after.id as number, diff.before, diff.after)
    }
    return { id: after.id as number }
  })()
}

/** Whether the person may delete records of this kind — for screens deciding what to show. */
export const canDeleteWork = (actor: Actor, spec: WorkSpec): boolean => !isRetained(spec.table) || actor.role === 'partner'
