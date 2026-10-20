/**
 * Companies House CRM — Shared Types (v5 stabilized)
 *
 * SINGLE SOURCE OF TRUTH for everything that crosses the main ↔ renderer
 * boundary. Both `src/preload/index.ts` and every renderer module import
 * from this file (via the `@shared/types` path alias).
 *
 * Rules:
 *   1. Add a new IPC channel → add the typed method to `IElectronAPI` FIRST,
 *      then implement it in preload, then in the main-process handler. If
 *      those three get out of sync again, tsc --noEmit will fail loudly.
 *   2. Every IPC method uses one of two shapes:
 *        a. `Promise<T>`              for reads that cannot fail at the API
 *                                     layer (throws propagate up).
 *        b. `Promise<IpcResult<T>>`   for mutations, list+paginate, and
 *                                     anything that benefits from an
 *                                     in-band error.
 *      Mixing {success, error?} ad-hoc shapes is deprecated; prefer
 *      IpcResult<T>. Legacy {success,...} shapes are kept where removing
 *      them would cascade into dozens of caller rewrites.
 *   3. Do NOT put renderer-only or main-only types here. Only shapes that
 *      cross the process boundary.
 */

// ── Result wrapper ──────────────────────────────────────────────────────────

export type IpcOk<T> = { ok: true; data: T }
export type IpcErr = { ok: false; error: string }
export type IpcResult<T> = IpcOk<T> | IpcErr

// ── Users & RBAC ────────────────────────────────────────────────────────────

export type UserRole = 'partner' | 'manager' | 'staff'

export interface User {
  id: number
  email: string
  name: string                       // added: Settings.tsx reads user.name
  role: UserRole
  active: number                     // added: Settings.tsx reads user.active (SQLite int 0/1)
  did?: string | null
  last_login?: string | null
  created_at: string
}

// ── Client taxonomy ─────────────────────────────────────────────────────────

export type ClientCategory =
  | 'company'
  | 'individual'
  | 'sole_trader'
  | 'partnership'
  | 'llp'
  | 'limited_partnership'
  | 'trust'
  | 'estate'
  | 'charity'
  | 'non_profit'

export const CLIENT_CATEGORY_LABELS: Record<ClientCategory, string> = {
  company: 'Limited Company',
  individual: 'Individual',
  sole_trader: 'Sole Trader',
  partnership: 'Partnership',
  llp: 'LLP',
  limited_partnership: 'Limited Partnership',
  trust: 'Trust',
  estate: 'Estate',
  charity: 'Charity',
  non_profit: 'Non-Profit / CIC'
}

export const CLIENT_CATEGORY_ICONS: Record<ClientCategory, string> = {
  company: '🏢',
  individual: '👤',
  sole_trader: '🛠️',
  partnership: '🤝',
  llp: '⚖️',
  limited_partnership: '📋',
  trust: '🔒',
  estate: '🏛️',
  charity: '❤️',
  non_profit: '🌱'
}

export type ServiceType =
  | 'company_formation'
  | 'accounts_submission'
  | 'confirmation_statement'
  | 'corporation_tax'
  | 'self_assessment'
  | 'vat_returns'
  | 'payroll'
  | 'bookkeeping'
  | 'audit'
  | 'liquidation'
  | 'advisory'
  | 'wealth_estate_planning'
  | 'partnership_tax_return'
  | 'trust_tax_return'
  | 'charity_accounts'
  | 'dormant_accounts'

export const SERVICE_LABELS: Record<ServiceType, string> = {
  company_formation: 'Company Formation',
  accounts_submission: 'Accounts Submission',
  confirmation_statement: 'Confirmation Statement',
  corporation_tax: 'Corporation Tax (CT600)',
  self_assessment: 'Self Assessment',
  vat_returns: 'VAT Returns',
  payroll: 'Payroll (RTI)',
  bookkeeping: 'Bookkeeping',
  audit: 'Audit',
  liquidation: 'Liquidation',
  advisory: 'Advisory & Counselling',
  wealth_estate_planning: 'Wealth & Estate Planning',
  partnership_tax_return: 'Partnership Tax Return (SA800)',
  trust_tax_return: 'Trust & Estate Tax Return (SA900)',
  charity_accounts: 'Charity Accounts',
  dormant_accounts: 'Dormant Accounts'
}

export const DEFAULT_SERVICES_BY_CATEGORY: Record<ClientCategory, ServiceType[]> = {
  company: ['accounts_submission', 'confirmation_statement', 'corporation_tax'],
  individual: ['self_assessment'],
  sole_trader: ['self_assessment', 'bookkeeping'],
  partnership: ['partnership_tax_return', 'bookkeeping'],
  llp: ['accounts_submission', 'confirmation_statement'],
  limited_partnership: ['partnership_tax_return'],
  trust: ['trust_tax_return'],
  estate: ['trust_tax_return', 'self_assessment'],
  charity: ['charity_accounts'],
  non_profit: ['accounts_submission']
}

export interface ClientService {
  id: number
  client_ref: string
  client_id: number | null
  service_type: ServiceType
  active: number
  fee: number | null
  frequency: string | null
  last_completed: string | null
  next_due: string | null
  assigned_to: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PartnershipMember {
  id: number
  client_ref: string
  member_type: 'partner' | 'designated_member' | 'general_partner' | 'limited_partner'
  name: string
  utr: string | null
  nino: string | null
  share_pct: number | null
  capital: number | null
  appointed_on: string | null
  resigned_on: string | null
  notes: string | null
}

export interface TrustMember {
  id: number
  client_ref: string
  member_type: 'trustee' | 'beneficiary' | 'settlor' | 'protector'
  name: string
  nino: string | null
  dob: string | null
  share_pct: number | null
  appointed_on: string | null
  resigned_on: string | null
  notes: string | null
}

// ── Master client record ────────────────────────────────────────────────────

export interface Client {
  id: number
  ref: string | null
  client_name: string
  client_category: ClientCategory
  client_sub_type: string | null
  status: string | null
  dormant: number | null
  dissolved_date: string | null
  insolvency_status: string | null
  industry_sector: string | null

  business_name: string | null
  reg_no: string | null
  sic_code: string | null
  inc_date: string | null
  year_end_month: string | null
  frs_standard: string | null
  audit_required: number | null
  company_secretary: string | null
  group_parent: string | null
  net_assets: string | null
  accounts_preparer: string | null

  title: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  director: string | null
  prev_accountant: string | null

  utr: string | null
  nino: string | null
  sa_class: string | null
  next_sa_due: string | null
  paye_scheme: string | null
  paye_ref: string | null
  vat_no: string | null
  vat_rate: string | null
  vat_scheme: string | null
  vat_registration_date: string | null
  ct_ref: string | null
  auth_code: string | null

  mtd_vat_status: string | null
  mtd_itsa_status: string | null

  payroll_frequency: string | null
  no_employees: number | null
  pension_provider: string | null
  pension_staging_date: string | null

  trust_type: string | null
  trust_deed_date: string | null
  iht_applicable: number | null

  partnership_utr: string | null

  charity_number: string | null
  gift_aid_registered: number | null

  last_accounts: string | null
  accounts_due: string | null
  ct_next_due: string | null
  last_vat: string | null
  vat_due: string | null
  last_conf_stmt: string | null
  conf_stmt_due: string | null

  signed_64_8: number | null
  engagement_letter: number | null
  assigned_to: string | null
  sa_status: string | null
  sa_note: string | null

  risk_score: number | null
  risk_rating: string | null
  overdue_count: number | null
  next_action: string | null
  completeness_pct: number | null

  services: string | null
  annual_fee: number | null
  last_invoice: string | null
  payment_recd: string | null
  payment_status: string | null
  last_fee_review: string | null
  last_contacted: string | null
  remarks: string | null

  created_at: string
  updated_at: string
}

/**
 * Condensed row used by list views (Dashboard, Clients table, spatial lake).
 * Backfilled from `Client` inside the preload bridge.
 */
export interface ClientRow {
  id: number
  name: string
  status: string
  risk_level: string
  last_sync_at: number
}

/**
 * The "hybrid" object the preload bridge returns from `getClient()` — the
 * full Client plus the three derived fields a few callers (ClientDetail,
 * SpatialDashboard) read directly.
 */
export type ClientDetailHybrid = Client & {
  name: string
  risk_level: string
  last_sync_at: number
}

// ── Tasks / HMRC / AML / WIP ────────────────────────────────────────────────

export interface Task {
  id: number
  client_ref: string | null
  client_name: string | null
  description: string
  category: string | null
  assigned_to: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  due_date: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface HmrcSubmission {
  id: number
  date_submitted: string
  client_ref: string | null
  client_name: string | null
  submission_type: string
  tax_year: string | null
  filed_period: string | null
  submitted_by: string | null
  method: string | null
  reference_no: string | null
  submission_ref: string | null
  acknowledgement: string | null
  outcome: string | null
  hmrc_response: string | null
  notes: string | null
  created_at: string
}

export interface AmlRecord {
  id: number
  client_ref: string
  client_name: string | null
  type: string | null
  risk_level: 'low' | 'medium' | 'high' | null
  cdd_completed: number | null
  cdd_date: string | null
  edd_required: number | null
  id_type_1: string | null
  id_doc_1_verified: number | null
  id_type_2: string | null
  id_doc_2_verified: number | null
  proof_of_address: string | null
  poa_verified: number | null
  pep_check: number | null
  sanctions_check: number | null
  source_of_funds: string | null
  review_due_date: string | null
  notes: string | null
  updated_at: string
}

export interface WipItem {
  id: number
  client_ref: string | null
  client_name: string | null
  type: string | null
  assigned_to: string | null
  phone: string | null
  email: string | null
  deadline: string | null
  status: string | null
  due_date: string | null
  services: string | null
  sa_status: string | null
  notes: string | null
  created_at: string
}

export interface Interaction {
  id: number
  date: string
  client_ref: string | null
  client_name: string | null
  type: string | null
  contact_method: string | null
  staff_member: string | null
  summary: string
  followup_date: string | null
  followup_done: number | null
  created_at: string
}

export interface Payment {
  id: number
  client_ref: string | null
  client_name: string | null
  invoice_date: string | null
  invoice_no: string | null
  amount: number | null
  vat_amount: number | null
  status: 'pending' | 'paid' | 'overdue' | 'cancelled' | null
  due_date: string | null
  paid_date: string | null
  payment_method: string | null
  notes: string | null
  created_at: string
}

// ── Dashboard aggregates ────────────────────────────────────────────────────

export interface DashboardStats {
  totalClients: number
  activeClients: number
  overdueCount: number
  wipCount: number
  tasksToday: number
  clientsByCategory: Record<string, number>
  upcomingDeadlines: Array<{
    client_name: string
    type: string
    due_date: string
    days_remaining: number
  }>
  recentActivity: Array<{
    action: string
    timestamp: string
    user: string
  }>
  totalAR: number
  overdueInvoices: number
}

/**
 * Shape returned by `window.api.getMetrics()` — a compact subset of
 * DashboardStats used by the hero cards on the Dashboard screen.
 */
export interface DashboardMetrics {
  totalClients: number
  activeClients: number
  atRisk: number
  integrityPct: number
}

// ── Settings & firm profile ─────────────────────────────────────────────────

export interface ApiSettings {
  // CH API primary
  apiKey: string | null              // widened: DB returns null, not undefined
  apiMode: 'rest' | 'streaming'
  appTheme?: 'light' | 'dark' | 'system'
  aiModel?: string
  uiStyle?: 'glass' | 'bento' | 'neumorphic' | 'clay' | 'skeuo' | 'neo'
  streamingEnabled: boolean
  notificationsEnabled: boolean
  deadlineAlertDays: number
  sentryDsn: string | null
  streamEndpoints?: CHStreamEndpoint[]

  // HMRC
  hmrcClientId: string | null
  hmrcClientSecret: string | null
  hmrcSandbox: boolean

  // Resend
  resendApiKey: string | null
  resendFromEmail: string | null

  // Twilio
  twilioAccountSid: string | null
  twilioAuthToken: string | null
  twilioFromNumber: string | null

  // Xero
  xeroClientId: string | null
  xeroClientSecret: string | null

  // Firm branding / AI voice
  firm_name?: string
  brand_voice?: 'Corporate' | 'Casual' | 'Technical' | 'Friendly' | 'Direct'
  email_signature?: string
  legal_disclaimer_active?: boolean
  disclaimer_text?: string
  reporting_preferences?: {
    internal_format: 'concise' | 'detailed'
    external_format: 'concise' | 'detailed'
  }
  preferred_currency?: string
}

export interface FirmData {
  id: number
  name: string
  registration_number: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  postcode: string | null
  country: string | null
  email: string | null
  phone: string | null
  time_zone: string | null
  locale: string | null
  logo_path: string | null
  is_active: number
  created_at: string
  updated_at: string
}

// ── Communications, Email templates, AI chat ────────────────────────────────

export interface EmailTemplate {
  id: number
  template_key: string
  client_ref: string | null
  label: string
  subject: string
  body: string
  is_ai_generated: number
  tags: string | null
  channel: 'email' | 'whatsapp' | 'both' | null
  whatsapp_body: string | null
  created_at: string
  updated_at: string
}

export interface AiMessage {
  id: number
  session_id: string
  role: 'user' | 'assistant' | 'tool_result'
  content: string
  client_ref: string | null
  metadata: string | null
  created_at: string
}

export interface AiSession {
  session_id: string
  started_at: string
  message_count: number
  client_ref: string | null
  first_message: string | null
}

export interface CommunicationLog {
  id: number
  client_ref: string
  client_name: string | null
  channel: 'email' | 'whatsapp' | 'both'
  template_key: string | null
  subject: string | null
  body_preview: string | null
  status: 'sent' | 'failed' | 'pending'
  sent_by: string | null
  sent_at: string
  notes: string | null
}

// ── Onboarding observations, AR, documents, activity ────────────────────────

export interface OnboardingObservation {
  id: number
  client_ref: string
  field_name: string
  label: string
  status: 'missing' | 'provided' | 'waived'
  notes: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface PaymentReceipt {
  id: number
  client_ref: string
  client_name: string | null
  payment_id: number | null
  receipt_date: string
  amount: number
  method: string | null
  reference: string | null
  notes: string | null
  recorded_by: string | null
  created_at: string
}

export interface ClientAR {
  client_ref: string
  total_invoiced: number
  total_received: number
  outstanding: number
  bucket_current: number
  bucket_30: number
  bucket_60: number
  bucket_90: number
  bucket_90plus: number
}

export interface ARSummary {
  total_invoiced: number
  total_received: number
  outstanding: number
  overdue_count: number
}

export interface AppDocument {
  id: number
  client_ref: string
  filename: string
  file_path: string
  category: string
  file_size: number
  mime_type: string
  created_at: string
  updated_at: string
}

export interface TimelineEvent {
  id: string
  type: 'interaction' | 'document' | 'submission' | 'task' | 'audit' | 'status_change'
  title: string
  description: string
  timestamp: string
  subtext?: string
  status?: string
}

export interface BackupRecord {
  id: number
  filename: string
  file_path: string
  file_size: number | null
  created_by: string | null
  notes: string | null
  created_at: string
}

// ── Companies House API ─────────────────────────────────────────────────────

export interface CHCompany {
  company_number: string
  title: string
  company_status: string
  company_type: string
  date_of_creation: string
  address: {
    address_line_1?: string
    locality?: string
    postal_code?: string
  }
  snippet?: string
}

export interface CHCompanyDetail extends CHCompany {
  registered_office_address: {
    address_line_1?: string
    address_line_2?: string
    locality?: string
    region?: string
    postal_code?: string
    country?: string
  }
  accounts?: {
    next_due?: string
    next_made_up_to?: string
    last_accounts?: { made_up_to?: string; type?: string }
  }
  confirmation_statement?: {
    next_due?: string
    next_made_up_to?: string
    last_made_up_to?: string
  }
  sic_codes?: string[]
  has_charges?: boolean
  has_insolvency_history?: boolean
  officers?: CHOfficer[]
}

export interface CHOfficer {
  name: string
  role: string
  appointed_on?: string
  resigned_on?: string
  address?: {
    premises?: string
    address_line_1?: string
    locality?: string
    postal_code?: string
  }
}

export interface CHStreamEvent {
  resource_kind: string
  resource_id: string
  resource_uri?: string
  data: Record<string, unknown>
  published_at: string
  endpoint?: string
  timepoint?: number
}

export type CHStreamEndpoint =
  | '/companies'
  | '/filings'
  | '/insolvency-cases'
  | '/charges'
  | '/officers'
  | '/persons-with-significant-control'
  | '/disqualified-officers'
  | '/company-exemptions'
  | '/persons-with-significant-control-statements'

export interface CHStreamStatus {
  endpoint: CHStreamEndpoint
  label: string
  status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'stopped' | 'error'
  eventCount: number
  error?: string
}

// ── The IPC bridge — the one interface window.api conforms to ───────────────

/**
 * Every channel exposed by `src/preload/index.ts` is typed here. If you add
 * a new IPC handler, add it to this interface FIRST — the preload and the
 * main handler both follow from this.
 *
 * Return-shape convention:
 *   – Reads of collections / rows that never have in-band errors  → `Promise<T>`
 *   – Anything that can fail mid-flight (create, update, delete,
 *     any test connection, any upload)                             → `Promise<IpcResult<T>>`
 *   – A few legacy methods return `{success: boolean, ...}` and are
 *     retained to avoid a cascading caller rewrite. They are marked
 *     `// legacy-shape` and should be migrated to `IpcResult<T>`.
 */
export interface IElectronAPI {
  // ── System ────────────────────────────────────────────────────────────────
  ping: () => Promise<{ ok: true; ts: number }>
  getSystemStatus: () => Promise<{
    db: 'ok' | 'degraded' | 'down'
    auth: 'ok' | 'degraded' | 'down'
    companiesHouse: 'ok' | 'degraded' | 'down'
    ai: 'ok' | 'degraded' | 'down'
  }>
  getAppVersion: () => Promise<string>

  // ── Auth (passkey + session) ──────────────────────────────────────────────
  auth: {
    webauthnRegister: (username: string) => Promise<IpcResult<{ did: string }>>
    webauthnLogin: (username: string) => Promise<IpcResult<{ sessionToken: string; userId: number }>>
    logout: () => Promise<IpcResult<null>>
    /** dev helper — never called from production UI */
    devGetFirstUser: () => Promise<User | null>
  }

  // ── User management (RBAC) ────────────────────────────────────────────────
  user: {
    getAll: () => Promise<User[]>
    generateInvite: (email: string, role: UserRole) => Promise<IpcResult<{ inviteKey: string }>>
    updateRole: (userId: number, role: UserRole, active: boolean) => Promise<IpcResult<null>>
    delete: (userId: number) => Promise<IpcResult<null>>
  }

  // ── Clients (CRUD + list/pagination) ──────────────────────────────────────
  listClients: (params: {
    offset?: number
    limit?: number
    search?: string
    category?: ClientCategory
  }) => Promise<IpcResult<{
    rows: ClientRow[]
    total: number
    offset: number
    limit: number
  }>>
  getClient: (params: { id?: number; ref?: string } | string | number) => Promise<IpcResult<ClientDetailHybrid | null>>
  getClients: () => Promise<Client[]>
  createClient: (data: Partial<Client>) => Promise<IpcResult<{ id: number }>>
  updateClient: (id: number, data: Partial<Client>) => Promise<IpcResult<null>>
  deleteClient: (id: number) => Promise<IpcResult<null>>
  importClients: (data: Partial<Client>[]) => Promise<IpcResult<{ count: number }>>

  // ── Client services / members ─────────────────────────────────────────────
  getClientServices: (clientRef: string) => Promise<ClientService[]>
  upsertClientService: (data: Partial<ClientService>) => Promise<IpcResult<{ id: number }>>
  deleteClientService: (id: number) => Promise<IpcResult<null>>
  getPartnershipMembers: (clientRef: string) => Promise<PartnershipMember[]>
  savePartnershipMembers: (clientRef: string, members: Partial<PartnershipMember>[]) => Promise<IpcResult<null>>
  getTrustMembers: (clientRef: string) => Promise<TrustMember[]>
  saveTrustMembers: (clientRef: string, members: Partial<TrustMember>[]) => Promise<IpcResult<null>>

  // ── Companies House ───────────────────────────────────────────────────────
  searchCompanies: (query: string) => Promise<IpcResult<CHCompany[]>>
  getCompanyProfile: (number: string) => Promise<IpcResult<CHCompanyDetail>>
  syncClientFromCH: (clientId: number, companyNumber: string) => Promise<IpcResult<null>>
  bgSyncClients: () => Promise<IpcResult<{ synced: number; total: number }>>

  // ── Tasks / HMRC / AML ────────────────────────────────────────────────────
  getTasks: () => Promise<Task[]>
  createTask: (data: Partial<Task>) => Promise<IpcResult<{ id: number }>>
  updateTask: (id: number, data: Partial<Task>) => Promise<IpcResult<null>>
  deleteTask: (id: number) => Promise<IpcResult<null>>

  getHmrcSubmissions: (clientRef?: string) => Promise<HmrcSubmission[]>
  createHmrcSubmission: (data: Partial<HmrcSubmission>) => Promise<IpcResult<{ id: number }>>
  updateHmrcSubmission: (id: number, data: Partial<HmrcSubmission>) => Promise<IpcResult<null>>
  deleteHmrcSubmission: (id: number) => Promise<IpcResult<null>>

  getAmlRecords: () => Promise<AmlRecord[]>
  upsertAmlRecord: (data: Partial<AmlRecord>) => Promise<IpcResult<null>>

  // ── WIP ──────────────────────────────────────────────────────────────────
  getWipItems: (clientRef?: string) => Promise<WipItem[]>
  createWipItem: (data: Partial<WipItem>) => Promise<IpcResult<{ id: number }>>
  updateWipItem: (id: number, data: Partial<WipItem>) => Promise<IpcResult<null>>
  deleteWipItem: (id: number) => Promise<IpcResult<null>>

  // ── Interactions ──────────────────────────────────────────────────────────
  getInteractions: (clientRef?: string) => Promise<Interaction[]>
  createInteraction: (data: Partial<Interaction>) => Promise<IpcResult<{ id: number }>>
  deleteInteraction: (id: number) => Promise<IpcResult<null>>

  // ── Payments + AR ─────────────────────────────────────────────────────────
  getPayments: (params?: { clientRef?: string }) => Promise<Payment[]>
  createPayment: (data: Partial<Payment>) => Promise<IpcResult<{ id: number }>>
  updatePayment: (id: number, data: Partial<Payment>) => Promise<IpcResult<null>>
  deletePayment: (id: number) => Promise<IpcResult<null>>
  getClientAR: (clientRef: string) => Promise<ClientAR>
  getAllClientAR: () => Promise<ClientAR[]>
  getARSummary: () => Promise<ARSummary>
  getPaymentReceipts: (clientRef: string) => Promise<PaymentReceipt[]>
  addPaymentReceipt: (data: Partial<PaymentReceipt>) => Promise<IpcResult<{ id: number }>>
  deletePaymentReceipt: (id: number) => Promise<IpcResult<null>>

  // ── Dashboard ─────────────────────────────────────────────────────────────
  getDashboardStats: () => Promise<DashboardStats>
  getMetrics: () => Promise<IpcResult<DashboardMetrics>>

  // ── Settings & firm ───────────────────────────────────────────────────────
  getApiSettings: () => Promise<ApiSettings>
  saveApiSettings: (data: Partial<ApiSettings>) => Promise<IpcResult<null>>
  getFirmData: () => Promise<FirmData | null>
  saveFirmData: (data: Partial<FirmData>) => Promise<IpcResult<null>>
  testApiConnection: () => Promise<IpcResult<{ message: string }>>
  testHmrcConnection: () => Promise<IpcResult<{ message: string }>>
  testResendConnection: () => Promise<IpcResult<{ message: string }>>
  testTwilioConnection: () => Promise<IpcResult<{ message: string }>>
  seedSampleData: () => Promise<IpcResult<{ count: number }>>

  // ── Documents ─────────────────────────────────────────────────────────────
  getDocuments: (clientRef: string) => Promise<AppDocument[]>
  uploadDocument: (
    clientRef: string,
    filePath: string,
    filename: string,
    category: string
  ) => Promise<IpcResult<{ doc: AppDocument }>>
  deleteDocument: (id: number) => Promise<IpcResult<null>>
  openDocument: (filePath: string) => Promise<IpcResult<null>>

  // ── Activity timeline ─────────────────────────────────────────────────────
  getActivityTimeline: (clientRef: string) => Promise<TimelineEvent[]>

  // ── Email templates ───────────────────────────────────────────────────────
  listEmailTemplates: (clientRef?: string) => Promise<EmailTemplate[]>
  getEmailTemplate: (templateKey: string, clientRef?: string) => Promise<EmailTemplate | null>
  upsertEmailTemplate: (data: Partial<EmailTemplate> & {
    template_key: string
    label: string
    subject: string
    body: string
  }) => Promise<IpcResult<{ id: number }>>
  deleteEmailTemplate: (id: number) => Promise<IpcResult<null>>
  resetEmailTemplateDefault: (templateKey: string) => Promise<IpcResult<null>>
  aiGenerateEmail: (params: {
    templateKey: string
    clientData: Record<string, string | number | null>
    instruction?: string
  }) => Promise<IpcResult<{ subject: string; body: string }>>

  // ── AI chat (Ollama-backed) ───────────────────────────────────────────────
  aiChat: (params: {
    sessionId: string
    message: string
    clientRef?: string
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  }) => Promise<IpcResult<{
    response: string
    toolCalls?: Array<{ tool: string; args: Record<string, unknown>; result: unknown }>
  }>>
  aiGetHistory: (sessionId: string) => Promise<AiMessage[]>
  aiListSessions: () => Promise<AiSession[]>
  aiDeleteSession: (sessionId: string) => Promise<IpcResult<null>>
  getOllamaModels: () => Promise<IpcResult<{ models: string[] }>>

  // ── Comms Hub ─────────────────────────────────────────────────────────────
  logCommunication: (data: Partial<CommunicationLog>) => Promise<IpcResult<{ id: number }>>
  getCommunicationLog: (clientRef?: string) => Promise<CommunicationLog[]>
  deleteCommunicationLog: (id: number) => Promise<IpcResult<null>>
  suggestTemplate: (clientRef: string) => Promise<IpcResult<{ templateKey: string; reason: string }>>

  // ── Onboarding observations ──────────────────────────────────────────────
  getOnboardingObservations: (clientRef: string) => Promise<OnboardingObservation[]>
  scanOnboardingGaps: (clientRef: string) => Promise<IpcResult<{ created: number }>>
  updateObservation: (id: number, status: string, notes?: string) => Promise<IpcResult<null>>

  // ── Backups ───────────────────────────────────────────────────────────────
  listBackups: () => Promise<BackupRecord[]>
  createBackup: (createdBy: string, notes?: string) => Promise<IpcResult<{
    id: number
    filename: string
    file_size: number
  }>>
  restoreBackup: (backupId: number) => Promise<IpcResult<null>>
  deleteBackup: (backupId: number) => Promise<IpcResult<null>>
  getBackupStats: () => Promise<IpcResult<{ count: number; total_size: number }>>

  // ── Crash reporting ───────────────────────────────────────────────────────
  sendCrashReport: (report: {
    message: string
    stack?: string
    includeSystemInfo: boolean
    appVersion?: string
  }) => Promise<void>

  // ── Companies House live streaming (SSE) ─────────────────────────────────
  getStreamStatus: () => Promise<CHStreamStatus[]>
  setStreamEndpoints: (endpoints: CHStreamEndpoint[]) => Promise<IpcResult<null>>
  onCHStreamStatus: (callback: (status: CHStreamStatus[]) => void) => () => void
  onCHStreamEvent: (callback: (event: CHStreamEvent) => void) => () => void

  // ── Deadline push alerts ──────────────────────────────────────────────────
  onDeadlineAlert: (callback: (data: {
    client_name: string
    type: string
    days: number
  }) => void) => () => void
}
