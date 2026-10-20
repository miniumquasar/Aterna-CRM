/**
 * The practice report: the figures on the Reports screen, and the same figures
 * as a PDF. Real records only — clients, deadlines, money owed and open work —
 * for the person's own clients when they are staff, the whole practice
 * otherwise.
 *
 * The PDF names the firm the licence is issued to on every page, so a report
 * always shows whose licence produced it.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { ObligationType, PracticeReport } from '../../shared/types'
import { OBLIGATION_LABELS } from '../../shared/types'
import { formatPence } from '../../shared/money'
import { staffClients, where, type Actor } from '../access/policy'
import { localDate } from './common'
import { openDeadlines } from './deadlines'
import { allClientReceivables } from './receivables'


const tally = (values: Array<string | null>, empty: string): Array<{ label: string; count: number }> => {
  const m = new Map<string, number>()
  for (const v of values) {
    const k = v && v.trim() ? v.trim() : empty
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  company: 'Companies', individual: 'Individuals', partnership: 'Partnerships', llp: 'LLPs', trust: 'Trusts', sole_trader: 'Sole traders', charity: 'Charities'
}

export function practiceReport(db: Database, actor: Actor, today: string = localDate()): PracticeReport {
  const own = actor.role === 'staff'
  const mine = own ? { sql: 'assigned_to = ?', params: [actor.name] } : { sql: '', params: [] }
  const c = where(mine)
  const clients = db.prepare(`SELECT status, client_category FROM clients${c.sql}`).all(...c.params) as Array<{ status: string | null; client_category: string | null }>

  // The one open-deadline list Home, Deadlines and Forecast read: the register and the dates on the client record.
  const deadlines = openDeadlines(db, actor, { withinDays: 90 }, today)
  const byType = new Map<string, { overdue: number; within30: number; within90: number }>()
  let overdue = 0
  let within30 = 0
  let within90 = 0
  for (const d of deadlines) {
    const days = d.days
    const label = OBLIGATION_LABELS[d.obligation as ObligationType] ?? d.obligation
    const t = byType.get(label) ?? { overdue: 0, within30: 0, within90: 0 }
    if (days < 0) {
      t.overdue += 1
      overdue += 1
    } else {
      t.within90 += 1
      within90 += 1
      if (days <= 30) {
        t.within30 += 1
        within30 += 1
      }
    }
    byType.set(label, t)
  }

  const ar = allClientReceivables(db, actor)
  const names = new Map((db.prepare(`SELECT ref, client_name FROM clients${c.sql}`).all(...c.params) as Array<{ ref: string; client_name: string }>).map((r) => [r.ref, r.client_name]))
  const sum = (k: 'invoiced_pence' | 'received_pence' | 'outstanding_pence' | 'credit_pence' | 'overdue_pence' | 'bucket_current_pence' | 'bucket_1_30_pence' | 'bucket_31_60_pence' | 'bucket_61_90_pence' | 'bucket_over_90_pence'): number =>
    ar.reduce((n, a) => n + a[k], 0)

  const taskScope = staffClients(actor, 'client_ref')
  const t = where(taskScope.sql ? { sql: `${taskScope.sql} OR assigned_to = ?`, params: [...taskScope.params, actor.name] } : taskScope, {
    sql: "lower(COALESCE(status, '')) NOT IN ('completed', 'done', 'cancelled')", params: []
  })
  const tasks = db.prepare(`SELECT due_date FROM tasks${t.sql}`).all(...t.params) as Array<{ due_date: string | null }>
  const w = where(staffClients(actor, 'client_ref'), { sql: "lower(COALESCE(status, '')) NOT IN ('completed', 'done', 'billed', 'cancelled')", params: [] })
  const openWip = (db.prepare(`SELECT COUNT(*) AS n FROM wip_items${w.sql}`).get(...w.params) as { n: number }).n

  return {
    today,
    scope: own ? 'own' : 'practice',
    clients: {
      total: clients.length,
      byStatus: tally(clients.map((x) => x.status), 'No status'),
      byCategory: tally(clients.map((x) => (x.client_category ? CATEGORY_LABELS[x.client_category] ?? x.client_category : null)), 'Not set')
    },
    deadlines: {
      overdue, within30, within90,
      byType: [...byType.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.overdue + b.within90 - (a.overdue + a.within90) || a.type.localeCompare(b.type))
    },
    money: {
      invoiced_pence: sum('invoiced_pence'), received_pence: sum('received_pence'), outstanding_pence: sum('outstanding_pence'),
      credit_pence: sum('credit_pence'), overdue_pence: sum('overdue_pence'),
      buckets: [
        { label: 'Not due', pence: sum('bucket_current_pence') }, { label: '1–30 days', pence: sum('bucket_1_30_pence') },
        { label: '31–60 days', pence: sum('bucket_31_60_pence') }, { label: '61–90 days', pence: sum('bucket_61_90_pence') },
        { label: 'Over 90 days', pence: sum('bucket_over_90_pence') }
      ],
      clientsOwing: ar.filter((a) => a.outstanding_pence > 0).length,
      topOwing: ar
        .filter((a) => a.outstanding_pence > 0)
        .sort((a, b) => b.outstanding_pence - a.outstanding_pence || a.client_ref.localeCompare(b.client_ref))
        .slice(0, 10)
        .map((a) => ({ ref: a.client_ref, name: names.get(a.client_ref) ?? a.client_ref, owed_pence: a.outstanding_pence, overdue_pence: a.overdue_pence }))
    },
    work: {
      openTasks: tasks.length,
      overdueTasks: tasks.filter((x) => x.due_date && x.due_date.slice(0, 10) < today).length,
      openWip
    }
  }
}

// ── The printable page ───────────────────────────────────────────────────────

const esc = (s: string): string => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string)
const longDate = (iso: string): string => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const n = (v: number): string => v.toLocaleString('en-GB')

/** "Licensed to Firm Ltd", or what a trial copy says. Goes on every page of every report. */
export const licenceLine = (licensedTo: string | null): string => (licensedTo ? `Licensed to ${licensedTo}` : 'Free trial copy — not yet licensed')

export function practiceReportHtml(r: PracticeReport, meta: { practice: string; licensedTo: string | null; preparedFor: string }): string {
  const rows = (cells: string[][]): string => cells.map((c) => `<tr>${c.map((x, i) => `<td${i ? ' class="num"' : ''}>${x}</td>`).join('')}</tr>`).join('')
  const deadlineRows = r.deadlines.byType.length
    ? rows(r.deadlines.byType.map((d) => [esc(d.type), n(d.overdue), n(d.within30), n(d.within90)]))
    : '<tr><td colspan="4" class="none">No deadlines overdue or due in the next 90 days.</td></tr>'
  const owing = r.money.topOwing.length
    ? rows(r.money.topOwing.map((o) => [`${esc(o.name)} <span class="ref">${esc(o.ref)}</span>`, esc(formatPence(o.owed_pence)), esc(formatPence(o.overdue_pence))]))
    : '<tr><td colspan="3" class="none">No client owes anything.</td></tr>'
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${esc(meta.practice)} — practice report</title>
<style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.45 "Segoe UI", -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1c2430; margin: 0; }
  header { border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 18px; }
  h1 { font-size: 19pt; font-weight: 600; margin: 0; }
  .sub { color: #5b6573; margin-top: 4px; }
  .licence { color: #0f766e; font-weight: 600; margin-top: 2px; }
  h2 { font-size: 12pt; margin: 22px 0 8px; color: #0f766e; break-after: avoid; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .card { border: 1px solid #d5dbe3; border-radius: 6px; padding: 8px 10px; }
  .card b { display: block; font-size: 15pt; font-weight: 600; }
  .card span { color: #5b6573; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; break-inside: auto; }
  th { text-align: left; font-weight: 600; font-size: 9pt; color: #5b6573; border-bottom: 1px solid #c5ccd6; padding: 4px 6px; }
  td { border-bottom: 1px solid #e6eaef; padding: 4px 6px; }
  tr { break-inside: avoid; }
  .num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .ref { color: #8a93a0; font-size: 8.5pt; }
  .none { color: #8a93a0; font-style: italic; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
</style></head>
<body>
<header>
  <h1>${esc(meta.practice)} — practice report</h1>
  <div class="sub">${esc(longDate(r.today))} · prepared for ${esc(meta.preparedFor)} · ${r.scope === 'own' ? 'the clients assigned to you' : 'the whole practice'}</div>
  <div class="licence">AETERNA CRM · ${esc(licenceLine(meta.licensedTo))}</div>
</header>

<h2>At a glance</h2>
<div class="cards">
  <div class="card"><b>${n(r.clients.total)}</b><span>clients</span></div>
  <div class="card"><b>${n(r.deadlines.overdue)}</b><span>deadlines overdue</span></div>
  <div class="card"><b>${esc(formatPence(r.money.outstanding_pence))}</b><span>owed by ${n(r.money.clientsOwing)} client${r.money.clientsOwing === 1 ? '' : 's'}</span></div>
  <div class="card"><b>${n(r.work.overdueTasks)}</b><span>tasks overdue of ${n(r.work.openTasks)} open</span></div>
</div>

<h2>Deadlines</h2>
<table><thead><tr><th>Obligation</th><th class="num">Overdue</th><th class="num">Due in 30 days</th><th class="num">Due in 90 days</th></tr></thead>
<tbody>${deadlineRows}</tbody></table>

<h2>What clients owe</h2>
<div class="two">
  <table><tbody>${rows([
    ['Invoiced', esc(formatPence(r.money.invoiced_pence))], ['Received', esc(formatPence(r.money.received_pence))],
    ['Owed', esc(formatPence(r.money.outstanding_pence))], ['Of which overdue', esc(formatPence(r.money.overdue_pence))],
    ['Held as credit', esc(formatPence(r.money.credit_pence))]
  ])}</tbody></table>
  <table><thead><tr><th>Days past due</th><th class="num">Owed</th></tr></thead><tbody>${rows(r.money.buckets.map((b) => [esc(b.label), esc(formatPence(b.pence))]))}</tbody></table>
</div>
<h2>Clients owing the most</h2>
<table><thead><tr><th>Client</th><th class="num">Owed</th><th class="num">Overdue</th></tr></thead><tbody>${owing}</tbody></table>

<h2>Clients</h2>
<div class="two">
  <table><thead><tr><th>Status</th><th class="num">Clients</th></tr></thead><tbody>${rows(r.clients.byStatus.map((s) => [esc(s.label), n(s.count)]))}</tbody></table>
  <table><thead><tr><th>Type</th><th class="num">Clients</th></tr></thead><tbody>${rows(r.clients.byCategory.map((s) => [esc(s.label), n(s.count)]))}</tbody></table>
</div>

<h2>Work</h2>
<table><tbody>${rows([['Open tasks', n(r.work.openTasks)], ['Tasks past their due date', n(r.work.overdueTasks)], ['Work in progress, open', n(r.work.openWip)]])}</tbody></table>
</body></html>`
}

/** The footer printed on every page: product, licence, date, page numbers. */
export function reportFooter(licensedTo: string | null, today: string): string {
  return `<div style="font: 7.5pt Arial, sans-serif; color: #5b6573; width: 100%; padding: 0 16mm; display: flex; justify-content: space-between;">
<span>AETERNA CRM · ${esc(licenceLine(licensedTo))} · ${esc(longDate(today))}</span>
<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`
}
