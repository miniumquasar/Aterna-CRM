/**
 * What the assistant on this computer is given to summarise: the practice's
 * forecast, or one client's file, as plain text. Only what a summary needs —
 * never a password, a tax reference, an NI number or an authorisation code.
 * The person sees exactly this text beside the summary, to check it against.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { Forecast, ObligationType } from '../../shared/types'
import { OBLIGATION_LABELS } from '../../shared/types'
import { formatPence } from '../../shared/money'
import { clientForActor, refArg, type Actor } from '../access/policy'
import { listChanges } from './ch-watch'
import { localDate } from './common'
import { openDeadlines } from './deadlines'
import { clientReceivables } from './receivables'
import { riskReport } from './risk'

export const FORECAST_INSTRUCTION =
  'You are helping a UK accountancy practice plan its months ahead. From the figures below, write a short briefing for the partner: ' +
  'where the pressure falls (which months, which people, what kind of work), what is overdue now, and the money owed and expected. ' +
  'Then give two or three practical suggestions. Use only the figures given; never invent figures or dates; if something is not recorded, say so. ' +
  'Plain British English, no more than 180 words.'

export const CLIENT_INSTRUCTION =
  'You are helping a UK accountancy practice. From the client record below, write a short briefing for the partner: what needs doing, ' +
  'most urgent first, with dates; anything at risk; and the next step. Use only the facts given; never invent figures or dates; ' +
  'if something is not recorded, say so. Plain British English, no more than 150 words.'

const pence = (n: number): string => formatPence(n)
const people = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** The forecast as the assistant reads it. */
export function forecastContext(f: Forecast): string {
  const lines: string[] = []
  const whose = f.whose === 'everyone' ? (f.scope === 'own' ? 'my clients' : 'the whole practice') : f.whose === 'mine' ? 'my own work' : f.whose === 'nobody' ? 'work nobody is assigned to' : f.whose.slice('person:'.length)
  lines.push(`Forecast for ${whose}, made on ${f.today}, for ${f.months[0].label} to ${f.months[f.months.length - 1].label}.`)
  const w = f.workload
  lines.push('', 'DEADLINES')
  lines.push(`Overdue now: ${w.overdue}${w.overdue ? `, the oldest ${w.oldestOverdueDays} days late` : ''}.`)
  lines.push(`Due by month: ${f.months.map((m, i) => `${m.label} ${w.byMonth[i]}`).join('; ')}.`)
  if (w.busiest) lines.push(`Busiest month: ${w.busiest.label} (${w.busiest.count}).`)
  if (w.byObligation.length) lines.push(`By kind of work (overdue + ahead): ${w.byObligation.slice(0, 8).map((o) => `${o.label} ${o.total} (${o.overdue} overdue)`).join('; ')}.`)
  if (w.byPerson.length) lines.push(`By person: ${w.byPerson.slice(0, 10).map((p) => `${p.person ?? 'nobody yet'} ${p.total} (${p.overdue} overdue)`).join('; ')}.`)
  const openTasks = w.tasks.overdue + w.tasks.undated + w.tasks.byMonth.reduce((a, b) => a + b, 0)
  lines.push(openTasks ? `Tasks: ${w.tasks.overdue} overdue; due by month: ${f.months.map((m, i) => `${m.label} ${w.tasks.byMonth[i]}`).join('; ')}; ${w.tasks.undated} with no date.` : 'Tasks: none open.')
  if (w.wip.length) lines.push(`Work in progress: ${w.wip.map((j) => `${j.person ?? 'nobody yet'} ${j.open} open, ${j.late} late`).join('; ')}.`)
  lines.push('', 'FEES')
  if (f.fees.clientsWithFees === 0) lines.push('No fees are recorded.')
  else {
    lines.push(`Recurring fees a year: ${pence(f.fees.annualPence)} from ${people(f.fees.clientsWithFees, 'client')}; ${people(f.fees.clientsWithout, 'live client')} with no fee recorded.`)
    lines.push(`Expected billing by month: ${f.months.map((m, i) => `${m.label} ${pence(f.fees.byMonth[i])}`).join('; ')}.`)
  }
  lines.push('', 'MONEY')
  if (f.cash.invoices === 0) lines.push('No invoices are recorded.')
  else {
    lines.push(`Owed to the practice now: ${pence(f.cash.owedPence)}, of which ${pence(f.cash.overduePence)} is overdue; ${pence(f.cash.creditPence)} held as credit.`)
    lines.push(`Falling due by month: ${f.months.map((m, i) => `${m.label} ${pence(f.cash.expectedByMonth[i])}`).join('; ')}${f.cash.undatedPence ? `; ${pence(f.cash.undatedPence)} with no due date` : ''}.`)
    lines.push(`Received by month: ${f.cash.received.map((r) => `${r.label} ${pence(r.pence)}`).join('; ')}.`)
  }
  if (f.notes.length) lines.push('', 'GAPS IN THE RECORDS', ...f.notes.map((n) => n.text))
  return lines.join('\n')
}

/** One client's file as the assistant reads it. Staff: their own clients only. */
export function clientContext(db: Database, actor: Actor, clientRef: unknown, today: string = localDate()): string {
  const client = clientForActor(db, refArg(clientRef), actor)
  const c = db.prepare(
    `SELECT client_name, ref, client_category, status, assigned_to, company_status, reg_no, engagement_letter, signed_64_8, year_end_month
       FROM clients WHERE ref = ?`
  ).get(client.ref) as {
    client_name: string; ref: string; client_category: string | null; status: string | null; assigned_to: string | null; company_status: string | null
    reg_no: string | null; engagement_letter: number | null; signed_64_8: number | null; year_end_month: string | null
  }
  const lines: string[] = []
  lines.push(`Client: ${c.client_name} (${c.ref}), ${c.client_category ?? 'type not recorded'}, status ${c.status ?? 'not recorded'}, looked after by ${c.assigned_to ?? 'nobody yet'}.`)
  if (c.reg_no) lines.push(`Company ${c.reg_no}${c.company_status ? `, ${c.company_status.replace(/_/g, ' ')}` : ''}${c.year_end_month ? `, year end month ${c.year_end_month}` : ''}.`)
  lines.push(`Engagement letter: ${c.engagement_letter === 1 ? 'recorded' : 'not recorded'}. 64-8: ${c.signed_64_8 === 1 ? 'recorded' : 'not recorded'}.`)

  const services = db.prepare('SELECT service_type FROM client_services WHERE client_ref = ? AND COALESCE(active, 1) = 1 ORDER BY service_type').all(client.ref) as Array<{ service_type: string }>
  if (services.length) lines.push(`Services: ${services.map((s) => s.service_type.replace(/_/g, ' ')).join(', ')}.`)

  const deadlines = openDeadlines(db, actor, { clientRef: client.ref, withinDays: 365 }, today)
  lines.push('', 'DEADLINES')
  if (!deadlines.length) lines.push('No open deadlines in the next year.')
  for (const d of deadlines.slice(0, 15)) {
    lines.push(`${OBLIGATION_LABELS[d.obligation as ObligationType] ?? d.obligation}: due ${d.due_date}${d.days < 0 ? `, overdue by ${-d.days} days` : `, in ${d.days} days`}${d.person ? `, with ${d.person}` : ''}.`)
  }

  const risk = riskReport(db, actor, today).rows.find((r) => r.client_ref === client.ref)
  if (risk) {
    lines.push('', `RISK: score ${risk.score} of 100 (${risk.band}).`)
    for (const f of risk.factors) lines.push(`${f.label} (+${f.points}).`)
  }

  const ar = clientReceivables(db, actor, client.ref)
  lines.push('', 'MONEY')
  lines.push(ar.invoiced_pence ? `Invoiced ${pence(ar.invoiced_pence)}; owed ${pence(ar.outstanding_pence)}, of which ${pence(ar.overdue_pence)} overdue; credit ${pence(ar.credit_pence)}.` : 'No invoices recorded.')

  const aml = db.prepare('SELECT risk_level, cdd_completed, review_due_date FROM aml_records WHERE client_ref = ?').get(client.ref) as
    | { risk_level: string | null; cdd_completed: number | null; review_due_date: string | null }
    | undefined
  lines.push('', 'AML')
  lines.push(aml ? `Risk ${aml.risk_level ?? 'not set'}; due diligence ${aml.cdd_completed === 1 ? 'complete' : 'not complete'}${aml.review_due_date ? `; review due ${aml.review_due_date.slice(0, 10)}` : ''}.` : 'No AML check recorded.')

  const issues = db.prepare("SELECT severity, description FROM data_issues WHERE client_ref = ? AND status IN ('open', 'in_progress') ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END LIMIT 8").all(client.ref) as Array<{ severity: string; description: string }>
  if (issues.length) {
    lines.push('', 'OPEN ISSUES IN THE RECORDS')
    for (const i of issues) lines.push(`${i.severity}: ${String(i.description).slice(0, 160)}`)
  }

  const calls = db.prepare(
    `SELECT date, type, summary, followup_date, COALESCE(followup_done, 0) AS done FROM interactions WHERE client_ref = ? ORDER BY date DESC, id DESC LIMIT 5`
  ).all(client.ref) as Array<{ date: string; type: string | null; summary: string; followup_date: string | null; done: number }>
  const messages = db.prepare('SELECT sent_at, channel, subject FROM communication_log WHERE client_ref = ? ORDER BY sent_at DESC, id DESC LIMIT 5').all(client.ref) as Array<{ sent_at: string; channel: string; subject: string | null }>
  if (calls.length || messages.length) {
    lines.push('', 'RECENT CONTACT')
    for (const i of calls) {
      lines.push(`${String(i.date).slice(0, 10)} ${i.type ?? 'note'}: ${String(i.summary).slice(0, 160)}${i.followup_date && !i.done ? ` (follow-up due ${String(i.followup_date).slice(0, 10)})` : ''}`)
    }
    for (const m of messages) lines.push(`${String(m.sent_at).slice(0, 10)} ${m.channel} sent: ${m.subject ?? '(no subject)'}`)
  }

  const changes = listChanges(db, actor, { days: 90, clientRef: client.ref, limit: 10 })
  if (changes.length) {
    lines.push('', 'COMPANIES HOUSE (LAST 90 DAYS)')
    for (const ch of changes) lines.push(`${ch.found_at.slice(0, 10)}${ch.red_flag ? ' RED FLAG' : ''}: ${ch.summary}`)
  }
  return lines.join('\n')
}
