/**
 * The canonical model — the contract between import adapters and the engine.
 *
 *   source file ──► adapter.extract() ──► CanonicalBundle ──► engine (plan → commit)
 *
 * An adapter knows one source format (this workbook, a CSV layout, a Xero
 * export, the Companies House API…). It emits canonical records keyed by
 * the source's own stable ids. The engine knows nothing about formats: it
 * matches, merges, validates, reports and writes. Adding a data source
 * means writing one adapter — never touching the engine or the schema.
 *
 * Rules for adapters:
 *   • `key` must be stable across re-imports of the same source (it becomes
 *     external_ids.external_key and drives idempotent re-runs).
 *   • Never emit calculated values the CRM can compute (deadlines, ages,
 *     completeness). Emit the inputs; the engine computes.
 *   • Never emit secrets. Passwords are counted in `excluded`, not carried.
 *   • Sensitive-but-needed identifiers (auth codes, personal codes, gateway
 *     user ids) go in fields marked SENSITIVE; the engine drops them unless
 *     the target database is keyed (ImportOptions.includeSensitive).
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
  PayrollSchemeStatus,
  RelationshipType,
  ServiceType
} from '@shared/types'
import type { IsoDate } from './rules'

/** Where a record came from — shown in reports, kept in data_issues.source. */
export interface SourceRef {
  sheet: string
  row: number
  id: string
}

interface Keyed {
  key: string
  source: SourceRef
}

export interface CanonicalClient extends Keyed {
  name: string
  category: ClientCategory
  legacyRef: string | null
  crn: string | null
  incorporated: IsoDate | null
  /** Current accounting reference date (a full date; the CRM stores MM-DD + display text). */
  yearEnd: IsoDate | null
  companyStatus: CompanyRegisterStatus
  engagementStatus: EngagementStatus
  utr: string | null
  nino: string | null
  /** SENSITIVE */
  authCode: string | null
  vatNo: string | null
  mtdVat: boolean | null
  ctUtr: string | null
  payeRef: string | null
  notes: string | null
  services: Array<{ type: ServiceType; active: boolean }>
  aliases: string[]
  /** Free-form provenance or attributes with no first-class column → custom fields. */
  custom: Record<string, string | null>
}

export interface CanonicalContact extends Keyed {
  clientKey: string
  type: ContactType
  title: string | null
  name: string | null
  role: string | null
  phone: string | null
  email: string | null
  isPrimary: boolean
  /** SENSITIVE — Companies House identity-verification personal code. */
  personalCode: string | null
  notes: string | null
}

export interface CanonicalPeriod extends Keyed {
  clientKey: string
  obligation: ObligationType
  /** Natural key within (client, obligation): usually the period end, or the tax year. */
  periodKey: string
  periodStart: IsoDate | null
  periodEnd: IsoDate | null
  taxYear: string | null
  /** Due date as recorded by the source (may be absent or wrong). */
  sourceDueDate: IsoDate | null
  /** Inputs the rules engine needs for this obligation. */
  ruleInputs: { incorporated?: IsoDate | null; firstAccounts?: boolean; lastMadeUpTo?: IsoDate | null }
  filedDate: IsoDate | null
  status: FilingStatus
  assignedTo: string | null
  archived: boolean
  reference: string | null
  details: Record<string, string | number | boolean | null>
  notes: string | null
}

export interface CanonicalPayrollScheme extends Keyed {
  clientKey: string
  payeRef: string
  accountsOfficeRef: string | null
  payFrequency: string | null
  status: PayrollSchemeStatus
  /** Key of a CanonicalContact (type payroll) in the same bundle. */
  payrollContactKey: string | null
  years: Array<{
    key: string
    taxYear: string
    employees: number | null
    cisSubcontractors: number | null
    rtiStatus: string | null
    payrollFile: string | null
  }>
  notes: string | null
}

export interface CanonicalPensionScheme extends Keyed {
  clientKey: string
  letterCode: string | null
  dutiesStart: IsoDate | null
  provider: string | null
  declarationDate: IsoDate | null
  declarationStatus: string | null
  lastPaymentDate: IsoDate | null
  notes: string | null
}

export interface CanonicalSaRegistration extends Keyed {
  clientKey: string
  utr: string | null
  businessDescription: string | null
  filingRoutes: FilingRoute[]
  firstYearOnFile: string | null
  lastYearOnFile: string | null
  registerStatus: string | null
  notes: string | null
  incomeSources: Array<{ type: IncomeSourceType; detail: string; raw: string }>
}

export interface CanonicalRelationship extends Keyed {
  fromClientKey: string
  toClientKey: string
  type: RelationshipType
  basis: string | null
}

export interface CanonicalLogin extends Keyed {
  clientKey: string
  platform: string
  /** SENSITIVE — gateway user id. Passwords are never carried. */
  username: string | null
  notes: string | null
}

export interface CanonicalIssue extends Keyed {
  clientKey: string | null
  relatedClientKey: string | null
  severity: IssueSeverity
  type: string
  table: string | null
  field: string | null
  description: string
  suggestedAction: string | null
  status: IssueStatus
  resolvedAt: IsoDate | null
  resolvedBy: string | null
}

export interface CanonicalLookup {
  listKey: string
  valueKey: string
  label: string
  sortOrder: number
}

export interface CanonicalBundle {
  adapter: { id: string; label: string; version: string }
  /** external_ids.source_system — one per logical source, stable across versions. */
  sourceSystem: string
  file: { name: string; sha256: string; size: number }
  clients: CanonicalClient[]
  contacts: CanonicalContact[]
  periods: CanonicalPeriod[]
  payrollSchemes: CanonicalPayrollScheme[]
  pensionSchemes: CanonicalPensionScheme[]
  saRegistrations: CanonicalSaRegistration[]
  relationships: CanonicalRelationship[]
  logins: CanonicalLogin[]
  /** Issues carried over from the source's own issue log. */
  issues: CanonicalIssue[]
  /** Problems found while reading (bad dates, failed checksums…). Engine turns them into data issues. */
  findings: CanonicalIssue[]
  lookups: CanonicalLookup[]
  /** Labels for custom fields used in `CanonicalClient.custom`. */
  customFieldLabels: Record<string, string>
  /** Data deliberately not imported, with counts — e.g. passwords. */
  excluded: Array<{ what: string; count: number; reason: string }>
  /** Source columns the adapter did not map (should be empty; non-empty is a warning). */
  unmappedColumns: Array<{ sheet: string; column: string }>
  warnings: string[]
}

export interface SourceFile {
  path: string
  name: string
  size: number
  sha256: string
}

export interface AdapterContext {
  /** The practice's calendar day; injected so plans are reproducible in tests. */
  today: IsoDate
}

export interface ImportAdapter {
  id: string
  label: string
  version: string
  extensions: readonly string[]
  /** 0 = not mine, 1 = certain. Used to pick an adapter for a dropped file. */
  detect(file: SourceFile): Promise<number>
  extract(file: SourceFile, ctx: AdapterContext): Promise<CanonicalBundle>
}
