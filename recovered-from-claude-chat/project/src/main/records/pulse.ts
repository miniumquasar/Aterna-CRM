/**
 * Pulse (Activity → Today): the day's changes from the audit log, and the
 * health of the database, the licence and backups in plain words, each a whole
 * sentence. Plain functions; the IPC handlers in ../ipc/pulse.ts put them together.
 *
 * Staff see the changes they made and the changes to their own clients;
 * partners and managers see everyone's.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { HealthTone, LicenceStatus, PulseDay, PulseHealth, PulseItem, PulseKind, SystemStatus } from '../../shared/types'
import { UserFacingError, type Actor } from '../access/policy'
import { localDate } from './common'

/** Which group each table's changes fall in. */
export const KIND_BY_TABLE: Readonly<Record<string, PulseKind>> = {
  clients: 'clients', client_contacts: 'clients', client_services: 'clients', partnership_members: 'clients', trust_members: 'clients',
  client_relationships: 'clients', client_aliases: 'clients', addresses: 'clients', personal_info: 'clients', custom_field_values: 'clients',
  compliance_periods: 'compliance', hmrc_submissions: 'compliance', aml_records: 'compliance', agent_authorisations: 'compliance', data_issues: 'compliance',
  onboarding_observations: 'compliance', client_identifiers: 'compliance', practice_identifiers: 'compliance', credential_vault: 'compliance',
  credential_secrets: 'compliance', credential_consents: 'compliance', sa_registrations: 'compliance', payroll_schemes: 'compliance',
  payroll_scheme_years: 'compliance', pension_schemes: 'compliance', client_income_sources: 'compliance',
  payments: 'billing', payment_receipts: 'billing', wip_items: 'billing',
  interactions: 'communications', communication_log: 'communications', email_templates: 'communications',
  tasks: 'tasks',
  documents: 'documents',
  users: 'people', user_invites: 'people', app_settings: 'people', firm_data: 'people', vault_keys: 'people', licence_markers: 'people', backup_registry: 'people',
  import_batches: 'imports', import_changes: 'imports'
}

export const kindOf = (table: string | null, action: string): PulseKind => {
  if (/import/i.test(action)) return 'imports'
  return (table && KIND_BY_TABLE[table]) || 'other'
}

const pad = (n: number): string => String(n).padStart(2, '0')
/** SQLite's UTC format for a moment. */
const sqlUtc = (d: Date): string => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`

/** The start and end of a local calendar day, in the audit log's UTC format. */
export function dayBounds(day: string): { from: string; to: string } {
  const [y, m, d] = day.split('-').map(Number)
  return { from: sqlUtc(new Date(y, m - 1, d)), to: sqlUtc(new Date(y, m - 1, d + 1)) }
}

const MAX_ITEMS = 500

interface AuditRow {
  id: number
  timestamp: string
  user_name: string | null
  action: string
  table_name: string | null
  record_id: string | null
  old_value: string | null
  new_value: string | null
}

const refIn = (json: string | null): string | null => {
  if (!json) return null
  try {
    const v = JSON.parse(json) as Record<string, unknown>
    return v && typeof v === 'object' && typeof v.client_ref === 'string' ? v.client_ref : null
  } catch {
    return null
  }
}

/** The day's changes this person may see, newest first, with how many of each kind. */
export function pulseDay(db: Database, actor: Actor, query?: unknown): PulseDay {
  const q = (query && typeof query === 'object' ? query : {}) as { day?: unknown; who?: unknown }
  const day = q.day === undefined ? localDate() : q.day
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T12:00:00Z`))) throw new UserFacingError('Choose a day.')
  if (q.who !== undefined && q.who !== 'everyone' && q.who !== 'me') throw new UserFacingError('Choose whose changes to show.')
  const onlyMine = q.who === 'me'
  const { from, to } = dayBounds(day)

  const rows = db.prepare(
    `SELECT id, timestamp, user_name, action, table_name, record_id, old_value, new_value FROM audit_log
      WHERE timestamp >= ? AND timestamp < ?${onlyMine ? ' AND user_name = ?' : ''} ORDER BY id DESC LIMIT 5000`
  ).all(...(onlyMine ? [from, to, actor.name] : [from, to])) as AuditRow[]

  const byId = db.prepare('SELECT id, ref, client_name, assigned_to FROM clients WHERE id = ?')
  const byRef = db.prepare('SELECT id, ref, client_name, assigned_to FROM clients WHERE ref = ?')
  type C = { id: number; ref: string | null; client_name: string; assigned_to: string | null }
  const cache = new Map<string, C | null>()
  const lookup = (key: string, fn: () => C | undefined): C | null => {
    if (!cache.has(key)) cache.set(key, fn() ?? null)
    return cache.get(key) ?? null
  }
  // A record's client, for tables that hold one (the table name comes from the audit log, so only known tables are read).
  const refStatements = new Map<string, ReturnType<Database['prepare']> | null>()
  const recordRef = (table: string, id: string): string | null => {
    if (!(table in KIND_BY_TABLE) || !/^\d+$/.test(id)) return null
    if (!refStatements.has(table)) {
      const hasRef = (db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).some((c) => c.name === 'client_ref')
      refStatements.set(table, hasRef ? db.prepare(`SELECT client_ref FROM "${table}" WHERE id = ?`) : null)
    }
    const st = refStatements.get(table)
    return st ? ((st.get(Number(id)) as { client_ref: string | null } | undefined)?.client_ref ?? null) : null
  }

  const items: PulseItem[] = []
  const counts: Partial<Record<PulseKind, number>> = {}
  let truncated = false
  for (const r of rows) {
    let client: C | null = null
    if (r.table_name === 'clients' && r.record_id && /^\d+$/.test(r.record_id)) client = lookup(`id:${r.record_id}`, () => byId.get(Number(r.record_id)) as C | undefined)
    else {
      const ref = refIn(r.new_value) ?? refIn(r.old_value) ?? (r.table_name && r.record_id ? recordRef(r.table_name, r.record_id) : null)
      if (ref) client = lookup(`ref:${ref}`, () => byRef.get(ref) as C | undefined)
    }
    if (actor.role === 'staff' && r.user_name !== actor.name && client?.assigned_to !== actor.name) continue
    const kind = kindOf(r.table_name, r.action)
    counts[kind] = (counts[kind] ?? 0) + 1
    if (items.length >= MAX_ITEMS) {
      truncated = true
      continue
    }
    items.push({ id: r.id, at: r.timestamp, who: r.user_name, action: r.action, kind, client_id: client?.id ?? null, client_ref: client?.ref ?? null, client_name: client?.client_name ?? null })
  }
  return { day, items, counts, truncated: truncated || rows.length === 5000 }
}

// ── Health, in plain words ───────────────────────────────────────────────────

/** Ends a sentence with a full stop unless it already has one. */
const sentence = (s: string): string => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`)

const MB = 1024 * 1024
const size = (bytes: number | null): string => (bytes === null ? '' : bytes >= 1024 * MB ? `${(bytes / 1024 / MB).toFixed(1)} GB` : `${Math.max(0.1, bytes / MB).toFixed(1)} MB`)

export function databaseHealth(mode: SystemStatus['mode'], bytes: number | null): PulseHealth['database'] {
  switch (mode) {
    case 'encrypted':
      return { tone: 'ok', mode, bytes, text: `Encrypted and saved${bytes !== null ? ` (${size(bytes)})` : ''}.` }
    case 'dev-only':
      return { tone: 'attention', mode, bytes, text: 'Saved, but still on the development key; it changes at the next start.' }
    case 'locked':
      return { tone: 'problem', mode, bytes, text: 'The database couldn’t be opened. Nothing is being saved.' }
    default:
      return { tone: 'problem', mode, bytes, text: 'The data folder can’t be written to. Nothing is being saved.' }
  }
}

const longDate = (iso: string): string => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export function licenceHealth(s: Pick<LicenceStatus, 'state' | 'active' | 'validUntil' | 'daysRemaining' | 'graceEndsOn' | 'licensedTo'>): PulseHealth['licence'] {
  const until = s.validUntil ? longDate(s.validUntil) : ''
  switch (s.state) {
    case 'trial':
      return { tone: s.daysRemaining <= 7 ? 'attention' : 'ok', text: `Free trial until ${until} (${s.daysRemaining} day${s.daysRemaining === 1 ? '' : 's'} left).` }
    case 'licensed':
      return { tone: s.daysRemaining <= 30 ? 'attention' : 'ok', text: `Licensed${s.licensedTo ? ` to ${s.licensedTo}` : ''} until ${until}.` }
    case 'grace':
      return { tone: 'problem', text: `The licence has ended; everything works until ${s.graceEndsOn ? longDate(s.graceEndsOn) : 'the end of the grace period'}.` }
    default:
      return { tone: 'problem', text: 'Read-only: enter a licence key to make changes.' }
  }
}

/** When the last backup was, in words: "today at 12:31", "3 days ago". */
const whenText = (sqliteUtc: string, now: Date): string => {
  const t = new Date(`${sqliteUtc.replace(' ', 'T')}${/Z$|[+-]\d\d:?\d\d$/.test(sqliteUtc) ? '' : 'Z'}`)
  if (Number.isNaN(t.getTime())) return sqliteUtc
  const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86_400_000)
  const time = t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return days <= 0 ? `today at ${time}` : days === 1 ? `yesterday at ${time}` : `${days} days ago`
}

export function backupHealth(
  s: { lastBackup: { at: string } | null; lastError: { at: string; message: string } | null; nextDue: string | null; folderProblem: string | null; schedule: string },
  now: Date = new Date()
): NonNullable<PulseHealth['backups']> {
  const lastAt = s.lastBackup?.at ?? null
  const base = { lastAt, nextDue: s.nextDue }
  if (s.lastError) return { ...base, tone: 'problem', text: sentence(`The last backup didn’t work: ${s.lastError.message}`) }
  if (s.folderProblem) return { ...base, tone: 'problem', text: sentence(s.folderProblem) }
  if (!lastAt) return { ...base, tone: 'attention', text: 'No backup has been made yet.' }
  const ageDays = (now.getTime() - new Date(`${lastAt.replace(' ', 'T')}Z`).getTime()) / 86_400_000
  const tone: HealthTone = ageDays > 7 ? 'attention' : 'ok'
  const schedule = s.schedule === 'off' ? ' Scheduled backups are off.' : ''
  return { ...base, tone, text: `Last backup ${whenText(lastAt, now)}.${schedule}` }
}
