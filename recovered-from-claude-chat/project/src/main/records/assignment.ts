/**
 * Client assignment: which member of staff looks after a client.
 *
 * clients.assigned_to holds the person's name exactly as their account has it,
 * and that is what limits a member of staff to their own clients. So only a
 * partner or manager assigns, and only to an active person with an account (or
 * to nobody). Assigning a client also moves its services, open deadlines, open
 * tasks and work in progress — the ones that were with the previous person or
 * with nobody. Anything deliberately given to someone else stays with them.
 *
 * Every change is in one transaction with one audit entry per client.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { AssignableUser, ClientAssignmentInput, ClientAssignmentResult } from '../../shared/types'
import { writeAudit } from '../access/audit'
import { canManage, requireManager, UserFacingError, type Actor } from '../access/policy'

const MAX_CLIENTS = 5000

/** Active people with an account, for the assignment picker. Empty for staff. */
export function assignableUsers(db: Database, actor: Actor): AssignableUser[] {
  if (!canManage(actor)) return []
  return db.prepare('SELECT id, name, role FROM users WHERE active = 1 ORDER BY name COLLATE NOCASE').all() as AssignableUser[]
}

/**
 * The exact name to store for an assignment typed or picked on a screen:
 * null/empty → nobody; otherwise an active person's name (matched ignoring case
 * and surrounding spaces). Anything else is refused, because a name nobody
 * signs in with would hide the client from every member of staff.
 */
export function assigneeName(db: Database, value: unknown): string | null {
  if (value === null || value === undefined) return null
  const typed = String(value).trim()
  if (!typed) return null
  const rows = db
    .prepare('SELECT name FROM users WHERE active = 1 AND lower(trim(name)) = lower(?)')
    .all(typed) as Array<{ name: string }>
  if (rows.length === 1) return rows[0].name
  if (rows.length > 1) throw new UserFacingError(`More than one person is called ${typed}. Ask a partner to make their names different.`)
  throw new UserFacingError(`${typed} has no active account in this app, so they couldn’t see the client. Choose someone from the list.`)
}

interface ClientRow {
  id: number
  ref: string | null
  client_name: string
  assigned_to: string | null
}

/** What follows a client to its new person: the records still open, by kind. */
const FOLLOWS: ReadonlyArray<{ key: 'services' | 'deadlines' | 'tasks' | 'wip'; table: string; option: 'moveServices' | 'moveDeadlines' | 'moveWork'; open: string }> = [
  { key: 'services', table: 'client_services', option: 'moveServices', open: 'active = 1' },
  {
    key: 'deadlines', table: 'compliance_periods', option: 'moveDeadlines',
    open: "archived = 0 AND filed_date IS NULL AND status NOT IN ('filed', 'not_applicable')"
  },
  { key: 'tasks', table: 'tasks', option: 'moveWork', open: "lower(COALESCE(status, '')) NOT IN ('completed', 'done', 'cancelled')" },
  { key: 'wip', table: 'wip_items', option: 'moveWork', open: "lower(COALESCE(status, '')) NOT IN ('completed', 'done', 'billed', 'cancelled')" }
]

export type MovedCounts = Record<(typeof FOLLOWS)[number]['key'], number>

/**
 * Moves one client (already loaded) to `name`, with its services, open
 * deadlines, open tasks and work in progress — those that were with the previous
 * person or with nobody. Call inside a transaction. Returns what moved; null if
 * the client was already with that person. The audit entry lists every record
 * moved and who had it, so the move can be traced and undone.
 */
export function moveClient(
  db: Database,
  actor: Actor,
  client: ClientRow,
  name: string | null,
  options: { moveServices?: boolean; moveDeadlines?: boolean; moveWork?: boolean } = {}
): MovedCounts | null {
  const previous = client.assigned_to
  if ((previous ?? null) === name) return null
  db.prepare("UPDATE clients SET assigned_to = ?, updated_at = datetime('now') WHERE id = ?").run(name, client.id)
  const counts: MovedCounts = { services: 0, deadlines: 0, tasks: 0, wip: 0 }
  const movedFrom: Record<string, Record<string, string | null>> = {}
  if (client.ref) {
    // "With the previous person or with nobody": a deliberate exception stays put.
    const followed = `(assigned_to IS NULL OR trim(assigned_to) = ''${previous ? ' OR assigned_to = ?' : ''})`
    for (const f of FOLLOWS) {
      if (options[f.option] === false) continue
      const rows = db.prepare(`SELECT id, assigned_to FROM ${f.table} WHERE client_ref = ? AND ${f.open} AND ${followed}`)
        .all(...(previous ? [client.ref, previous] : [client.ref])) as Array<{ id: number; assigned_to: string | null }>
      if (!rows.length) continue
      const update = db.prepare(`UPDATE ${f.table} SET assigned_to = ?, updated_at = datetime('now') WHERE id = ?`)
      for (const r of rows) update.run(name, r.id)
      counts[f.key] = rows.length
      movedFrom[f.table] = Object.fromEntries(rows.map((r) => [String(r.id), r.assigned_to]))
    }
  }
  writeAudit(db, actor, 'Assigned client', 'clients', client.id,
    { client_ref: client.ref, assigned_to: previous },
    {
      client_ref: client.ref, assigned_to: name,
      services_moved: counts.services, deadlines_moved: counts.deadlines, tasks_moved: counts.tasks, wip_moved: counts.wip,
      ...(Object.keys(movedFrom).length ? { moved_from: movedFrom } : {})
    })
  return counts
}

/** Assigns one client or many to a person (or to nobody). Partners and managers only. */
export function assignClients(db: Database, actor: Actor, input: ClientAssignmentInput): ClientAssignmentResult {
  requireManager(actor, 'assign clients')
  const refs = [...new Set((Array.isArray(input?.clientRefs) ? input.clientRefs : []).filter((r): r is string => typeof r === 'string' && r.trim() !== ''))]
  if (refs.length === 0) throw new UserFacingError('Choose the clients to assign.')
  if (refs.length > MAX_CLIENTS) throw new UserFacingError(`Assign at most ${MAX_CLIENTS} clients at a time.`)
  let name: string | null = null
  if (input.userId !== null && input.userId !== undefined) {
    if (typeof input.userId !== 'number' || !Number.isInteger(input.userId)) throw new UserFacingError('Choose who to assign them to.')
    const user = db.prepare('SELECT name, active FROM users WHERE id = ?').get(input.userId) as { name: string; active: number } | undefined
    if (!user || !user.active) throw new UserFacingError('That person’s account isn’t active, so they couldn’t see the clients.')
    name = user.name
  }
  return db.transaction((): ClientAssignmentResult => {
    const result: ClientAssignmentResult = { clients: 0, unchanged: 0, services: 0, deadlines: 0, tasks: 0, wip: 0, assignedTo: name }
    const find = db.prepare('SELECT id, ref, client_name, assigned_to FROM clients WHERE ref = ?')
    for (const ref of refs) {
      const client = find.get(ref) as ClientRow | undefined
      if (!client) throw new UserFacingError(`Client ${ref} no longer exists. Nothing was changed.`)
      const moved = moveClient(db, actor, client, name, input)
      if (!moved) {
        result.unchanged += 1
        continue
      }
      result.clients += 1
      result.services += moved.services
      result.deadlines += moved.deadlines
      result.tasks += moved.tasks
      result.wip += moved.wip
    }
    return result
  })()
}
