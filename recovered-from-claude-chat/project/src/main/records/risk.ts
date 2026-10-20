/**
 * Risk (Sentinel): every live client ranked by what needs attention, from the
 * practice's own records and what Companies House says. Each point has a reason
 * a person can check and act on, so the score is never a black box.
 *
 *   Deadlines        overdue: 15 for the first, 5 for each more (35 at most);
 *                    10 more when the oldest is over 90 days late
 *   Companies House  strike-off proposed 35 · a status other than active
 *                    (liquidation, administration, receivership…) 30 · accounts overdue there 15 ·
 *                    confirmation statement overdue 10 (from the daily check;
 *                    before a company's first check, from the client record)
 *   Fees             overdue 10; 6 more when some are over 90 days late
 *   AML              no check 8 · due diligence not complete 6 · review overdue 6 ·
 *                    high risk (the check, or the client's own rating) 8
 *   Engagement       no engagement letter recorded 5
 *   Authorisations   none in place and no 64-8 recorded 3 · one expired or a
 *                    request lapsed 6 · one expiring within 30 days 3
 *   Data issues      open ones: high 3, medium 1 (8 at most)
 *
 * The score is the total, at most 100: high 45 and over, medium 25 to 44, low
 * under 25, clear at 0. Missing paperwork alone keeps a client low; overdue
 * filings, Companies House red flags and unpaid fees move it up. Reasons that
 * apply to nearly every client are also reported once, as practice-wide gaps.
 * Staff see their own clients.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { ClientRisk, RiskBand, RiskFactor, RiskReport } from '../../shared/types'
import { formatPence } from '../../shared/money'
import { authorisationOverdue, authorisationService } from '../../shared/references'
import type { Actor } from '../access/policy'
import { companyNumber, isRedStatus, statusWords, STRIKE_OFF, type CompanyState } from './ch-watch'
import { localDate } from './common'
import { openDeadlines } from './deadlines'
import { allClientReceivables } from './receivables'

export const POINTS = {
  overdueFirst: 15,
  overdueMore: 5,
  overdueCap: 35,
  overdueLong: 10,
  strikeOff: 35,
  chStatus: 30,
  chAccounts: 15,
  chConfirmation: 10,
  feesOverdue: 10,
  feesLong: 6,
  amlMissing: 8,
  amlIncomplete: 6,
  amlReview: 6,
  highRisk: 8,
  engagementLetter: 5,
  noAuthorisation: 3,
  authorisationExpired: 6,
  authorisationExpiring: 3,
  issueHigh: 3,
  issueMedium: 1,
  issuesCap: 8
} as const

export const bandFor = (score: number): RiskBand => (score >= 45 ? 'high' : score >= 25 ? 'medium' : score > 0 ? 'low' : 'clear')

/** A reason that applies to at least this share of clients (and to 10 or more) is a practice-wide gap. */
const PRACTICE_WIDE = 0.9

/** Statuses on the client record (the import's words) that are red flags before a company's first check. */
const RECORD_STATUS: Readonly<Record<string, string>> = { liquidation: 'in liquidation', administration: 'in administration' }

/** The record-keeping reasons that can be practice-wide. */
const PRACTICE_GAP_CODES = ['aml_missing', 'engagement_letter', 'authorisation_missing'] as const

const LIVE = "COALESCE(c.status, 'Active') NOT IN ('Former client', 'Dissolved') AND COALESCE(c.company_status, '') <> 'dissolved'"

const longDate = (iso: string): string => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const daysText = (n: number): string => `${n} day${n === 1 ? '' : 's'}`
const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const serviceWords = (s: string): string => authorisationService(s)?.label ?? s.replace(/_/g, ' ')

interface ClientRow {
  id: number
  ref: string | null
  client_name: string
  assigned_to: string | null
  reg_no: string | null
  company_status: string | null
  engagement_letter: number | null
  signed_64_8: number | null
  risk_rating: string | null
}

/** The risk list for the clients this person may see, highest first. */
export function riskReport(db: Database, actor: Actor, today: string = localDate()): RiskReport {
  const staff = actor.role === 'staff'
  const clients = db.prepare(
    `SELECT c.id, c.ref, c.client_name, c.assigned_to, c.reg_no, c.company_status, c.engagement_letter, c.signed_64_8, c.risk_rating
       FROM clients c WHERE ${LIVE}${staff ? ' AND c.assigned_to = ?' : ''}`
  ).all(...(staff ? [actor.name] : [])) as ClientRow[]

  // Overdue deadlines by client: the open-deadline list Home and Deadlines show.
  const overdue = new Map<number, { count: number; oldest: number }>()
  for (const d of openDeadlines(db, actor, { withinDays: 0 }, today)) {
    if (d.days >= 0) continue
    const o = overdue.get(d.client_id) ?? { count: 0, oldest: 0 }
    o.count += 1
    o.oldest = Math.max(o.oldest, -d.days)
    overdue.set(d.client_id, o)
  }

  const aml = new Map(
    (db.prepare('SELECT client_ref, risk_level, cdd_completed, review_due_date FROM aml_records').all() as Array<{
      client_ref: string; risk_level: string | null; cdd_completed: number | null; review_due_date: string | null
    }>).map((r) => [r.client_ref, r])
  )

  const auths = new Map<string, Array<{ service: string; status: string; expires_on: string | null }>>()
  for (const a of db.prepare("SELECT client_ref, service, status, expires_on FROM agent_authorisations WHERE status <> 'removed'").all() as Array<{
    client_ref: string; service: string; status: string; expires_on: string | null
  }>) {
    const list = auths.get(a.client_ref) ?? []
    list.push(a)
    auths.set(a.client_ref, list)
  }

  const issues = new Map<string, { high: number; medium: number; low: number }>()
  for (const r of db.prepare(
    "SELECT client_ref, severity, COUNT(*) AS n FROM data_issues WHERE client_ref IS NOT NULL AND status IN ('open', 'in_progress') GROUP BY client_ref, severity"
  ).all() as Array<{ client_ref: string; severity: 'high' | 'medium' | 'low'; n: number }>) {
    const i = issues.get(r.client_ref) ?? { high: 0, medium: 0, low: 0 }
    i[r.severity] += r.n
    issues.set(r.client_ref, i)
  }

  const fees = new Map(allClientReceivables(db, actor).map((a) => [a.client_ref, a]))
  const ch = new Map((db.prepare('SELECT * FROM ch_company_state').all() as CompanyState[]).map((s) => [s.company_number, s]))

  const rows: ClientRisk[] = clients.map((c) => {
    const factors: RiskFactor[] = []
    const add = (code: string, points: number, label: string, target: RiskFactor['target']): void => {
      factors.push({ code, points, label, target })
    }
    const file = c.ref ? { route: 'client-file', clientRef: c.ref } : { route: 'clients', clientId: c.id }

    const od = overdue.get(c.id)
    if (od) {
      add('deadlines', Math.min(POINTS.overdueCap, POINTS.overdueFirst + POINTS.overdueMore * (od.count - 1)),
        od.count === 1 ? `A deadline is overdue, by ${daysText(od.oldest)}` : `${od.count} deadlines overdue, the oldest by ${daysText(od.oldest)}`, file)
      if (od.oldest > 90) add('deadlines_long', POINTS.overdueLong, 'Overdue for more than 90 days', file)
    }

    const number = companyNumber(c.reg_no)
    // The latest Companies House profile; before the first check, what the client record says.
    const state = number ? ch.get(number) : undefined
    const checked = !!state?.status
    const recorded = (c.company_status ?? '').toLowerCase()
    const chTarget = { route: 'pulse', clientRef: c.ref }
    if (checked ? state?.status_detail === STRIKE_OFF : recorded === 'strike_off') {
      add('ch_strike_off', POINTS.strikeOff, checked ? 'Strike-off proposed at Companies House' : 'Strike-off action, on the client record', chTarget)
    }
    if (checked && isRedStatus(state?.status ?? null)) add('ch_status', POINTS.chStatus, `Companies House status: ${statusWords(state?.status ?? null)}`, chTarget)
    else if (!checked && RECORD_STATUS[recorded]) add('ch_status', POINTS.chStatus, `${RECORD_STATUS[recorded].charAt(0).toUpperCase()}${RECORD_STATUS[recorded].slice(1)}, on the client record`, chTarget)
    if (state?.accounts_overdue === 1) {
      add('ch_accounts', POINTS.chAccounts, `Accounts overdue at Companies House${state.accounts_next_due ? ` (due ${longDate(state.accounts_next_due)})` : ''}`, chTarget)
    }
    if (state?.cs_overdue === 1) {
      add('ch_confirmation', POINTS.chConfirmation, `Confirmation statement overdue at Companies House${state.cs_next_due ? ` (due ${longDate(state.cs_next_due)})` : ''}`, chTarget)
    }

    const amlTarget = { route: 'compliance', clientRef: c.ref }
    const check = c.ref ? aml.get(c.ref) : undefined
    if (!check) add('aml_missing', POINTS.amlMissing, 'No AML check recorded', amlTarget)
    else {
      if (check.cdd_completed !== 1) add('aml_incomplete', POINTS.amlIncomplete, 'Customer due diligence not complete', amlTarget)
      if (check.review_due_date && check.review_due_date.slice(0, 10) < today) add('aml_review', POINTS.amlReview, `AML review overdue since ${longDate(check.review_due_date)}`, amlTarget)
    }
    if ((check?.risk_level ?? '').toLowerCase() === 'high' || (c.risk_rating ?? '').toLowerCase() === 'high') {
      add('high_risk', POINTS.highRisk, (check?.risk_level ?? '').toLowerCase() === 'high' ? 'High risk on the AML check' : 'Rated high risk by the practice', amlTarget)
    }

    if (c.engagement_letter !== 1) add('engagement_letter', POINTS.engagementLetter, 'No engagement letter recorded', { route: 'clients', clientId: c.id })

    const refsTarget = { route: 'references', clientRef: c.ref }
    const list = c.ref ? auths.get(c.ref) ?? [] : []
    const activeNow = list.filter((a) => a.status === 'active' && (!a.expires_on || a.expires_on >= today))
    // Expired, or a request or posted code past its date still waiting on the client.
    const expired = list.filter((a) => a.status === 'expired' || (a.status === 'active' && a.expires_on && a.expires_on < today) || authorisationOverdue(a.status, a.expires_on, today))
    const expiring = activeNow.filter((a) => a.expires_on && a.expires_on <= addDays(today, 30))
    if (!activeNow.length && c.signed_64_8 !== 1) add('authorisation_missing', POINTS.noAuthorisation, 'No agent authorisation in place, and no 64-8 recorded', refsTarget)
    if (expired.length) add('authorisation_expired', POINTS.authorisationExpired, `Agent authorisation expired or request lapsed: ${expired.map((a) => serviceWords(a.service)).join(', ')}`, refsTarget)
    if (expiring.length) {
      const first = expiring.sort((a, b) => String(a.expires_on).localeCompare(String(b.expires_on)))[0]
      add('authorisation_expiring', POINTS.authorisationExpiring, `Agent authorisation for ${serviceWords(first.service)} expires on ${longDate(first.expires_on as string)}`, refsTarget)
    }

    const iss = c.ref ? issues.get(c.ref) : undefined
    const issuePoints = iss ? Math.min(POINTS.issuesCap, iss.high * POINTS.issueHigh + iss.medium * POINTS.issueMedium) : 0
    if (iss && issuePoints > 0) {
      const total = iss.high + iss.medium + iss.low
      add('data_issues', issuePoints, `${total} data issue${total === 1 ? '' : 's'} open${iss.high ? ` (${iss.high} high)` : ''}`, file)
    }

    const ar = c.ref ? fees.get(c.ref) : undefined
    if (ar && ar.overdue_pence > 0) {
      add('fees_overdue', POINTS.feesOverdue, `${formatPence(ar.overdue_pence)} of fees overdue`, { route: 'payments' })
      if (ar.bucket_over_90_pence > 0) add('fees_long', POINTS.feesLong, `${formatPence(ar.bucket_over_90_pence)} of it over 90 days`, { route: 'payments' })
    }

    factors.sort((a, b) => b.points - a.points)
    const score = Math.min(100, factors.reduce((s, f) => s + f.points, 0))
    return { client_id: c.id, client_ref: c.ref, client_name: c.client_name, person: c.assigned_to, score, band: bandFor(score), factors }
  })

  rows.sort((a, b) => b.score - a.score || a.client_name.localeCompare(b.client_name, 'en-GB', { sensitivity: 'base' }))
  const counts: Record<RiskBand, number> = { high: 0, medium: 0, low: 0, clear: 0 }
  const factorCounts: Record<string, number> = {}
  for (const r of rows) {
    counts[r.band] += 1
    for (const f of r.factors) factorCounts[f.code] = (factorCounts[f.code] ?? 0) + 1
  }
  // Paperwork missing for nearly everyone is a gap in the practice's records, best put right once.
  const practiceGaps = PRACTICE_GAP_CODES
    .filter((code) => rows.length >= 10 && (factorCounts[code] ?? 0) >= rows.length * PRACTICE_WIDE)
    .map((code) => ({ code, clients: factorCounts[code] }))
  return { rows, counts, factorCounts, practiceGaps, generatedAt: new Date().toISOString() }
}
