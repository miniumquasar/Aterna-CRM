/**
 * Projector: canonical bundle → row intents for the engine.
 *
 * Source-format-agnostic. This is where the CRM's own rules apply to
 * imported data: due dates are resolved against statutory rules (and the
 * basis recorded), denormalised client fields that the existing scheduler
 * reads are derived from periods, and sensitive fields are withheld unless
 * the database is keyed.
 */

import type { ObligationType, IssueSeverity } from '@shared/types'
import { OBLIGATION_LABELS } from '@shared/types'
import type { CanonicalBundle, CanonicalIssue, CanonicalPeriod, SourceRef } from './canonical'
import { nameKey } from './normalise'
import {
  accountsDue, addDays, addMonths, confirmationStatementDue, ct600Due, ctPaymentDue, nextConfirmationDate,
  p11dDue, selfAssessmentDue, vatReturnDue, type IsoDate
} from './rules'

export type Scalar = string | number | null
export interface ClientToken { $client: string }
export interface ParentToken { $parent: { table: EntityTable; key: string } }
export type CellIn = Scalar | ClientToken | ParentToken

export type EntityTable =
  | 'lookup_values' | 'custom_field_defs' | 'clients' | 'client_services' | 'client_aliases' | 'client_contacts'
  | 'client_relationships' | 'compliance_periods' | 'payroll_schemes' | 'payroll_scheme_years' | 'pension_schemes'
  | 'sa_registrations' | 'client_income_sources' | 'logins' | 'data_issues' | 'custom_field_values'

/** Dependency order: parents before children. Commit follows it; rollback reverses it. */
export const TABLE_ORDER: readonly EntityTable[] = [
  'lookup_values', 'custom_field_defs', 'clients', 'client_services', 'client_aliases', 'client_contacts',
  'client_relationships', 'compliance_periods', 'payroll_schemes', 'payroll_scheme_years', 'pension_schemes',
  'sa_registrations', 'client_income_sources', 'logins', 'data_issues', 'custom_field_values'
]

export interface RowIntent {
  table: EntityTable
  key: string
  source: SourceRef
  /** Natural-key columns used to find an existing row when no external id is known. */
  match: string[]
  values: Record<string, CellIn>
  /** `sync` = three-way merge on re-import; `insert_only` = never touch an existing row. */
  policy: 'sync' | 'insert_only'
}

export interface DueDateStat {
  obligation: ObligationType
  rule: number
  sourceMatchesRule: number
  sourceDiffersFromRule: number
  sourceOnly: number
  none: number
}

export interface Projection {
  intents: RowIntent[]
  findings: CanonicalIssue[]
  dueDates: DueDateStat[]
  /** Resolved periods (due date + basis), used by report insights. */
  periods: Array<CanonicalPeriod & { dueDate: IsoDate | null }>
  sensitiveWithheld: number
}

/** Obligations where the statute, not a register, defines the date. */
const RULE_AUTHORITATIVE = new Set<ObligationType>(['ct600', 'ct_payment', 'vat_return', 'self_assessment', 'p11d', 'ae_redeclaration'])

export function ruleDueDate(p: CanonicalPeriod): IsoDate | null {
  const pe = p.periodEnd
  switch (p.obligation) {
    case 'annual_accounts':
      return pe ? accountsDue(pe, { firstAccounts: !!p.ruleInputs.firstAccounts, incorporated: p.ruleInputs.incorporated ?? null }) : null
    case 'confirmation_statement':
      return p.ruleInputs.lastMadeUpTo ? confirmationStatementDue(nextConfirmationDate(p.ruleInputs.lastMadeUpTo)) : null
    case 'ct600':
      return pe ? ct600Due(pe) : null
    case 'ct_payment':
      return pe ? ctPaymentDue(pe) : null
    case 'vat_return':
      return pe ? vatReturnDue(pe) : null
    case 'self_assessment':
      return p.taxYear ? selfAssessmentDue(p.taxYear) : null
    case 'p11d':
      return p.taxYear ? p11dDue(p.taxYear) : null
    case 'ae_redeclaration':
      return pe ? addDays(addMonths(pe, 5), -1) : null
    default:
      return null
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const client = (key: string): ClientToken => ({ $client: key })
const parent = (table: EntityTable, key: string): ParentToken => ({ $parent: { table, key } })
const isOpen = (p: { filedDate: string | null; status: string; archived: boolean }): boolean =>
  !p.archived && !p.filedDate && p.status !== 'filed' && p.status !== 'not_applicable'

function stableJson(obj: Record<string, unknown>): string | null {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort()
  return keys.length ? JSON.stringify(Object.fromEntries(keys.map((k) => [k, obj[k]]))) : null
}

export function project(bundle: CanonicalBundle, opts: { today: IsoDate; includeSensitive: boolean }): Projection {
  const intents: RowIntent[] = []
  const findings: CanonicalIssue[] = []
  const stats = new Map<ObligationType, DueDateStat>()
  let sensitiveWithheld = 0
  const add = (i: Omit<RowIntent, 'policy'> & { policy?: RowIntent['policy'] }): void => {
    intents.push({ policy: 'sync', ...i })
  }

  const live = new Map(bundle.clients.map((c) => [c.key, c.engagementStatus !== 'Former client' && c.companyStatus !== 'dissolved']))

  // ── Periods: resolve due dates first (clients derive fields from them) ────
  const resolved = bundle.periods.map((p) => {
    const rule = ruleDueDate(p)
    const src = p.sourceDueDate
    const basis = src && rule ? (src === rule ? 'source_matches_rule' : 'source_differs_from_rule') : src ? 'source' : rule ? 'rule' : null
    const s = stats.get(p.obligation) ?? { obligation: p.obligation, rule: 0, sourceMatchesRule: 0, sourceDiffersFromRule: 0, sourceOnly: 0, none: 0 }
    if (basis === 'rule') s.rule += 1
    else if (basis === 'source_matches_rule') s.sourceMatchesRule += 1
    else if (basis === 'source_differs_from_rule') s.sourceDiffersFromRule += 1
    else if (basis === 'source') s.sourceOnly += 1
    else s.none += 1
    stats.set(p.obligation, s)
    if (basis === 'source_differs_from_rule' && RULE_AUTHORITATIVE.has(p.obligation) && !p.archived && live.get(p.clientKey)) {
      findings.push({
        key: `IMP:due_rule:${p.key}`, source: p.source, clientKey: p.clientKey, relatedClientKey: null, severity: 'medium',
        type: 'import:due_date_differs_from_rule', table: p.source.sheet, field: 'due_date',
        description: `${OBLIGATION_LABELS[p.obligation]} for period ${p.periodKey}: source due date ${src}, statutory rule gives ${rule}. The source date was kept.`,
        suggestedAction: 'Confirm the period end and the due date', status: 'open', resolvedAt: null, resolvedBy: null
      })
    }
    // Recorded data is never silently overridden: the source date wins, the rule is kept alongside.
    return { ...p, dueDate: src ?? rule, rule, basis }
  })

  const firstOpen = (clientKey: string, ob: ObligationType): IsoDate | null =>
    resolved.filter((p) => p.clientKey === clientKey && p.obligation === ob && isOpen(p) && p.dueDate)
      .map((p) => p.dueDate as IsoDate).sort()[0] ?? null
  const latest = (values: Array<string | null | undefined>): string | null =>
    values.filter((v): v is string => !!v).sort().at(-1) ?? null

  // ── Lookups & custom field definitions ──────────────────────────────────
  for (const l of bundle.lookups) {
    add({
      table: 'lookup_values', key: `${l.listKey}:${l.valueKey}`, source: { sheet: 'Lists', row: 0, id: l.listKey },
      match: ['list_key', 'value_key'], policy: 'insert_only',
      values: { list_key: l.listKey, value_key: l.valueKey, label: l.label, sort_order: l.sortOrder, is_system: 0, active: 1 }
    })
  }
  const usedCustom = new Set(bundle.clients.flatMap((c) => Object.entries(c.custom).filter(([, v]) => v !== null).map(([k]) => k)))
  for (const field of usedCustom) {
    add({
      table: 'custom_field_defs', key: `clients:${field}`, source: { sheet: 'Clients', row: 0, id: field },
      match: ['entity_table', 'field_key'], policy: 'insert_only',
      values: { entity_table: 'clients', field_key: field, label: bundle.customFieldLabels[field] ?? field, data_type: 'text' }
    })
  }

  // ── Clients ─────────────────────────────────────────────────────────────
  for (const c of bundle.clients) {
    const per = (ob: ObligationType): CanonicalPeriod[] => resolved.filter((p) => p.clientKey === c.key && p.obligation === ob)
    const values: Record<string, CellIn> = {
      ref: c.key,
      client_name: c.name,
      client_category: c.category,
      legacy_ref: c.legacyRef,
      reg_no: c.crn,
      inc_date: c.incorporated,
      year_end_month: c.yearEnd ? `${Number(c.yearEnd.slice(8))} ${MONTHS[Number(c.yearEnd.slice(5, 7)) - 1]}` : null,
      accounting_ref_date: c.yearEnd ? c.yearEnd.slice(5) : null,
      company_status: c.companyStatus,
      status: c.engagementStatus,
      utr: c.utr,
      nino: c.nino,
      vat_no: c.vatNo,
      vat_scheme: c.vatScheme,
      vat_stagger: c.vatStagger,
      ct_ref: c.ctUtr,
      paye_ref: c.payeRef,
      remarks: c.notes,
      // Denormalised "next due" fields read by the existing deadline scheduler and screens.
      accounts_due: firstOpen(c.key, 'annual_accounts'),
      ct_next_due: firstOpen(c.key, 'ct600'),
      vat_due: firstOpen(c.key, 'vat_return'),
      conf_stmt_due: firstOpen(c.key, 'confirmation_statement'),
      next_sa_due: firstOpen(c.key, 'self_assessment'),
      last_accounts: latest(per('annual_accounts').map((p) => p.ruleInputs.lastMadeUpTo)),
      last_conf_stmt: latest(per('confirmation_statement').map((p) => p.ruleInputs.lastMadeUpTo)),
      last_vat: latest(per('vat_return').filter((p) => p.filedDate).map((p) => p.periodEnd))
    }
    if (c.mtdVat !== null) values.mtd_vat_status = c.mtdVat ? 'enrolled' : 'not_enrolled'
    if (c.authCode) {
      if (opts.includeSensitive) values.auth_code = c.authCode
      else sensitiveWithheld += 1
    }
    add({ table: 'clients', key: c.key, source: c.source, match: [], values })

    for (const s of c.services) {
      add({
        table: 'client_services', key: `${c.key}:svc:${s.type}`, source: c.source, match: ['client_ref', 'service_type'],
        values: { client_ref: client(c.key), service_type: s.type, active: s.active ? 1 : 0 }
      })
    }
    for (const alias of c.aliases) {
      const norm = nameKey(alias)
      if (!norm) continue
      add({
        table: 'client_aliases', key: `${c.key}:alias:${norm}`, source: c.source, match: ['client_ref', 'alias_norm'],
        values: { client_ref: client(c.key), alias, alias_norm: norm, alias_type: 'also_known_as' }
      })
    }
    for (const [field, value] of Object.entries(c.custom)) {
      if (value === null) continue
      add({
        table: 'custom_field_values', key: `${c.key}:cf:${field}`, source: c.source,
        match: ['entity_table', 'entity_id', 'field_key'],
        values: { entity_table: 'clients', entity_id: parent('clients', c.key), field_key: field, value }
      })
    }
  }

  // ── Contacts ────────────────────────────────────────────────────────────
  for (const ct of bundle.contacts) {
    const values: Record<string, CellIn> = {
      client_ref: client(ct.clientKey), contact_type: ct.type, title: ct.title, name: ct.name, role: ct.role,
      phone: ct.phone, email: ct.email, is_primary: ct.isPrimary ? 1 : 0, notes: ct.notes,
      idv_status: ct.personalCode ? 'code_held' : 'unknown'
    }
    if (ct.personalCode) {
      if (opts.includeSensitive) values.ch_personal_code = ct.personalCode
      else sensitiveWithheld += 1
    }
    add({
      table: 'client_contacts', key: ct.key, source: ct.source,
      match: ct.email ? ['client_ref', 'email'] : ct.name ? ['client_ref', 'name'] : [], values
    })
  }

  for (const r of bundle.relationships) {
    add({
      table: 'client_relationships', key: r.key, source: r.source,
      match: ['from_client_ref', 'to_client_ref', 'relationship_type'],
      values: { from_client_ref: client(r.fromClientKey), to_client_ref: client(r.toClientKey), relationship_type: r.type, basis: r.basis }
    })
  }

  // ── Periods ─────────────────────────────────────────────────────────────
  for (const p of resolved) {
    add({
      table: 'compliance_periods', key: p.key, source: p.source, match: ['client_ref', 'obligation', 'period_key'],
      values: {
        client_ref: client(p.clientKey), obligation: p.obligation, period_key: p.periodKey, period_start: p.periodStart,
        period_end: p.periodEnd, tax_year: p.taxYear, due_date: p.dueDate, due_date_basis: p.basis, rule_due_date: p.rule,
        filed_date: p.filedDate, status: p.status, assigned_to: p.assignedTo, archived: p.archived ? 1 : 0,
        reference: p.reference, details_json: stableJson(p.details), notes: p.notes
      }
    })
  }

  // ── Payroll & pensions ──────────────────────────────────────────────────
  for (const s of bundle.payrollSchemes) {
    add({
      table: 'payroll_schemes', key: s.key, source: s.source, match: ['client_ref', 'paye_reference'],
      values: {
        client_ref: client(s.clientKey), paye_reference: s.payeRef, accounts_office_ref: s.accountsOfficeRef,
        pay_frequency: s.payFrequency, scheme_status: s.status,
        payroll_contact_id: s.payrollContactKey ? parent('client_contacts', s.payrollContactKey) : null, notes: s.notes
      }
    })
    for (const y of s.years) {
      add({
        table: 'payroll_scheme_years', key: `${s.key}:${y.taxYear}`, source: s.source, match: ['scheme_id', 'tax_year'],
        values: {
          scheme_id: parent('payroll_schemes', s.key), tax_year: y.taxYear, employees: y.employees,
          cis_subcontractors: y.cisSubcontractors, rti_status: y.rtiStatus, payroll_file: y.payrollFile
        }
      })
    }
  }
  for (const p of bundle.pensionSchemes) {
    add({
      table: 'pension_schemes', key: p.key, source: p.source, match: p.letterCode ? ['client_ref', 'letter_code'] : [],
      values: {
        client_ref: client(p.clientKey), letter_code: p.letterCode, duties_start_date: p.dutiesStart, provider: p.provider,
        declaration_date: p.declarationDate, declaration_status: p.declarationStatus, last_payment_date: p.lastPaymentDate, notes: p.notes
      }
    })
  }

  // ── Self assessment ─────────────────────────────────────────────────────
  for (const r of bundle.saRegistrations) {
    add({
      table: 'sa_registrations', key: r.key, source: r.source, match: ['client_ref'],
      values: {
        client_ref: client(r.clientKey), utr: r.utr, business_description: r.businessDescription,
        filing_route: r.filingRoutes.join('; ') || null, first_year_on_file: r.firstYearOnFile,
        last_year_on_file: r.lastYearOnFile, register_status: r.registerStatus, notes: r.notes
      }
    })
    for (const inc of r.incomeSources) {
      add({
        table: 'client_income_sources', key: `${r.clientKey}:income:${inc.type}:${inc.detail}`, source: r.source,
        match: ['client_ref', 'source_type', 'detail'],
        values: { client_ref: client(r.clientKey), source_type: inc.type, detail: inc.detail, raw_text: inc.raw, active: 1 }
      })
    }
  }

  // ── Logins: only when the database is keyed; passwords never exist here ──
  for (const l of bundle.logins) {
    if (!opts.includeSensitive) {
      sensitiveWithheld += 1
      continue
    }
    add({
      table: 'logins', key: l.key, source: l.source, match: ['client_ref', 'platform', 'username'],
      values: { client_ref: client(l.clientKey), platform: l.platform, username: l.username, status: 'Unverified', notes: l.notes }
    })
  }

  // ── Data issues: the source's own log + everything found while importing ──
  for (const i of [...bundle.issues, ...bundle.findings, ...findings]) {
    add({
      table: 'data_issues', key: i.key, source: i.source, match: ['issue_key'],
      values: {
        issue_key: i.key, severity: i.severity satisfies IssueSeverity, issue_type: i.type, entity_table: i.table,
        client_ref: i.clientKey ? client(i.clientKey) : null,
        related_client_ref: i.relatedClientKey ? client(i.relatedClientKey) : null,
        field: i.field, description: i.description, suggested_action: i.suggestedAction, status: i.status,
        source: `${bundle.file.name} › ${i.source.sheet} ${i.source.id}`, resolved_at: i.resolvedAt, resolved_by: i.resolvedBy
      }
    })
  }

  return {
    intents,
    findings,
    dueDates: [...stats.values()].sort((a, b) => a.obligation.localeCompare(b.obligation)),
    periods: resolved,
    sensitiveWithheld
  }
}
