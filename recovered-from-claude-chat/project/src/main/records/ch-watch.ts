/**
 * What Companies House says about the practice's clients — plain functions over
 * the database, tested without Electron or the network.
 *
 *   companyNumber()       a company number as Companies House writes it (8 characters)
 *   watchedCompanies()    the live clients with a company number, by number
 *   companiesDue()        the companies the daily check should look at next
 *   compareProfile()      what changed between the last profile seen and this one
 *   changesFromEvent()    what a Companies House stream event means for a client
 *   recordProfile()       saves a profile, the changes found and the client's due dates
 *   recordChanges()       saves changes, each once
 *   listChanges()         the recent changes a person may see
 *
 * Two sources feed the same list: the daily check of each client company's
 * profile (needs the practice's Companies House API key), and the Companies
 * House stream (needs a separate streaming key). Red flags — a strike-off
 * proposal, insolvency, a status other than active, accounts or a confirmation
 * statement overdue at Companies House — are marked, for Risk and notifications.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { ChChange, ChChangeCategory, ChChangeQuery, CHStreamEvent } from '../../shared/types'
import { auditChanges, writeAudit, type Row } from '../access/audit'
import { UserFacingError, type Actor } from '../access/policy'

/** A company profile as the Companies House API returns it — only the parts used here. */
export interface ChProfile {
  company_number?: string
  company_name?: string
  company_status?: string
  company_status_detail?: string
  date_of_creation?: string
  accounts?: { next_due?: string; overdue?: boolean; last_accounts?: { made_up_to?: string } }
  confirmation_statement?: { next_due?: string; overdue?: boolean; last_made_up_to?: string }
  registered_office_address?: Record<string, unknown>
  has_insolvency_history?: boolean
  has_charges?: boolean
}

/** One row of ch_company_state. */
export interface CompanyState {
  company_number: string
  company_name: string | null
  status: string | null
  status_detail: string | null
  accounts_next_due: string | null
  accounts_overdue: 0 | 1 | null
  last_accounts_made_up_to: string | null
  cs_next_due: string | null
  cs_overdue: 0 | 1 | null
  cs_last_made_up_to: string | null
  registered_office: string | null
  has_insolvency_history: 0 | 1 | null
  has_charges: 0 | 1 | null
  checked_at: string
  problem: string | null
}

/** A change before it is saved. */
export interface ChangeDraft {
  category: ChChangeCategory
  red_flag: boolean
  summary: string
  /** Recorded once: the same key is never saved twice. */
  key: string
  detail?: Record<string, unknown> | null
  published_at?: string | null
}

/** A client company the app watches. */
export interface WatchedCompany {
  company_number: string
  client_id: number
  client_ref: string | null
  client_name: string
  assigned_to: string | null
}

/**
 * A company number as Companies House writes it: 8 characters, upper case.
 * "1234567" → "01234567", "sc 12345" → "SC012345". Null when it can't be one.
 */
export function companyNumber(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const raw = String(value).toUpperCase().replace(/[\s.-]/g, '')
  if (!raw) return null
  if (/^\d{1,8}$/.test(raw)) return raw.padStart(8, '0')
  const prefixed = /^([A-Z]{2})(\d{1,6})$/.exec(raw)
  if (prefixed) return prefixed[1] + prefixed[2].padStart(6, '0')
  return /^[A-Z0-9]{8}$/.test(raw) ? raw : null
}

/** Clients that have left or been dissolved aren't watched (the same rule as the deadline list). */
const LIVE = "COALESCE(c.status, 'Active') NOT IN ('Former client', 'Dissolved') AND COALESCE(c.company_status, '') <> 'dissolved'"

/** The live clients with a company number, by number (the first client when two share one). */
export function watchedCompanies(db: Database): Map<string, WatchedCompany> {
  const rows = db.prepare(
    `SELECT c.id, c.ref, c.client_name, c.assigned_to, c.reg_no FROM clients c
      WHERE c.reg_no IS NOT NULL AND trim(c.reg_no) <> '' AND ${LIVE} ORDER BY c.id`
  ).all() as Array<{ id: number; ref: string | null; client_name: string; assigned_to: string | null; reg_no: string }>
  const out = new Map<string, WatchedCompany>()
  for (const r of rows) {
    const n = companyNumber(r.reg_no)
    if (n && !out.has(n)) out.set(n, { company_number: n, client_id: r.id, client_ref: r.ref, client_name: r.client_name, assigned_to: r.assigned_to })
  }
  return out
}

/** SQLite's own time format, UTC. */
export const sqlTime = (d: Date): string => d.toISOString().replace('T', ' ').slice(0, 19)

/** The companies the daily check should look at: never checked first, then those checked longest ago. */
export function companiesDue(db: Database, now: Date, olderThanHours = 20): WatchedCompany[] {
  const cutoff = sqlTime(new Date(now.getTime() - olderThanHours * 3_600_000))
  const checked = new Map(
    (db.prepare('SELECT company_number, checked_at FROM ch_company_state').all() as Array<{ company_number: string; checked_at: string }>).map((r) => [r.company_number, r.checked_at])
  )
  return [...watchedCompanies(db).values()]
    .filter((c) => (checked.get(c.company_number) ?? '') < cutoff)
    .sort((a, b) => (checked.get(a.company_number) ?? '').localeCompare(checked.get(b.company_number) ?? '') || a.client_id - b.client_id)
}

// ── Reading a profile ────────────────────────────────────────────────────────

const date = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
const flag = (v: unknown): 0 | 1 | null => (v === true ? 1 : v === false ? 0 : null)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** "Suite 2, 1 High Street, Leeds, LS1 1AA" from the address parts Companies House gives. */
export function addressLine(address: Record<string, unknown> | undefined): string | null {
  if (!address) return null
  const parts = ['care_of', 'po_box', 'premises', 'address_line_1', 'address_line_2', 'locality', 'region', 'postal_code', 'country']
    .map((k) => text(address[k]))
    .filter((v): v is string => !!v)
  return parts.length ? parts.join(', ') : null
}

export function stateFromProfile(number: string, p: ChProfile, checkedAt: string): CompanyState {
  return {
    company_number: number,
    company_name: text(p.company_name),
    status: text(p.company_status)?.toLowerCase() ?? null,
    status_detail: text(p.company_status_detail)?.toLowerCase() ?? null,
    accounts_next_due: date(p.accounts?.next_due),
    accounts_overdue: flag(p.accounts?.overdue),
    last_accounts_made_up_to: date(p.accounts?.last_accounts?.made_up_to),
    cs_next_due: date(p.confirmation_statement?.next_due),
    cs_overdue: flag(p.confirmation_statement?.overdue),
    cs_last_made_up_to: date(p.confirmation_statement?.last_made_up_to),
    registered_office: addressLine(p.registered_office_address),
    has_insolvency_history: flag(p.has_insolvency_history),
    has_charges: flag(p.has_charges),
    checked_at: checkedAt,
    problem: null
  }
}

/** A company status in words, as a sentence would use it. */
const STATUS_WORDS: Record<string, string> = {
  active: 'active',
  dissolved: 'dissolved',
  liquidation: 'in liquidation',
  receivership: 'in receivership',
  administration: 'in administration',
  'voluntary-arrangement': 'in a voluntary arrangement',
  'converted-closed': 'converted or closed',
  'insolvency-proceedings': 'in insolvency proceedings',
  registered: 'registered',
  removed: 'removed from the register',
  closed: 'closed',
  open: 'open'
}
export const statusWords = (status: string | null): string => (status ? STATUS_WORDS[status] ?? status.replace(/-/g, ' ') : 'unknown')

/** Statuses that need no attention; every other one is a red flag. */
const ORDINARY_STATUS = new Set(['active', 'registered', 'open'])
export const isRedStatus = (status: string | null): boolean => !!status && !ORDINARY_STATUS.has(status)

export const STRIKE_OFF = 'active-proposal-to-strike-off'

/**
 * A profile's status in the words the client record uses (the import's own
 * list): strike_off, active, dissolved, liquidation or administration. Null
 * for a status that list has no word for; the client record keeps its own then,
 * and Risk reads the exact status from the latest profile.
 */
export function registerStatus(s: Pick<CompanyState, 'status' | 'status_detail'>): string | null {
  if (s.status_detail === STRIKE_OFF) return 'strike_off'
  return s.status && ['active', 'dissolved', 'liquidation', 'administration'].includes(s.status) ? s.status : null
}

const longDate = (iso: string | null): string =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

const sameText = (a: string | null, b: string | null): boolean => (a ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === (b ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * What changed between the last profile seen (null: the first check) and this
 * one. At the first check only red flags are reported: everything else is how
 * the company already was.
 */
export function compareProfile(before: CompanyState | null, after: CompanyState): ChangeDraft[] {
  const n = after.company_number
  const day = after.checked_at.slice(0, 10)
  const out: ChangeDraft[] = []
  const add = (category: ChChangeCategory, red: boolean, summary: string, value: string, detail?: Record<string, unknown>): void => {
    out.push({ category, red_flag: red, summary, key: `check:${n}:${category}:${value}:${day}`, detail: detail ?? null })
  }

  if (!before) {
    const first = ' (found at the first check)'
    if (isRedStatus(after.status)) add('status', true, `Status at Companies House: ${statusWords(after.status)}${first}`, after.status ?? '')
    if (after.status_detail === STRIKE_OFF) add('strike_off', true, `Proposal to strike off the company${first}`, 'on')
    if (after.accounts_overdue === 1) add('accounts_overdue', true, `Accounts overdue at Companies House${after.accounts_next_due ? `: due ${longDate(after.accounts_next_due)}` : ''}${first}`, after.accounts_next_due ?? 'on')
    if (after.cs_overdue === 1) add('confirmation_overdue', true, `Confirmation statement overdue at Companies House${after.cs_next_due ? `: due ${longDate(after.cs_next_due)}` : ''}${first}`, after.cs_next_due ?? 'on')
    return out
  }

  if (before.status && after.status && before.status !== after.status) {
    if (isRedStatus(after.status)) add('status', true, `Status changed to ${statusWords(after.status)} (was ${statusWords(before.status)})`, after.status, { from: before.status, to: after.status })
    else add('status', false, `Status is ${statusWords(after.status)} again (was ${statusWords(before.status)})`, after.status, { from: before.status, to: after.status })
  }
  if (after.status_detail === STRIKE_OFF && before.status_detail !== STRIKE_OFF) add('strike_off', true, 'Proposal to strike off the company', 'on')
  if (before.status_detail === STRIKE_OFF && after.status_detail !== STRIKE_OFF && after.status === 'active') add('strike_off', false, 'The strike-off proposal has ended; the company is active', 'off')
  if (after.accounts_overdue === 1 && before.accounts_overdue !== 1) add('accounts_overdue', true, `Accounts overdue at Companies House${after.accounts_next_due ? `: due ${longDate(after.accounts_next_due)}` : ''}`, after.accounts_next_due ?? 'on')
  if (before.accounts_overdue === 1 && after.accounts_overdue === 0) add('accounts_overdue', false, 'Accounts no longer overdue at Companies House', 'off')
  if (after.cs_overdue === 1 && before.cs_overdue !== 1) add('confirmation_overdue', true, `Confirmation statement overdue at Companies House${after.cs_next_due ? `: due ${longDate(after.cs_next_due)}` : ''}`, after.cs_next_due ?? 'on')
  if (before.cs_overdue === 1 && after.cs_overdue === 0) add('confirmation_overdue', false, 'Confirmation statement no longer overdue at Companies House', 'off')
  if (after.last_accounts_made_up_to && after.last_accounts_made_up_to !== before.last_accounts_made_up_to) {
    add('accounts', false, `Accounts filed, made up to ${longDate(after.last_accounts_made_up_to)}`, after.last_accounts_made_up_to)
  }
  if (after.cs_last_made_up_to && after.cs_last_made_up_to !== before.cs_last_made_up_to) {
    add('confirmation', false, `Confirmation statement filed, made up to ${longDate(after.cs_last_made_up_to)}`, after.cs_last_made_up_to)
  }
  if (before.registered_office && after.registered_office && !sameText(before.registered_office, after.registered_office)) {
    add('address', false, `Registered office changed to ${after.registered_office}`, after.registered_office.slice(0, 60), { from: before.registered_office, to: after.registered_office })
  }
  if (before.company_name && after.company_name && !sameText(before.company_name, after.company_name)) {
    add('name', false, `Name changed from ${before.company_name} to ${after.company_name}`, after.company_name, { from: before.company_name, to: after.company_name })
  }
  if (after.has_insolvency_history === 1 && before.has_insolvency_history === 0) add('insolvency', true, 'Insolvency history now shown at Companies House', 'on')
  if (after.has_charges === 1 && before.has_charges === 0) add('charges', false, 'A charge is now registered against the company', 'on')
  return out
}

// ── Stream events ────────────────────────────────────────────────────────────

/** The company an event is about: from its address ("/company/01234567/…"), else the profile itself. */
export function eventCompany(event: Pick<CHStreamEvent, 'resource_uri' | 'resource_id' | 'data' | 'endpoint'>): string | null {
  const fromUri = /^\/company\/([A-Za-z0-9]+)(?:\/|$)/.exec(event.resource_uri ?? '')
  if (fromUri) return companyNumber(fromUri[1])
  if (event.endpoint === '/companies') return companyNumber((event.data as Record<string, unknown> | undefined)?.company_number ?? event.resource_id)
  return null
}

/** "SMITH, John Paul" → "John Paul Smith"; other names in title case. */
export function personName(raw: unknown): string {
  const s = text(raw)
  if (!s) return 'Someone'
  const titled = (w: string): string => w.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase())
  const comma = /^([^,]+),\s*(.+)$/.exec(s)
  return comma ? `${titled(comma[2])} ${titled(comma[1])}` : titled(s)
}

/** "accounts-with-accounts-type-micro-entity" → "Accounts with accounts type micro entity". */
const humanise = (key: unknown): string => {
  const s = text(key)
  if (!s) return ''
  const words = s.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const ROLE_WORDS: Record<string, string> = {
  director: 'director', secretary: 'secretary', 'llp-member': 'LLP member', 'llp-designated-member': 'designated LLP member',
  'corporate-director': 'corporate director', 'corporate-secretary': 'corporate secretary', 'nominee-director': 'nominee director'
}

/**
 * What a stream event means, as changes to record. The company profile stream
 * is compared with the last profile seen by the caller (compareProfile), so it
 * isn't handled here. Events the practice needn't hear about give nothing.
 */
export function changesFromEvent(event: CHStreamEvent): ChangeDraft[] {
  const d = (event.data ?? {}) as Record<string, unknown>
  const values = (d.description_values ?? {}) as Record<string, unknown>
  const at = event.published_at ?? null
  const id = event.timepoint !== undefined ? `t${event.timepoint}` : `${event.resource_uri ?? event.resource_id}:${at ?? ''}`
  const one = (category: ChChangeCategory, red: boolean, summary: string, key: string, detail?: Record<string, unknown>): ChangeDraft[] => [
    { category, red_flag: red, summary, key: `stream:${key}`, detail: detail ?? null, published_at: at }
  ]
  const deleted = event.event_type === 'deleted'

  switch (event.endpoint) {
    case '/filings': {
      const type = String(d.type ?? '').toUpperCase()
      const category = String(d.category ?? '')
      const key = `filing:${text(d.transaction_id) ?? id}`
      const madeUp = date(values.made_up_date)
      const officer = values.officer_name ? personName(values.officer_name) : null
      if (deleted) return []
      if (type === 'GAZ1' || type === 'GAZ1(A)') return one('strike_off', true, `First Gazette notice for strike-off${type === 'GAZ1(A)' ? ' (the company applied)' : ''}`, key, { type })
      if (type === 'GAZ2' || type === 'GAZ2(A)') return one('status', true, 'Dissolved: final Gazette notice published', key, { type })
      if (type === 'DS01') return one('strike_off', true, 'The company has applied to be struck off (form DS01)', key, { type })
      if (type === 'DS02') return one('strike_off', false, 'The application to strike off was withdrawn', key, { type })
      if (type.startsWith('SOAS')) return one('strike_off', false, 'Strike-off action suspended', key, { type })
      if (category === 'liquidation' || category === 'insolvency' || /^(LIQ|LRESEX|AM\d|600|4\.)/.test(type)) {
        return one('insolvency', true, `Insolvency filing: ${humanise(d.description) || type}`, key, { type })
      }
      if (type === 'AA') return one('accounts', false, `Accounts filed${madeUp ? `, made up to ${longDate(madeUp)}` : ''}`, key, { type })
      if (type === 'AA01') return one('accounts', false, 'Accounting reference date changed', key, { type })
      if (type === 'CS01') return one('confirmation', false, `Confirmation statement filed${madeUp ? `, made up to ${longDate(madeUp)}` : ''}`, key, { type })
      if (/^AP0[1-4]$/.test(type)) return one('officers', false, `${officer ?? 'An officer'} appointed`, key, { type })
      if (/^TM0[12]$/.test(type)) return one('officers', false, `${officer ?? 'An officer'}’s appointment ended`, key, { type })
      if (/^CH0[1-4]$/.test(type)) return one('officers', false, `${officer ?? 'An officer'}’s details changed`, key, { type })
      if (type === 'AD01') return one('address', false, 'Registered office address changed', key, { type })
      if (/^PSC0[1-9]$/.test(type)) return one('psc', false, `Persons with significant control: ${humanise(d.description) || type}`, key, { type })
      if (type === 'MR01') return one('charges', false, 'Charge registered', key, { type })
      if (type === 'MR04') return one('charges', false, 'Charge satisfied', key, { type })
      if (type === 'NM01' || type === 'CERTNM' || type === 'CONNOT' || category === 'change-of-name') return one('name', false, 'Change of name filed', key, { type })
      return one('filing', false, `Filed: ${humanise(d.description) || 'a document'}${type ? ` (${type})` : ''}`, key, { type })
    }
    case '/officers': {
      const who = personName(d.name)
      const role = ROLE_WORDS[String(d.officer_role ?? '')] ?? (text(d.officer_role) ?? 'officer').replace(/-/g, ' ')
      const key = `officer:${event.resource_id || event.resource_uri}:${id}`
      if (deleted) return one('officers', false, `${who}’s appointment was removed from the register`, key)
      const resigned = date(d.resigned_on)
      if (resigned) return one('officers', false, `${who} stopped being ${role} on ${longDate(resigned)}`, key)
      const changed = event.fields_changed
      if (!changed || changed.includes('appointed_on')) {
        const on = date(d.appointed_on)
        return one('officers', false, `${who} appointed ${role}${on ? ` on ${longDate(on)}` : ''}`, key)
      }
      return one('officers', false, `${who}’s details changed (${changed.join(', ').replace(/_/g, ' ')})`, key)
    }
    case '/persons-with-significant-control': {
      const who = personName(d.name ?? 'A person with significant control')
      const key = `psc:${event.resource_id || event.resource_uri}:${id}`
      if (deleted) return one('psc', false, `${who} removed from the register of persons with significant control`, key)
      const ceased = date(d.ceased_on)
      if (ceased) return one('psc', false, `${who} stopped being a person with significant control on ${longDate(ceased)}`, key)
      return one('psc', false, `${who} recorded as a person with significant control`, key)
    }
    case '/persons-with-significant-control-statements':
      return deleted ? [] : one('psc', false, `Statement about persons with significant control: ${humanise(d.statement) || 'filed'}`, `psc-statement:${id}`)
    case '/charges': {
      if (deleted) return []
      const what = text((d.classification as Record<string, unknown> | undefined)?.description) ?? 'a charge'
      const key = `charge:${event.resource_id || event.resource_uri}:${id}`
      return String(d.status) === 'fully-satisfied' ? one('charges', false, `Charge satisfied: ${what}`, key) : one('charges', false, `Charge registered or changed: ${what}`, key)
    }
    case '/insolvency-cases': {
      if (deleted) return []
      const cases = Array.isArray(d.cases) ? (d.cases as Array<Record<string, unknown>>) : []
      const kind = humanise(cases[0]?.type) || 'Insolvency case'
      return one('insolvency', true, `Insolvency: ${kind}`, `insolvency:${id}`)
    }
    case '/company-exemptions':
      return deleted ? [] : one('other', false, 'Exemptions from filing or disclosure changed', `exemptions:${id}`)
    default:
      return []
  }
}

// ── Saving ───────────────────────────────────────────────────────────────────

/** Saves changes, each once (a repeated key is ignored). Returns the ids of those saved now. */
export function recordChanges(db: Database, company: Pick<WatchedCompany, 'company_number' | 'client_ref'>, source: 'check' | 'stream', drafts: readonly ChangeDraft[]): number[] {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO ch_changes (company_number, client_ref, source, category, red_flag, summary, detail, change_key, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const ids: number[] = []
  for (const c of drafts) {
    const r = insert.run(company.company_number, company.client_ref, source, c.category, c.red_flag ? 1 : 0, c.summary.slice(0, 500), c.detail ? JSON.stringify(c.detail) : null, c.key, c.published_at ?? null)
    if (r.changes) ids.push(Number(r.lastInsertRowid))
  }
  return ids
}

export function readState(db: Database, number: string): CompanyState | null {
  return (db.prepare('SELECT * FROM ch_company_state WHERE company_number = ?').get(number) as CompanyState | undefined) ?? null
}

function saveState(db: Database, s: CompanyState): void {
  const cols = Object.keys(s) as Array<keyof CompanyState>
  db.prepare(
    `INSERT INTO ch_company_state (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
     ON CONFLICT(company_number) DO UPDATE SET ${cols.filter((c) => c !== 'company_number').map((c) => `${c} = excluded.${c}`).join(', ')}`
  ).run(...cols.map((c) => s[c]))
}

/**
 * Applies Companies House dates and status to a client, recording only what
 * changed, with its previous value. `who` null: the app did it (the daily check).
 */
export function applyCompanyDetails(db: Database, who: Actor | null, clientId: number, set: Record<string, string | null>, action = 'Updated client from Companies House'): boolean {
  const before = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as Row | undefined
  if (!before) return false
  const differs = (c: string): boolean =>
    c === 'company_status'
      ? String(set[c] ?? '').toLowerCase() !== String(before[c] ?? '').toLowerCase()
      : (set[c] ?? null) !== (before[c] ?? null)
  // An empty value from Companies House never clears what the practice holds.
  const cols = Object.keys(set).filter((c) => set[c] !== null && set[c] !== undefined && set[c] !== '' && differs(c))
  if (!cols.length) return false
  db.prepare(`UPDATE clients SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...cols.map((c) => set[c]), clientId)
  const after = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as Row
  const diff = auditChanges('clients', before, after, ['ref', 'client_name'])
  if (diff) writeAudit(db, who, action, 'clients', clientId, diff.before, diff.after)
  return true
}

export interface RecordedProfile {
  /** The changes saved now. */
  changeIds: number[]
  firstCheck: boolean
  /** The client record's dates or status were brought up to date. */
  clientUpdated: boolean
}

/**
 * Saves a company's profile as checked now: the changes since the last one,
 * the new state, and — unless told not to — the client's accounts and
 * confirmation statement due dates and company status (audited, by the app).
 * One transaction.
 */
export function recordProfile(
  db: Database,
  company: Pick<WatchedCompany, 'company_number' | 'client_ref' | 'client_id'>,
  profile: ChProfile,
  now: Date,
  opts: { source?: 'check' | 'stream'; who?: Actor | null; updateClient?: boolean } = {}
): RecordedProfile {
  return db.transaction((): RecordedProfile => {
    if (!text(profile.company_status)) throw new Error('A company profile without a status')
    const before = readState(db, company.company_number)
    // The whole profile, from the check or the stream: a part it leaves out is no longer there.
    const after = stateFromProfile(company.company_number, profile, sqlTime(now))
    // Before the first proper check, a "not found" row holds no profile to compare with.
    const comparable = before && before.status !== null ? before : null
    const changes = compareProfile(comparable, after)
    saveState(db, after)
    const changeIds = recordChanges(db, company, opts.source ?? 'check', changes)
    let clientUpdated = false
    if (opts.updateClient !== false) {
      clientUpdated = applyCompanyDetails(db, opts.who ?? null, company.client_id, {
        accounts_due: after.accounts_next_due,
        conf_stmt_due: after.cs_next_due,
        company_status: registerStatus(after)
      })
    }
    return { changeIds, firstCheck: !comparable, clientUpdated }
  })()
}

/** Notes that a company couldn't be checked, keeping what was known before. */
export function recordProblem(db: Database, number: string, problem: string, now: Date): void {
  const before = readState(db, number)
  saveState(db, {
    ...(before ?? stateFromProfile(number, {}, sqlTime(now))),
    company_number: number,
    checked_at: sqlTime(now),
    problem: problem.slice(0, 300)
  })
}

// ── Reading ──────────────────────────────────────────────────────────────────

const CATEGORIES: readonly ChChangeCategory[] = [
  'status', 'strike_off', 'accounts_overdue', 'confirmation_overdue', 'accounts', 'confirmation', 'officers', 'psc', 'charges', 'insolvency', 'address', 'name', 'filing', 'other'
]

/** The recent changes for the clients this person may see, newest first. */
export function listChanges(db: Database, actor: Actor, query?: unknown): ChChange[] {
  const q = (query && typeof query === 'object' ? query : {}) as ChChangeQuery
  const days = q.days ?? 14
  if (!Number.isInteger(days) || days < 1 || days > 400) throw new UserFacingError('Choose how many days of changes to show: 1 to 400.')
  if (q.clientRef !== undefined && (typeof q.clientRef !== 'string' || !q.clientRef || q.clientRef.length > 64)) throw new UserFacingError('That isn’t a client reference.')
  if (q.category !== undefined && !CATEGORIES.includes(q.category)) throw new UserFacingError('Choose a kind of change from the list.')
  if (q.limit !== undefined && !(Number.isInteger(q.limit) && q.limit >= 1 && q.limit <= 1000)) throw new UserFacingError('Show 1 to 1000 changes.')
  const limit = q.limit ?? 300
  const params: unknown[] = [`-${days} days`]
  let sql = `
    SELECT ch.id, ch.company_number, ch.client_ref, c.id AS client_id, COALESCE(c.client_name, ch.client_ref, ch.company_number) AS client_name,
           c.assigned_to, ch.source, ch.category, ch.red_flag, ch.summary, ch.published_at, ch.found_at
      FROM ch_changes ch LEFT JOIN clients c ON c.ref = ch.client_ref
     WHERE ch.found_at >= datetime('now', ?)`
  if (actor.role === 'staff') {
    sql += ' AND c.assigned_to = ?'
    params.push(actor.name)
  }
  if (q.clientRef !== undefined) {
    sql += ' AND ch.client_ref = ?'
    params.push(q.clientRef)
  }
  if (q.redFlagsOnly) sql += ' AND ch.red_flag = 1'
  if (q.category) {
    sql += ' AND ch.category = ?'
    params.push(q.category)
  }
  sql += ' ORDER BY ch.found_at DESC, ch.id DESC LIMIT ?'
  params.push(limit)
  const rows = db.prepare(sql).all(...params) as Array<Omit<ChChange, 'red_flag'> & { red_flag: number }>
  return rows.map((r) => ({ ...r, red_flag: r.red_flag === 1 }))
}

/** One client company's latest state, if it has been checked. */
export function companyStateFor(db: Database, number: string | null): CompanyState | null {
  return number ? readState(db, number) : null
}
