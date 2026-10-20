/**
 * The organised data structure.
 *
 * Every table in the database, grouped by what it is for, with its grain (one
 * row per what), how it links to a client, who may browse it, and how each
 * column is treated: hidden (never leaves the main process), masked (shown as
 * the last two characters only), or superseded (an older column whose data now
 * lives in a dedicated register).
 *
 * The Data and Client file screens are driven from this list, the main process
 * enforces it, and a test fails if a table exists that is not described here.
 * Pure TypeScript: no Node or browser APIs.
 */

export type DomainKey =
  | 'practice'
  | 'clients'
  | 'people'
  | 'compliance'
  | 'payroll_pensions'
  | 'aml_onboarding'
  | 'work_billing'
  | 'communications'
  | 'references_access'
  | 'provenance'
  | 'system'
  | 'experimental'

export interface DomainSpec {
  key: DomainKey
  label: string
  description: string
}

export const DOMAINS: readonly DomainSpec[] = [
  { key: 'clients', label: 'Clients', description: 'Who the practice acts for: the client record, its services, sources of income, other names and links between clients.' },
  { key: 'people', label: 'People', description: 'The people behind each client: contacts, directors, partners and trustees.' },
  { key: 'compliance', label: 'Tax and compliance', description: 'What is due when, Self Assessment registrations, HMRC filings and agent authorisations.' },
  { key: 'payroll_pensions', label: 'Payroll and pensions', description: 'PAYE schemes by year, and workplace pension duties.' },
  { key: 'aml_onboarding', label: 'AML, onboarding and data quality', description: 'Due diligence, onboarding gaps, consent and the issues found in the data.' },
  { key: 'work_billing', label: 'Work and billing', description: 'Tasks, work in progress, invoices and receipts.' },
  { key: 'communications', label: 'Communications and documents', description: 'Calls, emails, templates, stored documents and assistant conversations.' },
  { key: 'references_access', label: 'References and access', description: 'Every other reference a client is known by, and stored logins.' },
  { key: 'practice', label: 'The practice', description: 'The firm itself, its references, and the lists and custom fields the software uses.' },
  { key: 'provenance', label: 'Imports and provenance', description: 'Where each imported row came from, and every change an import made.' },
  { key: 'system', label: 'System', description: 'The audit log, backups, settings and licensing.' },
  { key: 'experimental', label: 'Experimental (to remove)', description: 'Tables from experimental features with no practice purpose. Nothing here is shown, and they are marked for removal.' }
]

/** How a table's rows belong to a client. */
export type ClientLink =
  /** A column holding the client's reference. */
  | { kind: 'column'; column: string }
  /** A column pointing at a parent table that holds the client's reference. */
  | { kind: 'via'; column: string; table: string; key: string; clientColumn: string }
  /** Rows keyed by entity table and entity id (custom field values). */
  | { kind: 'entity'; tableColumn: string; idColumn: string }

/**
 * Who sees a table on the Data screen. 'everyone': all users, staff limited to
 * their own clients' rows. 'managers': partners and managers. 'never': nobody —
 * secrets, internals and experimental tables.
 */
export type Browse = 'everyone' | 'managers' | 'never'

export interface TableSpec {
  table: string
  label: string
  domain: DomainKey
  /** One row per … */
  grain: string
  description: string
  client?: ClientLink
  /** A second column naming a client (shown in that client's file too). */
  alsoClient?: string
  browse: Browse
  /** Never returned to the screen. */
  hidden?: readonly string[]
  /** Returned as •••• plus the last two characters. */
  masked?: readonly string[]
  /** Older columns whose data now lives elsewhere: column → where. */
  superseded?: Readonly<Record<string, string>>
  /** Default sort column. */
  orderBy?: string
  labels?: Readonly<Record<string, string>>
}

const CLIENT_REF: ClientLink = { kind: 'column', column: 'client_ref' }
const CLIENT_NAME_COPY = 'clients — joined by client_ref, so it never goes stale'

export const TABLES: readonly TableSpec[] = [
  // ── Clients ──────────────────────────────────────────────────────────────
  {
    table: 'clients', label: 'Clients', domain: 'clients', grain: 'client', browse: 'everyone',
    description: 'The client record: identity, status, core tax references and the responsible member of staff.',
    client: { kind: 'column', column: 'ref' }, orderBy: 'client_name', masked: ['auth_code', 'nino'],
    labels: { ref: 'Client code', reg_no: 'Company number', ct_ref: 'Corporation Tax UTR', utr: 'Self Assessment UTR', accounting_ref_date: 'Accounting reference date (DD-MM)', signed_64_8: '64-8 signed' },
    superseded: {
      title: 'client_contacts', contact_name: 'client_contacts', phone: 'client_contacts', email: 'client_contacts', director: 'client_contacts',
      services: 'client_services', paye_scheme: 'payroll_schemes', pension_provider: 'pension_schemes', pension_staging_date: 'pension_schemes',
      sa_class: 'sa_registrations', sa_status: 'sa_registrations', sa_note: 'sa_registrations', next_sa_due: 'compliance_periods',
      last_accounts: 'compliance_periods', accounts_due: 'compliance_periods', ct_next_due: 'compliance_periods', last_vat: 'compliance_periods',
      vat_due: 'compliance_periods', last_conf_stmt: 'compliance_periods', conf_stmt_due: 'compliance_periods', overdue_count: 'compliance_periods (worked out)',
      annual_fee: 'client_services (fee)', last_fee_review: 'client_services', last_invoice: 'payments', payment_recd: 'payments', payment_status: 'payments',
      last_contacted: 'interactions', next_action: 'tasks', completeness_pct: 'onboarding gaps (worked out)'
    }
  },
  { table: 'client_services', label: 'Services', domain: 'clients', grain: 'service a client takes', browse: 'everyone', client: CLIENT_REF, orderBy: 'service_type', description: 'Each service the practice provides to a client, with fee, frequency and who does it.' },
  { table: 'client_income_sources', label: 'Sources of income', domain: 'clients', grain: 'source of income', browse: 'everyone', client: CLIENT_REF, orderBy: 'source_type', description: 'What a Self Assessment client earns from: employment, property, self-employment and so on.' },
  { table: 'client_aliases', label: 'Other names', domain: 'clients', grain: 'other name for a client', browse: 'everyone', client: CLIENT_REF, orderBy: 'alias', description: 'Trading names and other names a client is known by, used when matching records.' },
  { table: 'client_relationships', label: 'Links between clients', domain: 'clients', grain: 'link from one client to another', browse: 'everyone', client: { kind: 'column', column: 'from_client_ref' }, alsoClient: 'to_client_ref', orderBy: 'relationship_type', description: 'Directors of companies, spouses and partners, connected businesses.' },
  { table: 'addresses', label: 'Addresses', domain: 'clients', grain: 'address of a client', browse: 'everyone', client: CLIENT_REF, orderBy: 'type', description: 'Registered office, trading, home and correspondence addresses.' },
  {
    table: 'personal_info', label: 'Personal identity details', domain: 'clients', grain: 'individual client', browse: 'managers', client: CLIENT_REF,
    hidden: ['dob_encrypted', 'ni_encrypted', 'passport_encrypted', 'driving_licence_encrypted'],
    description: 'Encrypted date of birth and identity document numbers, and whether identity has been verified. The encrypted values are never shown here.'
  },
  { table: 'custom_field_values', label: 'Custom field values', domain: 'clients', grain: 'custom field on a record', browse: 'everyone', client: { kind: 'entity', tableColumn: 'entity_table', idColumn: 'entity_id' }, orderBy: 'field_key', description: 'Values of the practice’s own extra fields.' },

  // ── People ───────────────────────────────────────────────────────────────
  { table: 'client_contacts', label: 'Contacts and directors', domain: 'people', grain: 'person connected to a client', browse: 'everyone', client: CLIENT_REF, orderBy: 'name', labels: { ch_personal_code: 'Companies House personal code', idv_status: 'Identity verification', idv_verified_on: 'Identity verified on' }, description: 'Primary contacts, directors, payroll and bookkeeping contacts, with Companies House identity verification.' },
  { table: 'partnership_members', label: 'Partners', domain: 'people', grain: 'partner in a partnership', browse: 'everyone', client: CLIENT_REF, orderBy: 'name', masked: ['nino'], description: 'Partners and LLP members, their shares and capital.' },
  { table: 'trust_members', label: 'Trustees and beneficiaries', domain: 'people', grain: 'person connected to a trust', browse: 'everyone', client: CLIENT_REF, orderBy: 'name', masked: ['nino', 'dob'], description: 'Trustees, settlors and beneficiaries.' },

  // ── Tax and compliance ───────────────────────────────────────────────────
  { table: 'compliance_periods', label: 'Deadlines and filings', domain: 'compliance', grain: 'obligation for one period', browse: 'everyone', client: CLIENT_REF, orderBy: 'due_date', description: 'Every return and payment due — accounts, confirmation statements, CT600, VAT, Self Assessment — with its due date and whether it is done.' },
  { table: 'sa_registrations', label: 'Self Assessment registrations', domain: 'compliance', grain: 'Self Assessment registration', browse: 'everyone', client: CLIENT_REF, orderBy: 'utr', description: 'Who files Self Assessment, how, and for which years.' },
  { table: 'hmrc_submissions', label: 'HMRC submissions', domain: 'compliance', grain: 'submission to HMRC', browse: 'everyone', client: CLIENT_REF, orderBy: 'date_submitted', superseded: { client_name: CLIENT_NAME_COPY }, description: 'Returns sent to HMRC, with references and acknowledgements.' },
  { table: 'agent_authorisations', label: 'Agent authorisations', domain: 'compliance', grain: 'tax service per client', browse: 'everyone', client: CLIENT_REF, orderBy: 'service', hidden: ['code_ct', 'code_iv', 'code_tag', 'code_key_version'], description: 'Whether the practice is authorised for each tax, how, and what is waiting on the client.' },

  // ── Payroll and pensions ─────────────────────────────────────────────────
  { table: 'payroll_schemes', label: 'PAYE schemes', domain: 'payroll_pensions', grain: 'PAYE scheme', browse: 'everyone', client: CLIENT_REF, orderBy: 'paye_reference', description: 'Employer PAYE and Accounts Office references, pay frequency and status.' },
  { table: 'payroll_scheme_years', label: 'Payroll years', domain: 'payroll_pensions', grain: 'PAYE scheme per tax year', browse: 'everyone', client: { kind: 'via', column: 'scheme_id', table: 'payroll_schemes', key: 'id', clientColumn: 'client_ref' }, orderBy: 'tax_year', description: 'Employees, CIS subcontractors and RTI status for each scheme and year.' },
  { table: 'pension_schemes', label: 'Workplace pensions', domain: 'payroll_pensions', grain: 'pension scheme', browse: 'everyone', client: CLIENT_REF, orderBy: 'provider', labels: { letter_code: 'Pensions Regulator letter code' }, description: 'Auto-enrolment duties, provider, declaration of compliance.' },

  // ── AML, onboarding and data quality ─────────────────────────────────────
  { table: 'aml_records', label: 'Anti-money-laundering checks', domain: 'aml_onboarding', grain: 'due diligence record', browse: 'everyone', client: CLIENT_REF, orderBy: 'review_due_date', superseded: { client_name: CLIENT_NAME_COPY }, description: 'Risk rating, customer due diligence, identity checks, PEP and sanctions screening.' },
  { table: 'onboarding_observations', label: 'Onboarding gaps', domain: 'aml_onboarding', grain: 'missing or provided item', browse: 'everyone', client: CLIENT_REF, orderBy: 'label', description: 'What each client still needs to provide, from the onboarding check.' },
  { table: 'gdpr_consent', label: 'Data protection consent', domain: 'aml_onboarding', grain: 'client', browse: 'everyone', client: CLIENT_REF, orderBy: 'consent_date', description: 'Consent to process data and to receive marketing.' },
  { table: 'credential_consents', label: 'Permission to hold sign-in details', domain: 'aml_onboarding', grain: 'permission given (history kept)', browse: 'everyone', client: CLIENT_REF, orderBy: 'given_on', description: 'Each client’s permission for the practice to hold their sign-in details, and when it was withdrawn.' },
  { table: 'data_issues', label: 'Data issues', domain: 'aml_onboarding', grain: 'issue found in the data', browse: 'everyone', client: CLIENT_REF, alsoClient: 'related_client_ref', orderBy: 'severity', description: 'Problems found in imported data — conflicting values, invalid references, rows that did not join — with what to do and whether it is resolved.' },

  // ── Work and billing ─────────────────────────────────────────────────────
  { table: 'tasks', label: 'Tasks', domain: 'work_billing', grain: 'task', browse: 'everyone', client: CLIENT_REF, orderBy: 'due_date', description: 'Work to do, who does it and by when.' },
  {
    table: 'wip_items', label: 'Work in progress', domain: 'work_billing', grain: 'job in progress', browse: 'everyone', client: CLIENT_REF, orderBy: 'due_date',
    superseded: { client_name: CLIENT_NAME_COPY, phone: 'client_contacts', email: 'client_contacts', services: 'client_services', sa_status: 'sa_registrations' },
    description: 'Jobs under way, their deadlines and status.'
  },
  { table: 'payments', label: 'Invoices', domain: 'work_billing', grain: 'invoice', browse: 'everyone', client: CLIENT_REF, orderBy: 'invoice_date', superseded: { client_name: CLIENT_NAME_COPY }, description: 'Invoices raised, amounts, VAT and whether they are paid.' },
  { table: 'payment_receipts', label: 'Receipts', domain: 'work_billing', grain: 'payment received', browse: 'everyone', client: CLIENT_REF, orderBy: 'receipt_date', superseded: { client_name: CLIENT_NAME_COPY }, description: 'Money received against invoices.' },

  // ── Communications and documents ─────────────────────────────────────────
  { table: 'interactions', label: 'Calls, meetings and notes', domain: 'communications', grain: 'interaction', browse: 'everyone', client: CLIENT_REF, orderBy: 'date', description: 'Contact with the client and follow-ups.' },
  { table: 'communication_log', label: 'Messages sent', domain: 'communications', grain: 'message sent', browse: 'everyone', client: CLIENT_REF, orderBy: 'sent_at', superseded: { client_name: CLIENT_NAME_COPY }, description: 'Emails and messages sent from the software.' },
  { table: 'email_templates', label: 'Email templates', domain: 'communications', grain: 'template', browse: 'everyone', client: CLIENT_REF, orderBy: 'label', description: 'Practice templates, and client-specific versions.' },
  { table: 'documents', label: 'Documents', domain: 'communications', grain: 'stored document', browse: 'everyone', client: CLIENT_REF, orderBy: 'created_at', description: 'Files stored for each client.' },
  { table: 'ai_conversations', label: 'Assistant conversations', domain: 'communications', grain: 'message in a conversation', browse: 'managers', client: CLIENT_REF, orderBy: 'created_at', description: 'Conversations with the built-in assistant.' },

  // ── References and access ────────────────────────────────────────────────
  { table: 'client_identifiers', label: 'Other references', domain: 'references_access', grain: 'reference', browse: 'everyone', client: CLIENT_REF, orderBy: 'kind', description: 'EORI, TRS, CGT property, penalty, insolvency and every other reference beyond the client record.' },
  { table: 'credential_vault', label: 'Stored logins', domain: 'references_access', grain: 'login', browse: 'everyone', client: CLIENT_REF, orderBy: 'platform', description: 'Portal logins for clients and the practice. Their secrets are encrypted in a separate table that is never shown here.' },
  {
    table: 'logins', label: 'Logins (older list)', domain: 'references_access', grain: 'login', browse: 'everyone', client: CLIENT_REF, orderBy: 'platform',
    description: 'The older list of logins, without passwords. Stored logins replace it; it is kept until its rows are moved across.'
  },
  { table: 'credential_secrets', label: 'Stored secrets', domain: 'references_access', grain: 'secret of a login', browse: 'never', description: 'Encrypted secrets of stored logins. Never shown; opened one at a time from Stored logins.' },
  { table: 'vault_keys', label: 'Vault key settings', domain: 'references_access', grain: 'vault key version', browse: 'never', description: 'How the vault key is derived, and a check value. Never the key itself.' },

  // ── The practice ─────────────────────────────────────────────────────────
  { table: 'firm_data', label: 'Firm', domain: 'practice', grain: 'firm', browse: 'managers', orderBy: 'name', description: 'The firm’s name, address and contact details.' },
  { table: 'practice_identifiers', label: 'Practice references', domain: 'practice', grain: 'reference', browse: 'managers', orderBy: 'kind', description: 'Agent codes, ARN, AML supervision, ICO, ACSP and the firm’s own tax references.' },
  { table: 'lookup_values', label: 'Lists', domain: 'practice', grain: 'list entry', browse: 'everyone', orderBy: 'list_key', description: 'The editable lists behind drop-downs: statuses, contact types, filing routes and so on.' },
  { table: 'custom_field_defs', label: 'Custom fields', domain: 'practice', grain: 'custom field', browse: 'everyone', orderBy: 'label', description: 'The practice’s own extra fields.' },
  { table: 'app_settings', label: 'Settings', domain: 'system', grain: 'setting', browse: 'never', description: 'Application settings.' },

  // ── Imports and provenance ───────────────────────────────────────────────
  { table: 'import_batches', label: 'Imports', domain: 'provenance', grain: 'import run', browse: 'managers', orderBy: 'committed_at', description: 'Each import: file, its SHA-256, who committed it, and whether it was rolled back.' },
  { table: 'import_changes', label: 'Import changes', domain: 'provenance', grain: 'row changed by an import', browse: 'managers', orderBy: 'id', hidden: ['before_json', 'after_json', 'prev_snapshot_json'], description: 'Every insert and update an import made, so it can be rolled back. The row snapshots are not shown here.' },
  { table: 'external_ids', label: 'Source row mapping', domain: 'provenance', grain: 'imported row', browse: 'managers', orderBy: 'entity_table', hidden: ['snapshot_json'], description: 'Which source row each record came from, so re-imports update rather than duplicate.' },
  { table: 'schema_migrations', label: 'Schema versions', domain: 'provenance', grain: 'database change applied', browse: 'never', description: 'Database changes applied, with checksums.' },

  // ── System ───────────────────────────────────────────────────────────────
  { table: 'audit_log', label: 'Audit log', domain: 'system', grain: 'recorded action', browse: 'managers', orderBy: 'timestamp', description: 'Who changed or looked at what, and when. Secret values are never written here.' },
  { table: 'backup_registry', label: 'Backups', domain: 'system', grain: 'backup', browse: 'managers', orderBy: 'created_at', description: 'Backups taken, where they are and who made them.' },
  { table: 'licence_markers', label: 'Licence state', domain: 'system', grain: 'licence record', browse: 'never', description: 'Sealed licence state.' },
  { table: 'companies_house_cache', label: 'Companies House cache', domain: 'system', grain: 'company looked up', browse: 'never', description: 'Recent Companies House responses, to save repeat lookups.' },

  // ── Experimental (to remove) ─────────────────────────────────────────────
  { table: 'dids', label: 'Decentralised identifiers', domain: 'experimental', grain: 'identifier', browse: 'never', hidden: ['private_key'], description: 'Experimental. Holds private keys in plain text: remove with its feature.' },
  { table: 'verifiable_credentials', label: 'Verifiable credentials', domain: 'experimental', grain: 'credential', browse: 'never', description: 'Experimental.' },
  { table: 'verifiable_plugins', label: 'Verifiable plugins', domain: 'experimental', grain: 'plugin', browse: 'never', description: 'Experimental.' },
  { table: 'homomorphic_shares', label: 'Homomorphic shares', domain: 'experimental', grain: 'share', browse: 'never', description: 'Experimental.' },
  { table: 'merkle_dag', label: 'Merkle ledger', domain: 'experimental', grain: 'node', browse: 'never', description: 'Experimental.' },
  { table: 'zk_sessions', label: 'Zero-knowledge sessions', domain: 'experimental', grain: 'session', browse: 'never', description: 'Experimental.' }
]

const BY_TABLE = new Map(TABLES.map((t) => [t.table, t]))

export const tableSpec = (table: string): TableSpec | undefined => BY_TABLE.get(table)

export const tablesIn = (domain: DomainKey): TableSpec[] => TABLES.filter((t) => t.domain === domain)

// ── Column labels ───────────────────────────────────────────────────────────

const WORDS: Readonly<Record<string, string>> = {
  utr: 'UTR', vat: 'VAT', paye: 'PAYE', nino: 'NINO', ct: 'CT', sa: 'SA', aml: 'AML', cdd: 'CDD', edd: 'EDD', pep: 'PEP', poa: 'proof of address',
  id: 'ID', idv: 'IDV', mtd: 'MTD', itsa: 'ITSA', rti: 'RTI', cis: 'CIS', sic: 'SIC', frs: 'FRS', iht: 'IHT', url: 'URL', json: 'JSON', pct: '%',
  dob: 'date of birth', ref: 'reference', recd: 'received', conf: 'confirmation', stmt: 'statement', ai: 'AI', sha256: 'SHA-256', uid: 'UID',
  no: 'number', inc: 'incorporation', reg: 'registration', ch: 'Companies House', dflt: 'default', vc: 'VC', did: 'DID', cid: 'CID', crdt: 'CRDT'
}

/** "accounts_office_ref" → "Accounts office reference"; table-specific labels win. */
export function columnLabel(table: string, column: string): string {
  const own = tableSpec(table)?.labels?.[column]
  if (own) return own
  if (column === 'client_ref') return 'Client'
  if (column === 'created_at') return 'Created'
  if (column === 'updated_at') return 'Last changed'
  const words = column.split('_').filter(Boolean).map((w) => WORDS[w] ?? w)
  const text = words.join(' ').replace(/\bnumber of\b/, 'number of')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Whether a column is never shown, shown masked, or shown as is. */
export function columnTreatment(table: string, column: string): 'hidden' | 'masked' | 'shown' {
  const spec = tableSpec(table)
  if (!spec) return 'hidden'
  if (spec.hidden?.includes(column)) return 'hidden'
  if (spec.masked?.includes(column)) return 'masked'
  return 'shown'
}

/** "AB123456C" → "•••••••6C". */
export const maskValue = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null
  const s = String(value)
  return s.length <= 2 ? '••' : '•'.repeat(Math.min(8, s.length - 2)) + s.slice(-2)
}
