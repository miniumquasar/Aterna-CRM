/**
 * Forecast (Oracle): the months ahead, from the practice's own records.
 *
 *   workload   open deadlines by the month they fall due — the same list Home
 *              and Compliance → Deadlines use — by kind of work and by person,
 *              with the overdue ones kept apart; open tasks; work in progress.
 *   fees       what the practice expects to bill: each active service's fee by
 *              how often it is billed (monthly, quarterly, annually, one-off),
 *              from its next date; a client's annual fee when its services have
 *              no fees. A fee with no next date is spread evenly over the year.
 *              Fees "as needed", or with no frequency, can't be forecast and are
 *              counted instead.
 *   cash       what is owed now (worked out exactly as Billing does), what falls
 *              due in each month ahead, and what was received in each month
 *              before.
 *
 * Money is whole pence throughout: a yearly fee spread over months is shared
 * out so the twelve months add up to the fee exactly. Staff see their own
 * clients. "Whose" narrows everything to one person's work, nobody's yet, or
 * your own: deadlines by their person, tasks and jobs by whom they're assigned
 * to, fees and money by the client's person.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { Forecast, ForecastMonth, ForecastWhose, ObligationType } from '../../shared/types'
import { OBLIGATION_LABELS } from '../../shared/types'
import { staffClients, UserFacingError, where, type Actor } from '../access/policy'
import { localDate } from './common'
import { openDeadlines } from './deadlines'
import { allClientReceivables, invoiceOwed } from './receivables'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_CHOICES = [3, 6, 12]
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/
const LIVE = "COALESCE(c.status, 'Active') NOT IN ('Former client', 'Dissolved') AND COALESCE(c.company_status, '') <> 'dissolved'"
const OPEN_TASK = "lower(COALESCE(t.status, '')) NOT IN ('completed', 'done', 'cancelled')"
const OPEN_WIP = "lower(COALESCE(w.status, '')) NOT IN ('completed', 'done', 'billed', 'cancelled')"

const norm = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase()

/** A month as a single number (year × 12 + month from 0), so months can be counted and stepped. */
const monthIndex = (iso: string): number => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1
const monthOf = (index: number): ForecastMonth => {
  const y = Math.floor(index / 12)
  const m = index - y * 12
  return { key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MONTH_NAMES[m]} ${y}` }
}

/** `count` months from `first` (a month index). */
export const monthsFrom = (first: number, count: number): ForecastMonth[] => Array.from({ length: count }, (_, i) => monthOf(first + i))

/** Days from `from` to the last day of the month `index` (both calendar dates). */
const daysToEndOf = (from: string, index: number): number => {
  const y = Math.floor(index / 12)
  const m = index - y * 12
  const last = Date.UTC(y, m + 1, 0)
  return Math.round((last - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
}

/** A yearly amount's share for one calendar month (0–11): the twelve shares add up to the amount exactly. */
export const monthlyShare = (yearly: number, calendarMonth: number): number => Math.floor(yearly / 12) + (calendarMonth < yearly % 12 ? 1 : 0)

/** How often a fee is billed, from the words on the service. */
export type Cadence = 'monthly' | 'quarterly' | 'annual' | 'one_off' | 'unscheduled'
export function cadenceOf(frequency: string | null): Cadence {
  const s = norm(frequency).replace(/[\s_-]+/g, ' ')
  if (/^(monthly|every month|per month|pcm)$/.test(s)) return 'monthly'
  if (/^(quarterly|every quarter|per quarter)$/.test(s)) return 'quarterly'
  if (/^(annually|annual|yearly|every year|per year|per annum|pa)$/.test(s)) return 'annual'
  if (/^(one off|once|one time|single)$/.test(s)) return 'one_off'
  return 'unscheduled'
}

interface Query {
  whose: ForecastWhose
  months: number
}

function readQuery(q: unknown): Query {
  const query = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>
  const months = query.months === undefined ? 12 : query.months
  if (typeof months !== 'number' || !MONTH_CHOICES.includes(months)) throw new UserFacingError('Choose 3, 6 or 12 months ahead.')
  const whose = query.whose === undefined ? 'everyone' : query.whose
  const ok =
    typeof whose === 'string' &&
    (whose === 'everyone' || whose === 'mine' || whose === 'nobody' || (whose.startsWith('person:') && whose.trim().length > 7 && whose.length <= 207))
  if (!ok) throw new UserFacingError('Choose whose work to show.')
  return { whose: whose as ForecastWhose, months }
}

/** Whether a person (on a deadline, task, job or client) is in the chosen "Whose". */
function matcher(whose: ForecastWhose, actor: Actor): (person: string | null) => boolean {
  if (whose === 'everyone') return () => true
  if (whose === 'nobody') return (p) => !norm(p)
  const name = whose === 'mine' ? norm(actor.name) : norm(whose.slice('person:'.length))
  return (p) => !!name && norm(p) === name
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

export function forecast(db: Database, actor: Actor, query?: unknown, today: string = localDate()): Forecast {
  const q = readQuery(query)
  const staff = actor.role === 'staff'
  const mine = matcher(q.whose, actor)
  const first = monthIndex(today)
  const months = monthsFrom(first, q.months)
  const last = first + q.months - 1
  const slot = (iso: string): number => monthIndex(iso) - first
  const zeros = (): number[] => new Array<number>(q.months).fill(0)

  // ── Workload: deadlines ─────────────────────────────────────────────────────
  const deadlines = openDeadlines(db, actor, { withinDays: Math.min(3650, Math.max(0, daysToEndOf(today, last))) }, today)
  const byMonth = zeros()
  const obligations = new Map<ObligationType, { overdue: number; byMonth: number[] }>()
  const persons = new Map<string, { person: string | null; overdue: number; byMonth: number[] }>()
  let overdue = 0
  let oldest = 0
  let nobodys = 0
  let shown = 0
  for (const d of deadlines) {
    if (!mine(d.person)) continue
    const i = d.days < 0 ? -1 : slot(d.due_date)
    if (i >= q.months) continue
    shown += 1
    if (!norm(d.person)) nobodys += 1
    const o = obligations.get(d.obligation) ?? { overdue: 0, byMonth: zeros() }
    const pk = norm(d.person)
    const p = persons.get(pk) ?? { person: d.person?.trim() || null, overdue: 0, byMonth: zeros() }
    if (i < 0) {
      overdue += 1
      oldest = Math.max(oldest, -d.days)
      o.overdue += 1
      p.overdue += 1
    } else {
      byMonth[i] += 1
      o.byMonth[i] += 1
      p.byMonth[i] += 1
    }
    obligations.set(d.obligation, o)
    persons.set(pk, p)
  }
  const total = (x: { overdue: number; byMonth: number[] }): number => x.overdue + x.byMonth.reduce((a, b) => a + b, 0)
  const byObligation = [...obligations.entries()]
    .map(([obligation, v]) => ({ obligation, label: OBLIGATION_LABELS[obligation] ?? obligation, overdue: v.overdue, byMonth: v.byMonth, total: total(v) }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'en-GB'))
  const byPerson = [...persons.values()]
    .map((v) => ({ person: v.person, overdue: v.overdue, byMonth: v.byMonth, total: total(v) }))
    .sort((a, b) => (a.person === null ? 1 : 0) - (b.person === null ? 1 : 0) || b.total - a.total || (a.person ?? '').localeCompare(b.person ?? '', 'en-GB'))
  const peak = byMonth.reduce((best, n, i) => (n > byMonth[best] ? i : best), 0)
  const busiest = byMonth[peak] > 0 ? { key: months[peak].key, label: months[peak].label, count: byMonth[peak] } : null

  // ── Workload: tasks and work in progress ───────────────────────────────────
  const taskScope = staffClients(actor, 't.client_ref')
  const tw = where(taskScope.sql ? { sql: `${taskScope.sql} OR t.assigned_to = ?`, params: [...taskScope.params, actor.name] } : taskScope, { sql: OPEN_TASK, params: [] })
  const tasks = { overdue: 0, byMonth: zeros(), undated: 0 }
  for (const t of db.prepare(`SELECT t.due_date, t.assigned_to FROM tasks t${tw.sql}`).all(...tw.params) as Array<{ due_date: string | null; assigned_to: string | null }>) {
    if (!mine(t.assigned_to)) continue
    if (!t.due_date || !ISO_DATE.test(t.due_date)) tasks.undated += 1
    else if (t.due_date.slice(0, 10) < today) tasks.overdue += 1
    else {
      const i = slot(t.due_date)
      if (i < q.months) tasks.byMonth[i] += 1
    }
  }
  const ww = where(staffClients(actor, 'w.client_ref'), { sql: OPEN_WIP, params: [] })
  const jobs = new Map<string, { person: string | null; open: number; late: number; dueThisMonth: number }>()
  for (const w of db.prepare(`SELECT COALESCE(NULLIF(trim(w.deadline), ''), w.due_date) AS due, w.assigned_to FROM wip_items w${ww.sql}`).all(...ww.params) as Array<{ due: string | null; assigned_to: string | null }>) {
    if (!mine(w.assigned_to)) continue
    const key = norm(w.assigned_to)
    const j = jobs.get(key) ?? { person: w.assigned_to?.trim() || null, open: 0, late: 0, dueThisMonth: 0 }
    j.open += 1
    if (w.due && ISO_DATE.test(w.due)) {
      if (w.due.slice(0, 10) < today) j.late += 1
      else if (monthIndex(w.due) === first) j.dueThisMonth += 1
    }
    jobs.set(key, j)
  }
  const wip = [...jobs.values()].sort((a, b) => (a.person === null ? 1 : 0) - (b.person === null ? 1 : 0) || b.open - a.open || (a.person ?? '').localeCompare(b.person ?? '', 'en-GB'))

  // ── Fees ───────────────────────────────────────────────────────────────────
  const clientScope = staff ? { sql: 'c.assigned_to = ?', params: [actor.name] } : { sql: '', params: [] }
  const cw = where(clientScope, { sql: LIVE, params: [] })
  const clients = (db.prepare(`SELECT c.ref, c.assigned_to, c.annual_fee_pence FROM clients c${cw.sql}`).all(...cw.params) as Array<{ ref: string | null; assigned_to: string | null; annual_fee_pence: number | null }>)
    .filter((c) => mine(c.assigned_to))
  const inScope = new Set(clients.flatMap((c) => (c.ref ? [c.ref] : [])))
  const fees = { annualPence: 0, byMonth: zeros(), oneOffPence: 0, clientsWithFees: 0, clientsWithout: 0, unscheduledServices: 0, spreadEvenly: 0 }
  const spread = (yearly: number): void => {
    for (let i = 0; i < q.months; i++) fees.byMonth[i] += monthlyShare(yearly, (first + i) % 12)
  }
  const every = (fee: number, step: number, next: string | null): void => {
    if (!next || !ISO_DATE.test(next)) {
      spread(fee * (12 / step))
      fees.spreadEvenly += 1
      return
    }
    const d = monthIndex(next)
    for (let i = 0; i < q.months; i++) {
      const t = first + i
      if (t >= d && (t - d) % step === 0) fees.byMonth[i] += fee
    }
  }
  const services = db.prepare(
    `SELECT s.client_ref, s.fee_pence, s.frequency, s.next_due FROM client_services s
      WHERE COALESCE(s.active, 1) = 1 AND s.fee_pence > 0`
  ).all() as Array<{ client_ref: string; fee_pence: number; frequency: string | null; next_due: string | null }>
  const withServiceFees = new Set<string>()
  for (const s of services) {
    if (!inScope.has(s.client_ref)) continue
    withServiceFees.add(s.client_ref)
    const cadence = cadenceOf(s.frequency)
    const dated = !!s.next_due && ISO_DATE.test(s.next_due)
    if (cadence === 'monthly') {
      fees.annualPence += s.fee_pence * 12
      // Every month; from its next date when that is still to come.
      if (dated) every(s.fee_pence, 1, s.next_due)
      else for (let i = 0; i < q.months; i++) fees.byMonth[i] += s.fee_pence
    } else if (cadence === 'quarterly') {
      fees.annualPence += s.fee_pence * 4
      every(s.fee_pence, 3, s.next_due)
    } else if (cadence === 'annual') {
      fees.annualPence += s.fee_pence
      every(s.fee_pence, 12, s.next_due)
    } else if (cadence === 'one_off' && dated) {
      // Billed once: in the month of its date, if that is one of the months shown.
      const i = slot(s.next_due as string)
      if (i >= 0 && i < q.months) {
        fees.byMonth[i] += s.fee_pence
        fees.oneOffPence += s.fee_pence
      }
    } else {
      // "As needed", no frequency, or a one-off with no date: there is nothing to place in a month.
      fees.unscheduledServices += 1
    }
  }
  for (const c of clients) {
    const annual = c.annual_fee_pence
    const hasServiceFee = !!c.ref && withServiceFees.has(c.ref)
    if (!hasServiceFee && typeof annual === 'number' && annual > 0) {
      fees.annualPence += annual
      spread(annual)
      fees.spreadEvenly += 1
    }
    if (hasServiceFee || (typeof annual === 'number' && annual > 0)) fees.clientsWithFees += 1
    else fees.clientsWithout += 1
  }

  // ── Cash ───────────────────────────────────────────────────────────────────
  const personOf = new Map(
    (db.prepare('SELECT ref, assigned_to FROM clients WHERE ref IS NOT NULL').all() as Array<{ ref: string; assigned_to: string | null }>).map((c) => [c.ref, c.assigned_to])
  )
  const clientMine = (ref: string | null): boolean => !!ref && mine(personOf.get(ref) ?? null)
  const cash = { owedPence: 0, overduePence: 0, creditPence: 0, expectedByMonth: zeros(), undatedPence: 0, received: [] as Forecast['cash']['received'], invoices: 0 }
  for (const ar of allClientReceivables(db, actor)) {
    if (!clientMine(ar.client_ref)) continue
    cash.owedPence += ar.outstanding_pence
    cash.overduePence += ar.overdue_pence
    cash.creditPence += ar.credit_pence
  }
  const owed = invoiceOwed(db, actor)
  const pw = where(staffClients(actor, 'p.client_ref'), { sql: 'p.client_ref IS NOT NULL', params: [] })
  for (const inv of db.prepare(`SELECT p.id, p.client_ref, p.due_date FROM payments p${pw.sql}`).all(...pw.params) as Array<{ id: number; client_ref: string; due_date: string | null }>) {
    if (!clientMine(inv.client_ref)) continue
    cash.invoices += 1
    const left = owed.get(inv.id) ?? 0
    if (left <= 0) continue
    if (!inv.due_date || !ISO_DATE.test(inv.due_date)) cash.undatedPence += left
    else if (inv.due_date.slice(0, 10) >= today) {
      const i = slot(inv.due_date)
      if (i < q.months) cash.expectedByMonth[i] += left
    }
  }
  const back = monthsFrom(first - q.months + 1, q.months)
  const received = new Map(back.map((m) => [m.key, 0]))
  const rw = where(staffClients(actor, 'r.client_ref'), { sql: 'r.receipt_date >= ?', params: [`${back[0].key}-01`] })
  for (const r of db.prepare(`SELECT r.client_ref, r.receipt_date, r.amount_pence FROM payment_receipts r${rw.sql}`).all(...rw.params) as Array<{ client_ref: string; receipt_date: string | null; amount_pence: number | null }>) {
    if (!clientMine(r.client_ref) || !r.receipt_date || !ISO_DATE.test(r.receipt_date)) continue
    const key = r.receipt_date.slice(0, 7)
    if (received.has(key)) received.set(key, (received.get(key) ?? 0) + (r.amount_pence ?? 0))
  }
  cash.received = back.map((m) => ({ key: m.key, label: m.label, pence: received.get(m.key) ?? 0 }))

  // ── Who can be shown, and what limits the forecast ─────────────────────────
  const people = new Set<string>()
  if (!staff) {
    const add = (p: string | null): void => {
      const t = p?.trim()
      if (t) people.add(t)
    }
    for (const d of deadlines) add(d.person)
    for (const r of db.prepare("SELECT name FROM users WHERE active = 1 UNION SELECT assigned_to FROM clients UNION SELECT assigned_to FROM tasks UNION SELECT assigned_to FROM wip_items").all() as Array<{ name: string | null }>) add(r.name)
  }
  const dedup = new Map<string, string>()
  for (const p of people) if (!dedup.has(norm(p))) dedup.set(norm(p), p)

  const notes: Forecast['notes'] = []
  if (!staff && q.whose === 'everyone' && nobodys > 0) {
    const assign = 'Assign clients to people (Clients: tick them, then Assign) to see who is busy when.'
    notes.push({
      code: 'unassigned',
      text: nobodys === shown
        ? `None of these ${plural(shown, 'deadline')} is assigned to anyone yet. ${assign}`
        : `${plural(nobodys, 'deadline')} of these ${shown.toLocaleString('en-GB')} ${nobodys === 1 ? 'is' : 'are'} nobody’s yet. ${assign}`
    })
  }
  if (fees.clientsWithFees === 0) {
    notes.push({ code: 'no_fees', text: 'No fees are recorded yet. Add each service’s fee and how often it is billed (open a client, then Services), or the client’s annual fee, and billing is forecast here.' })
  }
  if (fees.unscheduledServices > 0) {
    notes.push({
      code: 'unscheduled_fees',
      text: `${plural(fees.unscheduledServices, 'service fee')} ${fees.unscheduledServices === 1 ? 'has' : 'have'} no regular frequency or date (“As needed”, or none), so ${fees.unscheduledServices === 1 ? 'it is' : 'they are'} left out of the billing forecast.`
    })
  }
  if (cash.invoices === 0) notes.push({ code: 'no_invoices', text: 'No invoices yet. The cash view fills in as invoices and money received are recorded in Billing.' })

  return {
    today,
    scope: staff ? 'own' : 'practice',
    whose: q.whose,
    months,
    workload: { overdue, oldestOverdueDays: oldest, byMonth, byObligation, byPerson, busiest, tasks, wip },
    fees,
    cash,
    people: [...dedup.values()].sort((a, b) => a.localeCompare(b, 'en-GB', { sensitivity: 'base' })),
    notes
  }
}
