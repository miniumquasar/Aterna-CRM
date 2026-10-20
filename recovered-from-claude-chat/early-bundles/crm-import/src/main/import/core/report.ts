/**
 * Dry-run report: what an import WOULD do, before anything is written.
 * Same object drives the CLI's Markdown file and the app's preview screen.
 */

import type { ImportReport, ImportTableStats, IssueSeverity } from '@shared/types'
import { OBLIGATION_LABELS } from '@shared/types'
import type { CanonicalBundle } from './canonical'
import type { Plan } from './engine'
import type { Projection } from './project'
import { RULES_VERSION, addDays, type IsoDate } from './rules'

const emptyStats = (): ImportTableStats => ({ insert: 0, update: 0, unchanged: 0, link: 0, conflicts: 0 })
const cut = (s: string, n = 140): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function buildReport(args: {
  bundle: CanonicalBundle
  projection: Projection
  plan: Plan
  today: IsoDate
  includeSensitive: boolean
}): ImportReport {
  const { bundle, projection, plan, today, includeSensitive } = args

  const tables: Record<string, ImportTableStats> = {}
  const totals = emptyStats()
  for (const o of plan.ops) {
    const t = (tables[o.table] ??= emptyStats())
    const kind = o.action === 'unchanged' && !o.prevMapping ? 'link' : o.action
    t[kind] += 1
    totals[kind] += 1
    t.conflicts += o.conflicts.length
    totals.conflicts += o.conflicts.length
  }

  const allIssues = [...bundle.issues, ...bundle.findings, ...projection.findings]
  const bySeverity: Record<IssueSeverity, number> = { high: 0, medium: 0, low: 0 }
  const groups = new Map<string, { type: string; severity: IssueSeverity; count: number; examples: string[] }>()
  for (const i of allIssues) {
    bySeverity[i.severity] += 1
    const g = groups.get(`${i.type}|${i.severity}`) ?? { type: i.type, severity: i.severity, count: 0, examples: [] }
    g.count += 1
    if (g.examples.length < 3) g.examples.push(cut(`${i.clientKey ?? 'practice'}: ${i.description}`))
    groups.set(`${i.type}|${i.severity}`, g)
  }
  const rank: Record<IssueSeverity, number> = { high: 0, medium: 1, low: 2 }
  const byType = [...groups.values()].sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count)

  const conflicts = plan.ops.flatMap((o) => o.conflicts.map((c) => ({
    table: o.table, key: o.key, column: c.column,
    crm: c.crm === null ? null : String(c.crm), source: c.source === null ? null : String(c.source)
  }))).slice(0, 200)

  const excluded = [...bundle.excluded]
  if (!includeSensitive && projection.sensitiveWithheld) {
    excluded.push({
      what: 'Sensitive identifiers (CH auth codes, personal codes, gateway user IDs)', count: projection.sensitiveWithheld,
      reason: 'Held back because the target database is not keyed with a real passphrase. Re-run once it is.'
    })
  }

  // ── Insights: practice-level facts the new registers make visible ─────────
  const liveClient = new Map(bundle.clients.map((c) => [c.key, c.engagementStatus !== 'Former client' && c.companyStatus !== 'dissolved']))
  const open = (p: Projection['periods'][number]): boolean =>
    !p.archived && !p.filedDate && p.status !== 'filed' && p.status !== 'not_applicable'
  const insights: ImportReport['insights'] = []

  const withCode = new Set(bundle.contacts.filter((c) => c.personalCode).map((c) => c.clientKey))
  const activeCos = bundle.clients.filter((c) => c.engagementStatus === 'Active' && c.companyStatus === 'active' && (c.category === 'company' || c.category === 'llp'))
  const noCode = activeCos.filter((c) => !withCode.has(c.key))
  const in60 = addDays(today, 60)
  const csSoon = noCode.filter((c) => projection.periods.some((p) => p.clientKey === c.key && p.obligation === 'confirmation_statement' &&
    open(p) && p.dueDate !== null && p.dueDate >= today && p.dueDate <= in60))
  insights.push({
    title: 'Director identity verification', count: noCode.length,
    detail: `${noCode.length} of ${activeCos.length} active companies have no director personal code on file; ` +
      `${csSoon.length} of those have a confirmation statement due by ${in60}.`
  })

  const in183 = addDays(today, 183)
  const ae = projection.periods.filter((p) => p.obligation === 'ae_redeclaration' && liveClient.get(p.clientKey))
  const aeSoon = ae.filter((p) => p.status !== 'unknown' && p.dueDate !== null && p.dueDate >= today && p.dueDate <= in183).length
  const aeCheck = ae.filter((p) => p.status === 'unknown').length
  insights.push({
    title: 'Auto-enrolment re-declarations', count: aeSoon,
    detail: `${aeSoon} re-declarations fall due by ${in183} on TPR's rule (assuming anniversary re-enrolment); ` +
      `${aeCheck} deadline(s) passed in the last six months and need confirming.`
  })

  const overdue = new Map<string, number>()
  for (const p of projection.periods) {
    if (open(p) && p.dueDate && p.dueDate < today && liveClient.get(p.clientKey)) {
      overdue.set(p.obligation, (overdue.get(p.obligation) ?? 0) + 1)
    }
  }
  const overdueTotal = [...overdue.values()].reduce((a, b) => a + b, 0)
  insights.push({
    title: 'Open items already past their due date', count: overdueTotal,
    detail: overdueTotal
      ? `${[...overdue].map(([k, n]) => `${OBLIGATION_LABELS[k as keyof typeof OBLIGATION_LABELS]} ${n}`).join(', ')}. ` +
        'Most are likely filed but never written back — record filed dates or they stay on the worklist.'
      : 'None.'
  })
  insights.push({
    title: 'High-severity data issues', count: bySeverity.high,
    detail: `${bySeverity.high} high, ${bySeverity.medium} medium, ${bySeverity.low} low — all land in the data-issue register.`
  })

  const warnings = [...bundle.warnings, ...plan.warnings]
  if (plan.skipped.length) {
    const reasons = new Map<string, number>()
    for (const s of plan.skipped) reasons.set(`${s.table}: ${s.reason}`, (reasons.get(`${s.table}: ${s.reason}`) ?? 0) + 1)
    warnings.push(...[...reasons].map(([r, n]) => `Skipped ${n} × ${r}`))
  }
  for (const u of bundle.unmappedColumns) warnings.push(`Unmapped column ${u.sheet}.${u.column}`)

  return {
    adapter: bundle.adapter, sourceSystem: bundle.sourceSystem, file: bundle.file,
    generatedAt: new Date().toISOString(), today, rulesVersion: RULES_VERSION, fingerprint: plan.fingerprint, includeSensitive,
    totals: { ...totals, issues: allIssues.length }, tables, clientMatching: plan.clientMatching,
    issues: { bySeverity, byType }, dueDates: projection.dueDates, conflicts, excluded, insights, warnings
  }
}

export function renderMarkdown(r: ImportReport): string {
  const L: string[] = []
  const row = (...cells: Array<string | number>): string => `| ${cells.join(' | ')} |`
  L.push(`# Import preview — ${r.file.name}`, '')
  L.push('**Nothing has been written.** This is a dry run.', '')
  L.push(`- Adapter: ${r.adapter.label} v${r.adapter.version}`)
  L.push(`- File SHA-256: \`${r.file.sha256}\` (${(r.file.size / 1024).toFixed(0)} KB)`)
  L.push(`- Practice date: ${r.today} · deadline rules ${r.rulesVersion} · generated ${r.generatedAt}`)
  L.push(`- Sensitive identifiers: ${r.includeSensitive ? 'included' : 'held back'}`)
  L.push(`- Plan fingerprint: \`${r.fingerprint}\``, '')
  L.push('To commit exactly this plan, pass the fingerprint above. If the file or the database changes first, the commit is refused.', '')

  L.push('## What would change', '', row('Table', 'Insert', 'Update', 'Unchanged', 'Link', 'Conflicts'), row('---', '--:', '--:', '--:', '--:', '--:'))
  for (const [t, s] of Object.entries(r.tables)) L.push(row(t, s.insert, s.update, s.unchanged, s.link, s.conflicts))
  L.push(row('**Total**', r.totals.insert, r.totals.update, r.totals.unchanged, r.totals.link, r.totals.conflicts), '')
  L.push('*Link* = an existing CRM row matched for the first time; only its blank fields are filled.', '')

  const m = r.clientMatching
  L.push('## Client matching', '', `New ${m.new} · by previous import ${m.externalId} · by company number ${m.crn} · by UTR ${m.utr} · by exact name ${m.name}`, '')

  L.push('## Insights', '')
  for (const i of r.insights) L.push(`- **${i.title}** — ${i.detail}`)
  L.push('')

  L.push('## Due dates', '', row('Obligation', 'Rule only', 'Source = rule', 'Source ≠ rule', 'Source only', 'None'), row('---', '--:', '--:', '--:', '--:', '--:'))
  for (const d of r.dueDates) {
    L.push(row(OBLIGATION_LABELS[d.obligation], d.rule, d.sourceMatchesRule, d.sourceDiffersFromRule, d.sourceOnly, d.none))
  }
  L.push('', 'Where the source and the statutory rule disagree, the source date is kept and the rule date is stored alongside it.', '')

  L.push(`## Data issues (${r.totals.issues})`, '', `High ${r.issues.bySeverity.high} · Medium ${r.issues.bySeverity.medium} · Low ${r.issues.bySeverity.low}`, '')
  L.push(row('Severity', 'Type', 'Count', 'Examples'), row('---', '---', '--:', '---'))
  for (const g of r.issues.byType.slice(0, 60)) {
    L.push(row(g.severity, g.type, g.count, g.examples.map((e) => e.replace(/\|/g, '/')).join('<br>')))
  }
  if (r.issues.byType.length > 60) L.push('', `…and ${r.issues.byType.length - 60} more issue types (see the JSON report).`)
  L.push('')

  if (r.conflicts.length) {
    L.push(`## Conflicts — CRM value kept (${r.totals.conflicts})`, '', row('Table', 'Record', 'Column', 'CRM', 'Source'), row('---', '---', '---', '---', '---'))
    for (const c of r.conflicts.slice(0, 50)) L.push(row(c.table, c.key, c.column, c.crm ?? '∅', c.source ?? '∅'))
    L.push('')
  }

  L.push('## Not imported', '')
  for (const e of r.excluded) L.push(`- **${e.what}** (${e.count}) — ${e.reason}`)
  L.push('')
  if (r.warnings.length) {
    L.push('## Warnings', '')
    for (const w of r.warnings) L.push(`- ${w}`)
    L.push('')
  }
  return L.join('\n')
}
