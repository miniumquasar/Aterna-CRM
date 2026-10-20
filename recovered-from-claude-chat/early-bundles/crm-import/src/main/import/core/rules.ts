/**
 * Civil dates and UK statutory deadline rules.
 *
 * Dates are ISO `YYYY-MM-DD` strings throughout — never JS Date objects —
 * so no time-zone or DST shift can move a deadline by a day.
 *
 * Every rule is a pure function and is unit-tested. The importer records
 * which basis produced each due date (`rule`, `source`, …) so a statutory
 * change is a code change here plus a re-import, never a data hunt.
 */

export type IsoDate = string
export const RULES_VERSION = '2026.10'

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parts(d: IsoDate): [number, number, number] {
  const m = ISO_RE.exec(d)
  if (!m) throw new Error(`Not an ISO date: ${d}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

export function iso(y: number, m: number, d: number): IsoDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function isIsoDate(s: unknown): s is IsoDate {
  if (typeof s !== 'string') return false
  const m = ISO_RE.exec(s)
  if (!m) return false
  const mo = Number(m[2])
  const d = Number(m[3])
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(Number(m[1]), mo)
}

export function isMonthEnd(d: IsoDate): boolean {
  const [y, m, day] = parts(d)
  return day === daysInMonth(y, m)
}

export function endOfMonth(d: IsoDate): IsoDate {
  const [y, m] = parts(d)
  return iso(y, m, daysInMonth(y, m))
}

/** Calendar months with day clamping: 31 Jan + 1 month = 28/29 Feb. */
export function addMonths(d: IsoDate, n: number): IsoDate {
  const [y, m, day] = parts(d)
  const t = y * 12 + (m - 1) + n
  const ny = Math.floor(t / 12)
  const nm = (((t % 12) + 12) % 12) + 1
  return iso(ny, nm, Math.min(day, daysInMonth(ny, nm)))
}

/** Companies Act "corresponding date": a month-end maps to a month-end. */
export function addMonthsCorresponding(d: IsoDate, n: number): IsoDate {
  return isMonthEnd(d) ? endOfMonth(addMonths(d, n)) : addMonths(d, n)
}

export function addDays(d: IsoDate, n: number): IsoDate {
  const [y, m, day] = parts(d)
  const t = new Date(Date.UTC(y, m - 1, day + n))
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const [y1, m1, d1] = parts(from)
  const [y2, m2, d2] = parts(to)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

export function later(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b
}

/** Local civil date (the practice's calendar day), not UTC. */
export function todayIso(now: Date = new Date()): IsoDate {
  return iso(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

// ── Tax years ────────────────────────────────────────────────────────────────

const TAX_YEAR_RE = /^(\d{4})-(\d{2})$/

/** '2016-17' → 2017 (the calendar year in which the tax year ends). */
export function taxYearEndYear(taxYear: string): number | null {
  const m = TAX_YEAR_RE.exec(taxYear)
  if (!m) return null
  const start = Number(m[1])
  return (start + 1) % 100 === Number(m[2]) ? start + 1 : null
}

export function taxYearEnd(taxYear: string): IsoDate | null {
  const y = taxYearEndYear(taxYear)
  return y === null ? null : iso(y, 4, 5)
}

// ── Statutory rules ──────────────────────────────────────────────────────────

/**
 * Private company accounts to Companies House (CA 2006 s442).
 * Subsequent periods: 9 months after the accounting reference date (corresponding date).
 * First accounts covering more than 12 months: the later of 21 months after
 * incorporation and 3 months after the accounting reference date.
 */
export function accountsDue(periodEnd: IsoDate, opts: { firstAccounts?: boolean; incorporated?: IsoDate | null } = {}): IsoDate {
  const { firstAccounts = false, incorporated = null } = opts
  if (firstAccounts && incorporated && periodEnd > addMonths(incorporated, 12)) {
    return later(addMonthsCorresponding(incorporated, 21), addMonthsCorresponding(periodEnd, 3))
  }
  return addMonthsCorresponding(periodEnd, 9)
}

/** Confirmation statement: file within 14 days after the confirmation date. */
export function confirmationStatementDue(confirmationDate: IsoDate): IsoDate {
  return addDays(confirmationDate, 14)
}

/** Next confirmation date: 12 months after the last made-up-to date. */
export function nextConfirmationDate(lastMadeUpTo: IsoDate): IsoDate {
  return addMonths(lastMadeUpTo, 12)
}

/** CT600 filing: 12 months after the end of the accounting period. */
export function ct600Due(periodEnd: IsoDate): IsoDate {
  return addMonths(periodEnd, 12)
}

/** Corporation tax payment (non-quarterly-instalment companies): 9 months and 1 day. */
export function ctPaymentDue(periodEnd: IsoDate): IsoDate {
  return addDays(addMonths(periodEnd, 9), 1)
}

/**
 * VAT return and payment: 1 calendar month and 7 days after the period end.
 * Month-end periods run to the 7th of the second following month
 * (30 April → 7 June, not 6 June).
 */
export function vatReturnDue(periodEnd: IsoDate): IsoDate {
  return isMonthEnd(periodEnd)
    ? addDays(endOfMonth(addMonths(periodEnd, 1)), 7)
    : addDays(addMonths(periodEnd, 1), 7)
}

/** Self assessment online return: 31 January after the tax year ends. */
export function selfAssessmentDue(taxYear: string): IsoDate | null {
  const y = taxYearEndYear(taxYear)
  return y === null ? null : iso(y + 1, 1, 31)
}

/** P11D: 6 July after the tax year ends. */
export function p11dDue(taxYear: string): IsoDate | null {
  const y = taxYearEndYear(taxYear)
  return y === null ? null : iso(y, 7, 6)
}

export interface AeCycle {
  cycle: number
  anniversary: IsoDate
  deadline: IsoDate
}

/**
 * Auto-enrolment re-declaration (The Pensions Regulator): due within five
 * months of the third anniversary of the duties start date, then of each
 * previous re-enrolment date. Assumes each re-enrolment used the anniversary
 * (TPR's recommendation) — callers must surface that assumption.
 *
 * Returns the cycle whose deadline is today or later, plus the previous cycle
 * when its deadline passed within `lookbackDays` (worth confirming it was met).
 */
export function aeRedeclaration(
  dutiesStart: IsoDate,
  today: IsoDate,
  lookbackDays = 183
): { current: AeCycle; recentlyPassed: AeCycle | null } {
  const cycleAt = (k: number): AeCycle => {
    const anniversary = addMonths(dutiesStart, 36 * k)
    return { cycle: k, anniversary, deadline: addDays(addMonths(anniversary, 5), -1) }
  }
  let k = 1
  while (cycleAt(k).deadline < today) k += 1
  const prev = k > 1 ? cycleAt(k - 1) : null
  const recentlyPassed = prev && daysBetween(prev.deadline, today) <= lookbackDays ? prev : null
  return { current: cycleAt(k), recentlyPassed }
}
