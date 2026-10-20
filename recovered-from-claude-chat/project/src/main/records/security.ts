/**
 * The security centre (Fortress), from the practice's own records:
 *
 *   sign-ins     every sign-in, failed password, unknown username, sign-out
 *                (by hand or after a time without use), password change and
 *                reset, and unlock, read from the audit log. Staff see their
 *                own account's; partners and managers see everyone's.
 *   audit log    every recorded action, newest first, a page at a time, with
 *                the client it was about and the fields it changed. Partners
 *                and managers only. Exported as CSV for an inspection.
 *   people       who can sign in, by role; accounts switched off, paused after
 *                wrong passwords, waiting for a new password; open invites.
 *   stored logins how many, and the flags to follow up: no user ID, or no
 *                password stored. The same password on several logins is
 *                normal and never flagged. Counted without opening the vault.
 *
 * Plain functions over the database; ../ipc/fortress.ts puts them together
 * with the vault, the recovery sheet, backups and the licence.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { AuditEntry, AuditPage, AuditQuery, PendingInvite, Person, PulseKind, SecurityOverview, SignInEvent, SignInQuery } from '../../shared/types'
import { auditWho } from '../../shared/audit-words'
import { canManage, requireManager, UserFacingError, type Actor } from '../access/policy'
import { dayBounds, KIND_BY_TABLE, kindOf } from './pulse'

// ── Sign-ins ─────────────────────────────────────────────────────────────────

/** The audit log's sign-in actions, and what each one is. */
const SIGN_IN_KINDS: Readonly<Record<string, SignInEvent['kind']>> = {
  'Signed in': 'signed_in',
  'Sign-in failed': 'failed',
  'Sign-in refused': 'refused',
  'Signed out': 'signed_out',
  'Changed own password': 'password_changed',
  'Reset a person’s password': 'password_reset',
  'Unlocked a person’s account': 'unlocked',
  'Joined with an invite': 'joined',
  'Created the first partner account': 'first_partner',
  'Password re-entry failed': 'password_check_failed'
}
const IDLE_SIGN_OUT = /^Signed out after .+ without use$/
const FAILED_KINDS: ReadonlySet<SignInEvent['kind']> = new Set(['failed', 'refused', 'password_check_failed'])

const signInKind = (action: string): SignInEvent['kind'] | null => SIGN_IN_KINDS[action] ?? (IDLE_SIGN_OUT.test(action) ? 'idle_sign_out' : null)

const SIGN_IN_SQL = `a.table_name = 'users' AND (a.action IN (${Object.keys(SIGN_IN_KINDS).map(() => '?').join(', ')}) OR a.action LIKE 'Signed out after % without use')`

interface SignInRow {
  id: number
  timestamp: string
  user_name: string | null
  action: string
  record_id: string | null
  new_value: string | null
}

const json = (s: string | null): Record<string, unknown> => {
  if (!s) return {}
  try {
    const v = JSON.parse(s) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** The event in words. A run of wrong passwords pauses sign-in: 5 in a row for 5 minutes, 10 for 30. */
function eventText(kind: SignInEvent['kind'], action: string, detail: Record<string, unknown>, by: string | null, attempted: string | null): string {
  switch (kind) {
    case 'signed_in':
      return 'Signed in'
    case 'failed': {
      const n = typeof detail.failures === 'number' ? detail.failures : 1
      const pause = n >= 10 ? 30 : n >= 5 ? 5 : 0
      return `Wrong password${n > 1 ? ` (${n} in a row)` : ''}${pause ? `; signing in paused for ${pause} minutes` : ''}`
    }
    case 'refused':
      return `Sign-in refused: no one who can sign in has that username${attempted ? ` (“${attempted}”)` : ''}`
    case 'signed_out':
      return 'Signed out'
    case 'idle_sign_out':
      return action
    case 'password_changed':
      return 'Changed their password'
    case 'password_reset':
      return by ? `Password reset by ${by}` : 'Password reset'
    case 'unlocked':
      return by ? `Signing in unpaused by ${by}` : 'Signing in unpaused'
    case 'joined':
      return 'Joined with an invite'
    case 'first_partner':
      return 'Created the first partner account'
    case 'password_check_failed':
      return 'Password typed wrongly when confirming an action'
  }
}

function readSignInQuery(q: unknown): Required<Pick<SignInQuery, 'days' | 'limit'>> & Pick<SignInQuery, 'failedOnly' | 'person'> {
  const query = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>
  const days = query.days === undefined ? 30 : query.days
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 400) throw new UserFacingError('Choose how many days of sign-ins to show: 1 to 400.')
  const limit = query.limit === undefined ? 200 : query.limit
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new UserFacingError('Show 1 to 1000 sign-ins.')
  if (query.person !== undefined && (typeof query.person !== 'string' || !query.person.trim() || query.person.length > 200)) throw new UserFacingError('Choose whose sign-ins to show.')
  return { days, limit, failedOnly: query.failedOnly === true, person: query.person as string | undefined }
}

/** Sign-ins and related events, newest first: staff their own account's, partners and managers everyone's. */
export function signInHistory(db: Database, actor: Actor, query?: unknown): SignInEvent[] {
  const q = readSignInQuery(query)
  const users = db.prepare('SELECT id, name FROM users').all() as Array<{ id: number; name: string }>
  const names = new Map(users.map((u) => [String(u.id), u.name]))
  const parts = [SIGN_IN_SQL, "a.timestamp >= datetime('now', ?)"]
  const params: unknown[] = [...Object.keys(SIGN_IN_KINDS), `-${q.days} days`]
  if (!canManage(actor)) {
    parts.push('a.record_id = ?')
    params.push(String(actor.id ?? -1))
  } else if (q.person) {
    // Names are unique among people who sign in; a name typed for nobody matches nothing.
    const ids = users.filter((u) => u.name.trim().toLowerCase() === q.person!.trim().toLowerCase()).map((u) => String(u.id))
    if (!ids.length) return []
    parts.push(`a.record_id IN (${placeholders(ids.length)})`)
    params.push(...ids)
  }
  if (q.failedOnly) {
    const failed = Object.entries(SIGN_IN_KINDS).filter(([, k]) => FAILED_KINDS.has(k)).map(([action]) => action)
    parts.push(`a.action IN (${placeholders(failed.length)})`)
    params.push(...failed)
  }
  const rows = db
    .prepare(`SELECT a.id, a.timestamp, a.user_name, a.action, a.record_id, a.new_value FROM audit_log a WHERE ${parts.map((p) => `(${p})`).join(' AND ')} ORDER BY a.id DESC LIMIT ?`)
    .all(...params, q.limit) as SignInRow[]
  return rows.flatMap((r): SignInEvent[] => {
    const kind = signInKind(r.action)
    if (!kind) return []
    const detail = json(r.new_value)
    const person = (r.record_id && names.get(r.record_id)) || null
    const attempted = kind === 'refused' && typeof detail.username === 'string' ? detail.username : null
    const by = kind === 'password_reset' || kind === 'unlocked' ? r.user_name : null
    return [{ id: r.id, at: r.timestamp, kind, person, attempted, by, text: eventText(kind, r.action, detail, by, attempted) }]
  })
}

/** Sign-in figures for the overview: the last 30 days, and your own account. */
export function signInSummary(db: Database, actor: Actor): Pick<SecurityOverview, 'signIns' | 'you'> {
  const scope = canManage(actor) ? '' : ' AND a.record_id = ?'
  const scopeParams = canManage(actor) ? [] : [String(actor.id ?? -1)]
  const count = (actions: string[]): number =>
    (db.prepare(`SELECT COUNT(*) AS n FROM audit_log a WHERE a.table_name = 'users' AND a.action IN (${actions.map(() => '?').join(', ')}) AND a.timestamp >= datetime('now', '-30 days')${scope}`)
      .get(...actions, ...scopeParams) as { n: number }).n
  const lastFailed = db.prepare(`SELECT MAX(a.timestamp) AS at FROM audit_log a WHERE a.table_name = 'users' AND a.action IN ('Sign-in failed', 'Sign-in refused')${scope}`).get(...scopeParams) as { at: string | null }
  const me = String(actor.id ?? -1)
  // The latest sign-in is this one; the one before it is the last time.
  const previous = db.prepare("SELECT timestamp FROM audit_log WHERE table_name = 'users' AND action = 'Signed in' AND record_id = ? ORDER BY id DESC LIMIT 1 OFFSET 1").get(me) as { timestamp: string } | undefined
  const myFailed = (db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE table_name = 'users' AND action = 'Sign-in failed' AND record_id = ? AND timestamp >= datetime('now', '-30 days')").get(me) as { n: number }).n
  return {
    signIns: { last30Days: count(['Signed in']), failed30Days: count(['Sign-in failed', 'Sign-in refused']), lastFailedAt: lastFailed.at },
    you: { lastSignIn: previous?.timestamp ?? null, failed30Days: myFailed }
  }
}

// ── People and stored logins ─────────────────────────────────────────────────

/** Who can sign in, by role, and accounts that need a look. */
export function peopleSummary(people: readonly Person[], invites: readonly PendingInvite[], now: number = Date.now()): NonNullable<SecurityOverview['people']> {
  const active = people.filter((p) => p.active)
  return {
    total: active.length,
    partners: active.filter((p) => p.role === 'partner').length,
    managers: active.filter((p) => p.role === 'manager').length,
    staff: active.filter((p) => p.role === 'staff').length,
    accessOff: people.length - active.length,
    locked: active.filter((p) => p.lockedUntil !== null && Date.parse(p.lockedUntil) > now).length,
    temporaryPasswords: active.filter((p) => p.mustChangePassword).length,
    noPassword: active.filter((p) => p.noPassword).length,
    invites: invites.filter((i) => !i.expired).length
  }
}

/**
 * Stored logins, and the flags to follow up: no user ID, no password stored —
 * the same rules as the flags on each login (loginFlags in shared/references).
 * Nothing is decrypted.
 */
export function loginFlagCounts(db: Database): { logins: number; noUserId: number; noPassword: number } {
  const r = db.prepare(
    `SELECT COUNT(*) AS logins,
            COALESCE(SUM(CASE WHEN v.login_id IS NULL OR v.login_id = '' THEN 1 ELSE 0 END), 0) AS no_user_id,
            COALESCE(SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM credential_secrets s WHERE s.credential_id = v.id AND s.field = 'password') THEN 1 ELSE 0 END), 0) AS no_password
       FROM credential_vault v`
  ).get() as { logins: number; no_user_id: number; no_password: number }
  return { logins: r.logins, noUserId: r.no_user_id, noPassword: r.no_password }
}

// ── The audit log ────────────────────────────────────────────────────────────

const KINDS: readonly PulseKind[] = ['clients', 'compliance', 'billing', 'communications', 'tasks', 'documents', 'people', 'imports', 'other']
const MAX_VALUE = 20_000
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

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

interface ReadAudit {
  from: string | null
  to: string | null
  who: string | null
  kind: PulseKind | null
  find: string | null
  beforeId: number | null
  limit: number
}

function readAuditQuery(q: unknown, maxLimit = 500): ReadAudit {
  const query = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>
  const day = (v: unknown, label: string): string | null => {
    if (v === undefined || v === null || v === '') return null
    if (typeof v !== 'string' || !ISO_DAY.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`))) throw new UserFacingError(`${label} isn’t a date.`)
    return v
  }
  const from = day(query.from, 'The first day')
  const to = day(query.to, 'The last day')
  if (from && to && from > to) throw new UserFacingError('The first day is after the last day.')
  if (query.who !== undefined && query.who !== null && (typeof query.who !== 'string' || query.who.length > 200)) throw new UserFacingError('Choose whose actions to show.')
  if (query.kind !== undefined && query.kind !== null && !KINDS.includes(query.kind as PulseKind)) throw new UserFacingError('Choose a kind of action from the list.')
  if (query.find !== undefined && query.find !== null && (typeof query.find !== 'string' || query.find.length > 100)) throw new UserFacingError('Look for 100 characters at most.')
  if (query.beforeId !== undefined && query.beforeId !== null && !(typeof query.beforeId === 'number' && Number.isInteger(query.beforeId) && query.beforeId > 0)) {
    throw new UserFacingError('That isn’t a place in the audit log.')
  }
  const limit = query.limit === undefined ? 100 : query.limit
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > maxLimit) throw new UserFacingError(`Show 1 to ${maxLimit} entries.`)
  const who = typeof query.who === 'string' && query.who.trim() ? query.who.trim() : null
  const find = typeof query.find === 'string' && query.find.trim() ? query.find.trim() : null
  return { from, to, who, kind: (query.kind as PulseKind | undefined) ?? null, find, beforeId: (query.beforeId as number | undefined) ?? null, limit }
}

/** The tables of each kind, for filtering in SQL. */
const tablesOf = (kind: PulseKind): string[] => Object.entries(KIND_BY_TABLE).filter(([, k]) => k === kind).map(([t]) => t)
const placeholders = (n: number): string => new Array(n).fill('?').join(', ')
const likeText = (s: string): string => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

/** The WHERE clause for a query (without paging). */
function auditWhere(q: ReadAudit): { sql: string; params: unknown[] } {
  const parts: string[] = []
  const params: unknown[] = []
  if (q.from) {
    parts.push('a.timestamp >= ?')
    params.push(dayBounds(q.from).from)
  }
  if (q.to) {
    parts.push('a.timestamp < ?')
    params.push(dayBounds(q.to).to)
  }
  if (q.who) {
    if (q.who.toLowerCase() === 'system') parts.push("a.user_name = 'system'")
    else {
      parts.push('lower(a.user_name) = lower(?)')
      params.push(q.who)
    }
  }
  if (q.kind) {
    const imports = "lower(a.action) LIKE '%import%'"
    if (q.kind === 'imports') parts.push(imports)
    else if (q.kind === 'other') {
      const known = Object.keys(KIND_BY_TABLE)
      parts.push(`NOT ${imports} AND (a.table_name IS NULL OR a.table_name NOT IN (${placeholders(known.length)}))`)
      params.push(...known)
    } else {
      const tables = tablesOf(q.kind)
      parts.push(`NOT ${imports} AND a.table_name IN (${placeholders(tables.length)})`)
      params.push(...tables)
    }
  }
  if (q.find) {
    const like = likeText(q.find)
    parts.push("(a.action LIKE ? ESCAPE '\\' OR a.record_id = ? OR a.user_name LIKE ? ESCAPE '\\' OR a.old_value LIKE ? ESCAPE '\\' OR a.new_value LIKE ? ESCAPE '\\')")
    params.push(like, q.find, like, like, like)
  }
  return { sql: parts.length ? ` WHERE ${parts.join(' AND ')}` : '', params }
}

/** The names of the fields an entry changed: those whose value differs before and after. */
export function changedFields(before: string | null, after: string | null): string[] {
  const a = json(before)
  const b = json(after)
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const out: string[] = []
  for (const k of keys) {
    if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) out.push(k)
    if (out.length >= 30) break
  }
  return out
}

/** Turns rows into entries, with the client each was about (looked up once per table and client). */
function toEntries(db: Database, rows: readonly AuditRow[]): AuditEntry[] {
  const byId = db.prepare('SELECT id, ref, client_name FROM clients WHERE id = ?')
  const byRef = db.prepare('SELECT id, ref, client_name FROM clients WHERE ref = ?')
  type C = { id: number; ref: string | null; client_name: string }
  const cache = new Map<string, C | null>()
  const lookup = (key: string, fn: () => C | undefined): C | null => {
    if (!cache.has(key)) cache.set(key, fn() ?? null)
    return cache.get(key) ?? null
  }
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
  const refIn = (s: string | null): string | null => {
    const v = json(s).client_ref
    return typeof v === 'string' ? v : null
  }
  const cap = (s: string | null): string | null => (s && s.length > MAX_VALUE ? `${s.slice(0, MAX_VALUE)}…` : s)
  return rows.map((r) => {
    let client: C | null = null
    if (r.table_name === 'clients' && r.record_id && /^\d+$/.test(r.record_id)) client = lookup(`id:${r.record_id}`, () => byId.get(Number(r.record_id)) as C | undefined)
    else {
      const ref = refIn(r.new_value) ?? refIn(r.old_value) ?? (r.table_name && r.record_id ? recordRef(r.table_name, r.record_id) : null)
      if (ref) client = lookup(`ref:${ref}`, () => byRef.get(ref) as C | undefined)
    }
    return {
      id: r.id,
      at: r.timestamp,
      who: r.user_name,
      action: r.action,
      table: r.table_name,
      kind: kindOf(r.table_name, r.action),
      recordId: r.record_id,
      clientRef: client?.ref ?? null,
      clientName: client?.client_name ?? null,
      changed: changedFields(r.old_value, r.new_value),
      before: cap(r.old_value),
      after: cap(r.new_value)
    }
  })
}

const AUDIT_COLUMNS = 'a.id, a.timestamp, a.user_name, a.action, a.table_name, a.record_id, a.old_value, a.new_value'

/** A page of the audit log, newest first. Partners and managers only. */
export function auditPage(db: Database, actor: Actor, query?: unknown): AuditPage {
  requireManager(actor, 'see the audit log')
  const q = readAuditQuery(query)
  const w = auditWhere(q)
  const sql = `SELECT ${AUDIT_COLUMNS} FROM audit_log a${w.sql}${q.beforeId ? `${w.sql ? ' AND' : ' WHERE'} a.id < ?` : ''} ORDER BY a.id DESC LIMIT ?`
  const rows = db.prepare(sql).all(...w.params, ...(q.beforeId ? [q.beforeId] : []), q.limit + 1) as AuditRow[]
  const more = rows.length > q.limit
  const page = more ? rows.slice(0, q.limit) : rows
  const people = (db.prepare("SELECT DISTINCT user_name AS n FROM audit_log WHERE user_name IS NOT NULL AND user_name <> 'system' ORDER BY user_name COLLATE NOCASE LIMIT 500").all() as Array<{ n: string }>).map((r) => r.n)
  return { entries: toEntries(db, page), nextBeforeId: more ? page[page.length - 1].id : null, people }
}

/** Checks an export's filters before anything is asked or written: the same rules as a page, without paging. */
export function readAuditExportQuery(query?: unknown): AuditQuery {
  const q = readAuditQuery({ ...(query && typeof query === 'object' ? query : {}), beforeId: undefined, limit: undefined })
  return { from: q.from ?? undefined, to: q.to ?? undefined, who: q.who ?? undefined, kind: q.kind ?? undefined, find: q.find ?? undefined }
}

/**
 * Every entry a query matches, newest first, handed over `batch` at a time,
 * so a long log never sits in memory at once (for saving as CSV). Returns how
 * many there were. Partners and managers only.
 */
export function exportAuditEntries(db: Database, actor: Actor, query: unknown, write: (entries: AuditEntry[]) => void, batch = 2000): number {
  requireManager(actor, 'export the audit log')
  const w = auditWhere(readAuditQuery({ ...readAuditExportQuery(query), limit: 1 }))
  const page = db.prepare(`SELECT ${AUDIT_COLUMNS} FROM audit_log a${w.sql}${w.sql ? ' AND' : ' WHERE'} a.id < ? ORDER BY a.id DESC LIMIT ?`)
  let before = Number.MAX_SAFE_INTEGER
  let total = 0
  for (;;) {
    const rows = page.all(...w.params, before, batch) as AuditRow[]
    if (!rows.length) break
    write(toEntries(db, rows))
    total += rows.length
    if (rows.length < batch) break
    before = rows[rows.length - 1].id
  }
  return total
}

/** The audit log as CSV rows: a header, then one row per entry. Times are shown in UTC and on this computer's clock. */
export function auditCsvRows(entries: readonly AuditEntry[]): { header: string[]; rows: string[][] } {
  const local = (sqliteUtc: string): string => {
    const t = new Date(`${sqliteUtc.replace(' ', 'T')}Z`)
    return Number.isNaN(t.getTime()) ? '' : t.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }
  return {
    header: ['Entry', 'When (UTC)', 'When (this computer)', 'Who', 'Action', 'Register', 'Record', 'Client code', 'Client', 'Fields changed', 'Before', 'After'],
    rows: entries.map((e) => [
      String(e.id), e.at, local(e.at), auditWho(e.who), e.action, e.table ?? '', e.recordId ?? '', e.clientRef ?? '', e.clientName ?? '',
      e.changed.join(', '), e.before ?? '', e.after ?? ''
    ])
  }
}
