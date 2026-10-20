/**
 * Clients, their services, and partners and trustees — the rules, as plain
 * functions over the database and the acting person.
 *
 *   seeing      staff see the clients assigned to them; partners and managers see all
 *   changing    the same; changing a client's code, or who it is assigned to, is for
 *               partners and managers
 *   creating    a client a member of staff adds is assigned to them, so they can see it;
 *               a client added without a code gets one (CL0042), since every record
 *               held for a client hangs off its code
 *   deleting    partners and managers only, and never a client with records the
 *               practice must keep (set their status to Former client instead)
 *   money       whole pence
 *   audit       every change, with the previous values of what changed
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { Client, ClientService, PartnershipMember, TrustMember } from '../../shared/types'
import { auditChanges, auditRow, writeAudit, type Row } from '../access/audit'
import { canManage, clientById, clientForActor, RETAINED_TABLES, refArg, requireManager, UserFacingError, where, type Actor } from '../access/policy'
import { assigneeName, moveClient } from './assignment'
import { checkMoney, columnsOf, friendly, pickColumns, SYSTEM_COLUMNS, textOrNull } from './common'

const MAX_IMPORT = 5000

/** The person's clients, by name, each with its other names (trading, former, also known as) so searches find them. */
export function listClients(db: Database, actor: Actor): Client[] {
  const scope = where(actor.role === 'staff' ? { sql: 'c.assigned_to = ?', params: [actor.name] } : { sql: '', params: [] })
  return db.prepare(`SELECT c.*, (SELECT group_concat(a.alias, ' | ') FROM client_aliases a WHERE a.client_ref = c.ref) AS other_names
      FROM clients c${scope.sql} ORDER BY c.client_name COLLATE NOCASE ASC`).all(...scope.params) as Client[]
}

/** A free client code for a new client with none: CL plus its id (CL0042), with a suffix if that is taken. */
function newClientCode(db: Database, id: number): string {
  const base = `CL${String(id).padStart(4, '0')}`
  const taken = db.prepare('SELECT 1 FROM clients WHERE ref = ?')
  if (!taken.get(base)) return base
  for (let n = 2; ; n += 1) if (!taken.get(`${base}-${n}`)) return `${base}-${n}`
}

/** By id (number) or client code (string). Null when there is no such client. */
export function getClient(db: Database, actor: Actor, idOrRef: unknown): Client | null {
  if (typeof idOrRef === 'string') {
    const row = db.prepare('SELECT * FROM clients WHERE ref = ?').get(refArg(idOrRef)) as Client | undefined
    if (!row) return null
    clientForActor(db, idOrRef, actor)
    return row
  }
  const found = clientById(db, idOrRef, actor)
  return found ? (db.prepare('SELECT * FROM clients WHERE id = ?').get(found.id) as Client) : null
}

function cleanClientValues(db: Database, input: unknown): Record<string, unknown> {
  const values = pickColumns(db, 'clients', input)
  checkMoney('clients', values, ['annual_fee_pence'])
  if ('client_name' in values) {
    const name = textOrNull(values.client_name, 'The client name', 300)
    if (!name) throw new UserFacingError('Enter the client’s name.')
    values.client_name = name
  }
  if ('ref' in values) {
    const ref = textOrNull(values.ref, 'The client code', 64)
    values.ref = ref
  }
  return values
}

export function createClient(db: Database, actor: Actor, input: unknown): { id: number; ref: string | null } {
  const values = cleanClientValues(db, input)
  if (!values.client_name) throw new UserFacingError('Enter the client’s name.')
  // A member of staff's new client is theirs; otherwise it must be someone with an account, or nobody.
  values.assigned_to = canManage(actor) ? assigneeName(db, values.assigned_to) : actor.name
  const cols = Object.keys(values)
  return db.transaction(() => {
    let id: number
    try {
      id = Number(db.prepare(`INSERT INTO clients (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(...cols.map((c) => values[c])).lastInsertRowid)
    } catch (err) {
      friendly(err, 'clients')
    }
    if (!values.ref) db.prepare('UPDATE clients SET ref = ? WHERE id = ?').run(newClientCode(db, id), id)
    const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Row
    writeAudit(db, actor, 'Created client', 'clients', id, null, auditRow('clients', row))
    return { id, ref: (row.ref as string | null) ?? null }
  })()
}

export function updateClient(db: Database, actor: Actor, id: unknown, input: unknown): void {
  const found = clientById(db, id, actor)
  if (!found) throw new UserFacingError('That client no longer exists.')
  const values = cleanClientValues(db, input)
  const before = db.prepare('SELECT * FROM clients WHERE id = ?').get(found.id) as Row
  if ('ref' in values && (values.ref ?? null) !== (before.ref ?? null)) {
    requireManager(actor, 'change a client’s code')
    // Invoices, documents and history are kept under the code; clearing it would leave them with no client.
    if (values.ref === null) throw new UserFacingError('A client’s code can be changed, but not removed: their records are kept under it.')
  }
  let assignTo: string | null | undefined
  if ('assigned_to' in values) {
    const typed = values.assigned_to
    delete values.assigned_to
    const unchanged = (typed ?? '') === (before.assigned_to ?? '') || (typeof typed === 'string' && typed.trim() === (before.assigned_to ?? ''))
    if (!unchanged) {
      requireManager(actor, 'assign clients')
      assignTo = assigneeName(db, typed)
    }
  }
  db.transaction(() => {
    const cols = Object.keys(values).filter((c) => (values[c] ?? null) !== (before[c] ?? null))
    if (cols.length) {
      try {
        db.prepare(`UPDATE clients SET ${cols.map((c) => `"${c}" = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
          .run(...cols.map((c) => values[c]), found.id)
      } catch (err) {
        friendly(err, 'clients')
      }
      const after = db.prepare('SELECT * FROM clients WHERE id = ?').get(found.id) as Row
      const diff = auditChanges('clients', before, after, ['ref', 'client_name'])
      if (diff) writeAudit(db, actor, 'Updated client', 'clients', found.id, diff.before, diff.after)
    }
    if (assignTo !== undefined) {
      const now = db.prepare('SELECT id, ref, client_name, assigned_to FROM clients WHERE id = ?').get(found.id) as {
        id: number; ref: string | null; client_name: string; assigned_to: string | null
      }
      moveClient(db, actor, now, assignTo)
    }
  })()
}

interface Dependant {
  table: string
  from: string
  to: string
  onDelete: string
}
const dependantsCache = new WeakMap<Database, Map<string, Dependant[]>>()

/** Tables whose rows point at `parent` through a foreign key, read from the schema. */
function dependantsOf(db: Database, parent: string): Dependant[] {
  let byParent = dependantsCache.get(db)
  if (!byParent) {
    byParent = new Map()
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>
    for (const { name } of tables) {
      const fks = db.prepare(`PRAGMA foreign_key_list("${name.replace(/"/g, '""')}")`).all() as Array<{ table: string; from: string; to: string | null; on_delete: string }>
      for (const fk of fks) {
        const list = byParent.get(fk.table) ?? []
        list.push({ table: name, from: fk.from, to: fk.to ?? 'rowid', onDelete: fk.on_delete.toUpperCase() })
        byParent.set(fk.table, list)
      }
    }
    dependantsCache.set(db, byParent)
  }
  return byParent.get(parent) ?? []
}

/**
 * How many rows deleting these `parent` rows would remove (ON DELETE CASCADE, at
 * every level) or unlink (SET NULL), by table — for the audit entry.
 */
function deletionReach(db: Database, parent: string, where: string, params: unknown[], removed: Record<string, number>, unlinked: Record<string, number>, depth = 0): void {
  if (depth > 5) return
  for (const d of dependantsOf(db, parent)) {
    if (d.onDelete !== 'CASCADE' && d.onDelete !== 'SET NULL') continue
    const sub = `"${d.from}" IN (SELECT "${d.to}" FROM "${parent}" WHERE ${where})`
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM "${d.table}" WHERE ${sub}`).get(...params) as { n: number }
    if (!n) continue
    if (d.onDelete === 'SET NULL') {
      unlinked[d.table] = (unlinked[d.table] ?? 0) + n
      continue
    }
    removed[d.table] = (removed[d.table] ?? 0) + n
    deletionReach(db, d.table, sub, params, removed, unlinked, depth + 1)
  }
}

export function deleteClient(db: Database, actor: Actor, id: unknown): void {
  requireManager(actor, 'delete clients')
  const found = clientById(db, id, actor)
  if (!found) throw new UserFacingError('That client no longer exists.')
  if (found.ref) {
    const held = RETAINED_TABLES
      .map((t) => ({ t, n: (db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE client_ref = ?`).get(found.ref) as { n: number }).n }))
      .filter((x) => x.n > 0)
    if (held.length) {
      throw new UserFacingError(
        `This client has records the practice must keep (${held.map((x) => `${x.n} ${x.t.replace(/_/g, ' ')}`).join(', ')}). Set their status to Former client instead of deleting them.`
      )
    }
  }
  db.transaction(() => {
    const before = db.prepare('SELECT * FROM clients WHERE id = ?').get(found.id) as Row
    // Everything else that belongs to the client goes with it, through its foreign keys (migration 0010);
    // the audit entry says how much went, and what was only unlinked.
    const removed: Record<string, number> = {}
    const unlinked: Record<string, number> = {}
    deletionReach(db, 'clients', 'id = ?', [found.id], removed, unlinked)
    db.prepare('DELETE FROM clients WHERE id = ?').run(found.id)
    writeAudit(db, actor, 'Deleted client', 'clients', found.id, auditRow('clients', before), {
      records_removed: removed, ...(Object.keys(unlinked).length ? { records_unlinked: unlinked } : {})
    })
  })()
}

/**
 * Adds many clients pasted from a spreadsheet. Partners and managers. A client
 * code already in use is skipped; an "assigned to" name with no account here is
 * left unassigned (and counted), since nobody could see the client otherwise.
 */
export function importClients(db: Database, actor: Actor, rows: unknown): { count: number; skipped: number; unassigned: number } {
  requireManager(actor, 'import clients')
  if (!Array.isArray(rows)) throw new UserFacingError('Nothing to import.')
  if (rows.length > MAX_IMPORT) throw new UserFacingError(`Import at most ${MAX_IMPORT} clients at a time.`)
  return db.transaction(() => {
    let count = 0
    let skipped = 0
    let unassigned = 0
    for (const [i, raw] of rows.entries()) {
      let values: Record<string, unknown>
      let problems: Map<string, string | null>
      try {
        values = cleanClientValues(db, raw)
        if (!values.client_name) throw new UserFacingError('Enter the client’s name.')
        problems = keepClientReferences(values, null)
      } catch (err) {
        if (err instanceof UserFacingError) throw new UserFacingError(`Row ${i + 1}: ${err.message} Nothing was imported.`)
        throw err
      }
      try {
        values.assigned_to = assigneeName(db, values.assigned_to)
      } catch (err) {
        if (!(err instanceof UserFacingError)) throw err
        values.assigned_to = null
        unassigned += 1
      }
      const cols = Object.keys(values)
      const res = db.prepare(`INSERT OR IGNORE INTO clients (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(...cols.map((c) => values[c]))
      if (res.changes) {
        count += 1
        const id = Number(res.lastInsertRowid)
        if (!values.ref) db.prepare('UPDATE clients SET ref = ? WHERE id = ?').run(newClientCode(db, id), id)
        const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Row
        flagClientReferences(db, actor, id, row.ref as string, problems, row)
      } else skipped += 1
    }
    writeAudit(db, actor, 'Imported clients from a spreadsheet', 'clients', null, null, { added: count, skipped_existing: skipped, left_unassigned: unassigned })
    return { count, skipped, unassigned }
  })()
}

// ── Services ─────────────────────────────────────────────────────────────────

export function listServices(db: Database, actor: Actor, clientRef: unknown): ClientService[] {
  const client = clientForActor(db, refArg(clientRef), actor)
  return db.prepare('SELECT * FROM client_services WHERE client_ref = ? ORDER BY service_type ASC').all(client.ref) as ClientService[]
}

/** Adds a service to a client, or changes it (one row per client and service type). */
export function upsertService(db: Database, actor: Actor, input: unknown): { id: number } {
  const values = pickColumns(db, 'client_services', input)
  const client = clientForActor(db, refArg(values.client_ref), actor)
  const type = textOrNull(values.service_type, 'The service', 80)
  if (!type) throw new UserFacingError('Choose the service.')
  values.client_ref = client.ref
  values.service_type = type
  checkMoney('client_services', values, ['fee_pence'])
  if ('assigned_to' in values && canManage(actor)) values.assigned_to = assigneeName(db, values.assigned_to)
  else if ('assigned_to' in values) delete values.assigned_to // who does the work is set by partners and managers
  return db.transaction(() => {
    const before = db.prepare('SELECT * FROM client_services WHERE client_ref = ? AND service_type = ?').get(client.ref, type) as Row | undefined
    const cols = Object.keys(values)
    try {
      if (before) {
        const set = cols.filter((c) => c !== 'client_ref' && c !== 'service_type')
        if (set.length) {
          db.prepare(`UPDATE client_services SET ${set.map((c) => `"${c}" = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
            .run(...set.map((c) => values[c]), before.id)
        }
      } else {
        db.prepare(`INSERT INTO client_services (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
          .run(...cols.map((c) => values[c]))
      }
    } catch (err) {
      friendly(err, 'client_services')
    }
    const after = db.prepare('SELECT * FROM client_services WHERE client_ref = ? AND service_type = ?').get(client.ref, type) as Row
    if (!before) writeAudit(db, actor, 'Added client service', 'client_services', after.id as number, null, auditRow('client_services', after))
    else {
      const diff = auditChanges('client_services', before, after, ['client_ref', 'service_type'])
      if (diff) writeAudit(db, actor, 'Updated client service', 'client_services', after.id as number, diff.before, diff.after)
    }
    return { id: after.id as number }
  })()
}

export function deleteService(db: Database, actor: Actor, id: unknown): void {
  if (typeof id !== 'number' || !Number.isInteger(id)) throw new UserFacingError('That isn’t a service.')
  const before = db.prepare('SELECT * FROM client_services WHERE id = ?').get(id) as Row | undefined
  if (!before) throw new UserFacingError('That service no longer exists.')
  clientForActor(db, before.client_ref as string, actor)
  db.transaction(() => {
    db.prepare('DELETE FROM client_services WHERE id = ?').run(id)
    writeAudit(db, actor, 'Removed client service', 'client_services', id, auditRow('client_services', before), null)
  })()
}

// ── Partners and trustees ────────────────────────────────────────────────────

type MemberTable = 'partnership_members' | 'trust_members'

export function listMembers(db: Database, actor: Actor, table: MemberTable, clientRef: unknown): Array<PartnershipMember | TrustMember> {
  const client = clientForActor(db, refArg(clientRef), actor)
  const order = table === 'trust_members' ? 'member_type, id' : 'id'
  return db.prepare(`SELECT * FROM ${table} WHERE client_ref = ? ORDER BY ${order} ASC`).all(client.ref) as Array<PartnershipMember | TrustMember>
}

/** Replaces the client's whole list, recording the list before and after. */
export function saveMembers(db: Database, actor: Actor, table: MemberTable, clientRef: unknown, members: unknown): { count: number } {
  const client = clientForActor(db, refArg(clientRef), actor)
  if (!Array.isArray(members)) throw new UserFacingError('Nothing to save.')
  if (members.length > 500) throw new UserFacingError('That is more people than one client can have.')
  const rows = members.map((m) => {
    const values = pickColumns(db, table, m, [...SYSTEM_COLUMNS, 'client_ref'])
    if (table === 'partnership_members') checkMoney(table, values, ['capital_pence'], ['capital_pence'])
    const name = textOrNull(values.name, 'The name', 200)
    if (!name) throw new UserFacingError('Every person needs a name.')
    values.name = name
    return values
  })
  const known = columnsOf(db, table)
  return db.transaction(() => {
    const before = db.prepare(`SELECT * FROM ${table} WHERE client_ref = ? ORDER BY id`).all(client.ref) as Row[]
    db.prepare(`DELETE FROM ${table} WHERE client_ref = ?`).run(client.ref)
    for (const values of rows) {
      const cols = ['client_ref', ...Object.keys(values).filter((c) => known.has(c))]
      const all: Row = { ...values, client_ref: client.ref }
      try {
        db.prepare(`INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => all[c]))
      } catch (err) {
        friendly(err, table)
      }
    }
    const after = db.prepare(`SELECT * FROM ${table} WHERE client_ref = ? ORDER BY id`).all(client.ref) as Row[]
    const strip = (r: Row): Row => {
      const out = auditRow(table, r) as Row
      delete out.id
      return out
    }
    const b = before.map(strip)
    const a = after.map(strip)
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      writeAudit(db, actor, table === 'trust_members' ? 'Updated trustees and beneficiaries' : 'Updated partners', table, client.ref,
        { client_ref: client.ref, people: b }, { client_ref: client.ref, people: a })
    }
    return { count: after.length }
  })()
}
