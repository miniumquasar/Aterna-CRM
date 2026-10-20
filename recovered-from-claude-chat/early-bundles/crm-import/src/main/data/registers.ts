/**
 * Read-only access to every register, driven by the data dictionary
 * (src/shared/data-model.ts).
 *
 *   - Only tables the dictionary describes, and only those the person may browse.
 *   - Column names come from the database itself, never from the screen.
 *   - Hidden columns never leave this process; masked columns leave as their last
 *     two characters and can't be searched or sorted (so they can't be probed).
 *   - Staff see their own clients' rows only, including through a parent table
 *     (payroll years) or an entity link (custom field values).
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type {
  ClientFile,
  ClientOverview,
  RegisterCatalogue,
  RegisterColumn,
  RegisterPage,
  RegisterQuery,
  RegisterValue
} from '../../shared/types'
import { columnLabel, columnTreatment, DOMAINS, maskValue, tableSpec, TABLES, type TableSpec } from '../../shared/data-model'
import { canManage, clientForActor, UserFacingError, type Actor } from '../references/service'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500
const CLIENT_FILE_ROWS = 25

const quote = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`

const mayBrowse = (spec: TableSpec, actor: Actor): boolean =>
  spec.browse === 'everyone' || (spec.browse === 'managers' && canManage(actor))

function tableExists(db: Database, table: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined
}

function columnsOf(db: Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${quote(table)})`).all() as Array<{ name: string }>).map((c) => c.name)
}

/** Entity tables whose custom field values belong to a client, and how. */
const ENTITY_LINKS: ReadonlyArray<{ entity: string; key: string; clientColumn: string }> = [
  { entity: 'clients', key: 'id', clientColumn: 'ref' },
  { entity: 'client_contacts', key: 'id', clientColumn: 'client_ref' },
  { entity: 'compliance_periods', key: 'id', clientColumn: 'client_ref' }
]

interface Where {
  sql: string
  params: unknown[]
}

/**
 * Restricts rows to one client and/or to a member of staff's clients. Returns
 * null when a client filter is asked of a table that has no client link.
 */
function clientScope(spec: TableSpec, actor: Actor, clientRef: string | undefined): Where | null {
  const staff = actor.role === 'staff'
  if (!clientRef && !staff) return { sql: '', params: [] }
  if (!spec.client) return clientRef ? null : { sql: '', params: [] } // practice lists: no client to scope by

  const refs: Where[] = []
  if (clientRef) refs.push({ sql: '?', params: [clientRef] })
  if (staff) refs.push({ sql: 'SELECT ref FROM clients WHERE assigned_to = ?', params: [actor.name] })
  // every restriction must hold: the client asked for, and (for staff) one of theirs
  const parts: Where[] = refs.map((r) => {
    const inRefs = (column: string): Where => ({ sql: `t.${quote(column)} IN (${r.sql})`, params: [...r.params] })
    const link = spec.client!
    if (link.kind === 'column') {
      const main = inRefs(link.column)
      if (!spec.alsoClient) return main
      const also = inRefs(spec.alsoClient)
      return { sql: `(${main.sql} OR ${also.sql})`, params: [...main.params, ...also.params] }
    }
    if (link.kind === 'via') {
      return {
        sql: `t.${quote(link.column)} IN (SELECT ${quote(link.key)} FROM ${quote(link.table)} WHERE ${quote(link.clientColumn)} IN (${r.sql}))`,
        params: [...r.params]
      }
    }
    const ors = ENTITY_LINKS.map((e) => ({
      sql: `(t.${quote(link.tableColumn)} = '${e.entity}' AND t.${quote(link.idColumn)} IN (SELECT ${quote(e.key)} FROM ${quote(e.entity)} WHERE ${quote(e.clientColumn)} IN (${r.sql})))`,
      params: [...r.params]
    }))
    return { sql: `(${ors.map((o) => o.sql).join(' OR ')})`, params: ors.flatMap((o) => o.params) }
  })
  return { sql: parts.map((p) => p.sql).join(' AND '), params: parts.flatMap((p) => p.params) }
}

const toValue = (v: unknown): RegisterValue => {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' || typeof v === 'string') return v
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Uint8Array) return '[binary]'
  return String(v)
}

function specFor(db: Database, table: string, actor: Actor): TableSpec {
  const spec = typeof table === 'string' ? tableSpec(table) : undefined
  if (!spec || !mayBrowse(spec, actor) || !tableExists(db, spec.table)) throw new UserFacingError('That register isn’t available.')
  return spec
}

function shownColumns(db: Database, spec: TableSpec): RegisterColumn[] {
  return columnsOf(db, spec.table)
    .filter((c) => columnTreatment(spec.table, c) !== 'hidden')
    .map((c) => ({
      name: c,
      label: columnLabel(spec.table, c),
      treatment: columnTreatment(spec.table, c) as 'masked' | 'shown',
      supersededBy: spec.superseded?.[c] ?? null
    }))
}

/** Every register the person may browse, grouped by domain, with row counts in their scope. */
export function catalogue(db: Database, actor: Actor): RegisterCatalogue {
  return {
    domains: DOMAINS.map((d) => ({
      key: d.key,
      label: d.label,
      description: d.description,
      tables: TABLES.filter((t) => t.domain === d.key && mayBrowse(t, actor) && tableExists(db, t.table)).map((t) => {
        const scope = clientScope(t, actor, undefined) as Where
        const n = db.prepare(`SELECT COUNT(*) AS n FROM ${quote(t.table)} t${scope.sql ? ` WHERE ${scope.sql}` : ''}`).get(...scope.params) as { n: number }
        return { table: t.table, label: t.label, grain: t.grain, description: t.description, rows: n.n, clientLinked: t.client !== undefined }
      })
    })).filter((d) => d.tables.length > 0)
  }
}

/** One page of a register. */
export function readRegister(db: Database, actor: Actor, query: RegisterQuery): RegisterPage {
  const spec = specFor(db, query?.table, actor)
  const columns = shownColumns(db, spec)
  const shown = new Set(columns.filter((c) => c.treatment === 'shown').map((c) => c.name))

  const where: Where[] = []
  const scope = clientScope(spec, actor, query.clientRef || undefined)
  if (scope === null) throw new UserFacingError('That register isn’t kept per client.')
  if (scope.sql) where.push(scope)

  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : ''
  if (search) {
    const like = `%${search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const searchable = [...shown]
    where.push({
      sql: `(${searchable.map((c) => `CAST(t.${quote(c)} AS TEXT) LIKE ? ESCAPE '\\'`).join(' OR ')})`,
      params: searchable.map(() => like)
    })
  }
  const whereSql = where.length ? ` WHERE ${where.map((w) => w.sql).join(' AND ')}` : ''
  const params = where.flatMap((w) => w.params)

  let order = ''
  if (query.sort) {
    if (!shown.has(query.sort.column)) throw new UserFacingError('That column can’t be sorted.')
    order = ` ORDER BY t.${quote(query.sort.column)} ${query.sort.direction === 'desc' ? 'DESC' : 'ASC'}`
  } else if (spec.orderBy && shown.has(spec.orderBy)) {
    order = ` ORDER BY t.${quote(spec.orderBy)} ASC`
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(query.limit) || DEFAULT_LIMIT)))
  const offset = Math.max(0, Math.floor(Number(query.offset) || 0))

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM ${quote(spec.table)} t${whereSql}`).get(...params) as { n: number }).n
  const select = columns.map((c) => `t.${quote(c.name)}`).join(', ')
  const raw = db.prepare(`SELECT ${select} FROM ${quote(spec.table)} t${whereSql}${order} LIMIT ? OFFSET ?`).raw(true).all(...params, limit, offset) as unknown[][]
  const rows = raw.map((r) => r.map((v, i) => (columns[i].treatment === 'masked' ? maskValue(v) : toValue(v))))

  const link = spec.client
  return {
    table: spec.table,
    label: spec.label,
    grain: spec.grain,
    description: spec.description,
    columns,
    rows,
    total,
    offset,
    limit,
    clientColumn: link?.kind === 'column' && shown.has(link.column) ? link.column : null
  }
}

interface OverviewRow {
  ref: string
  client_name: string
  client_category: string | null
  status: string | null
  company_status: string | null
  assigned_to: string | null
  active_services: number
  contacts: number
  open_deadlines: number
  overdue_deadlines: number
  next_due_date: string | null
  open_issues: number
  active_authorisations: number
  stored_logins: number
  other_references: number
}

/** Everything held about one client, register by register. */
export function clientFile(db: Database, actor: Actor, clientRef: string): ClientFile {
  const client = clientForActor(db, clientRef, actor)
  const o = db.prepare('SELECT * FROM v_client_overview WHERE ref = ?').get(client.ref) as OverviewRow
  const overview: ClientOverview = {
    ref: o.ref,
    name: o.client_name,
    category: o.client_category,
    status: o.status,
    companyStatus: o.company_status,
    assignedTo: o.assigned_to,
    activeServices: o.active_services,
    contacts: o.contacts,
    openDeadlines: o.open_deadlines,
    overdueDeadlines: o.overdue_deadlines,
    nextDueDate: o.next_due_date,
    openIssues: o.open_issues,
    activeAuthorisations: o.active_authorisations,
    storedLogins: o.stored_logins,
    otherReferences: o.other_references
  }

  const recordPage = readRegister(db, actor, { table: 'clients', clientRef: client.ref, limit: 1 })
  const record = recordPage.columns
    .map((c, i) => ({ column: c.name, label: c.label, value: recordPage.rows[0]?.[i] ?? null, supersededBy: c.supersededBy }))
    .filter((r) => r.value !== null && r.value !== '')

  const sections: ClientFile['sections'] = []
  for (const d of DOMAINS) {
    const pages: RegisterPage[] = []
    for (const t of TABLES) {
      if (t.domain !== d.key || t.table === 'clients' || !t.client || !mayBrowse(t, actor) || !tableExists(db, t.table)) continue
      const page = readRegister(db, actor, { table: t.table, clientRef: client.ref, limit: CLIENT_FILE_ROWS })
      if (page.total > 0) pages.push(page)
    }
    if (pages.length) sections.push({ domain: d.key, domainLabel: d.label, pages })
  }
  return { overview, record, sections }
}
