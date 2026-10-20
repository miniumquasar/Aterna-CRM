/**
 * Vocabulary for the Dynamic Accountants master workbook (v2).
 * Every drop-down value on its Lists sheet maps to a canonical value here;
 * anything unrecognised becomes a finding rather than a guess.
 */

import type {
  ClientCategory,
  CompanyRegisterStatus,
  ContactType,
  EngagementStatus,
  FilingRoute,
  FilingStatus,
  IncomeSourceType,
  IssueSeverity,
  IssueStatus,
  ObligationType,
  ServiceType
} from '@shared/types'

export const SOURCE_SYSTEM = 'dynamic-master-workbook'

/** Names under which the practice itself appears as the filing agent. */
export const OWN_PRACTICE_NAMES = ['dynamic accountants']

export const CLIENT_TYPE: Record<string, ClientCategory> = {
  'limited company': 'company',
  'individual (sa only)': 'individual',
  'sole trader / other': 'sole_trader',
  partnership: 'partnership',
  llp: 'llp',
  'charity / cic': 'charity'
}

export const COMPANY_STATUS: Record<string, CompanyRegisterStatus> = {
  active: 'active',
  dissolved: 'dissolved',
  'strike-off action': 'strike_off',
  'in liquidation': 'liquidation',
  'in administration': 'administration',
  'not applicable (individual)': 'not_applicable',
  unknown: 'unknown',
  // "Former client" appears in this column but is an engagement status, not a register status.
  'former client': 'unknown'
}

export const ENGAGEMENT_STATUS: Record<string, EngagementStatus> = {
  active: 'Active',
  prospect: 'Prospect',
  dormant: 'Dormant',
  'former client': 'Former client',
  'review required': 'Review required'
}

export const CONTACT_TYPE: Record<string, ContactType> = {
  primary: 'primary',
  director: 'director',
  payroll: 'payroll',
  bookkeeper: 'bookkeeper',
  accountant: 'accountant',
  other: 'other'
}

export const FILING_STATUS: Record<string, FilingStatus> = {
  'not started': 'not_started',
  'information requested': 'information_requested',
  'records received': 'records_received',
  'in progress': 'in_progress',
  'awaiting approval': 'awaiting_approval',
  filed: 'filed',
  'not applicable': 'not_applicable',
  'dormant accounts': 'not_started'
}

export const SA_RETURN_STATUS: Record<string, FilingStatus> = {
  submitted: 'filed',
  'not submitted': 'not_started',
  'not applicable': 'not_applicable',
  unknown: 'unknown',
  'in progress': 'in_progress',
  'records awaited': 'information_requested'
}

export const OBLIGATION: Record<string, ObligationType> = {
  'confirmation statement': 'confirmation_statement',
  'annual accounts': 'annual_accounts',
  'corporation tax (ct600)': 'ct600',
  'corporation tax payment': 'ct_payment',
  'vat return': 'vat_return',
  'self assessment': 'self_assessment',
  p11d: 'p11d',
  'ae re-declaration': 'ae_redeclaration',
  other: 'other'
}

export const SEVERITY: Record<string, IssueSeverity> = { high: 'high', medium: 'medium', low: 'low' }

export const ISSUE_STATUS: Record<string, IssueStatus> = {
  open: 'open',
  'in progress': 'in_progress',
  resolved: 'resolved',
  'accepted risk': 'accepted_risk'
}

/** SVC_* Y/N columns on the Clients sheet. */
export const SERVICE_COLUMNS: ReadonlyArray<[string, ServiceType]> = [
  ['SVC_ACCOUNTS', 'accounts_submission'],
  ['SVC_CORP_TAX', 'corporation_tax'],
  ['SVC_CONF_STMT', 'confirmation_statement'],
  ['SVC_VAT', 'vat_returns'],
  ['SVC_PAYROLL', 'payroll'],
  ['SVC_PENSION', 'auto_enrolment'],
  ['SVC_SELF_ASSESSMENT', 'self_assessment']
]

/** HISTORIC_MODULES tokens: services evidenced only in pre-2020 sheets. */
export const HISTORIC_MODULE: Record<string, ServiceType> = {
  ACCOUNTS: 'accounts_submission',
  CORP_TAX: 'corporation_tax',
  CONF_STMT: 'confirmation_statement',
  CS: 'confirmation_statement',
  VAT: 'vat_returns',
  PAYE: 'payroll',
  PENSION: 'auto_enrolment',
  SELF_ASSESSMENT: 'self_assessment'
}

export function filingRoute(token: string): FilingRoute {
  const t = token.trim().toLowerCase()
  if (OWN_PRACTICE_NAMES.includes(t)) return 'own_agent'
  if (t === 'client own gateway') return 'client_gateway'
  if (t === 'software filing') return 'software'
  if (t === 'unknown' || t === '') return 'unknown'
  return 'other_agent'
}

/** PROVIDER cells that hold a status rather than a pension provider name. */
export const PROVIDER_STATUS_WORDS = new Set(['DONE', 'NO NEED YET', 'PAYE CEASED'])

/** Boilerplate notes the merge wrote on every row — not worth carrying. */
export const BOILERPLATE_NOTES = new Set([
  'ct600 and payment dates are calculated from period_end.',
  'confirm period end before relying on this date.',
  '(not populated by the merge)'
])

/**
 * SA_CLIENT_TYPE is a semicolon list of drop-down values that drifted into
 * free text ("Rental+Director", "Minicab/ Rental Income", "Self Employed+Paye").
 * Each fragment is classified by keyword; the raw text is always kept.
 * Order matters: "self-employed" must win before "employed".
 */
const INCOME_RULES: ReadonlyArray<[RegExp, IncomeSourceType, string]> = [
  [/minicab|taxi|private hire/i, 'self_employment', 'Minicab'],
  [/self[\s-]*employ|sole\s*trader/i, 'self_employment', ''],
  [/rent|property|landlord|room relief/i, 'property', ''],
  [/director/i, 'company_director', ''],
  [/partnership/i, 'partnership', ''],
  [/\bcis\b/i, 'cis_subcontractor', ''],
  [/\bpaye\b|employment|\bemployed\b/i, 'employment', ''],
  [/pension/i, 'pension', '']
]

export function classifyIncome(raw: string): Array<{ type: IncomeSourceType; detail: string }> {
  const out = new Map<string, { type: IncomeSourceType; detail: string }>()
  for (const fragment of raw.split(/[;+/,]/).map((f) => f.trim()).filter(Boolean)) {
    const hit = INCOME_RULES.find(([re]) => re.test(fragment))
    const item = hit
      ? { type: hit[1], detail: hit[2] }
      : { type: 'other' as const, detail: /^self assessment \(other\)$/i.test(fragment) ? '' : fragment.slice(0, 60) }
    out.set(`${item.type}|${item.detail}`, item)
  }
  return [...out.values()]
}
