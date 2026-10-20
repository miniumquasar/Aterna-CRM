/**
 * Onboarding requirements — what a client must have on file before work
 * starts, by client type and by the services the practice provides.
 *
 * Replaces one fixed list of 11 fields asked of every client: individuals
 * were asked for a company number's worth of company data, emails held on
 * contact records did not count, and former clients still showed gaps.
 *
 * Rules are data. To change what is required, edit REQUIREMENTS.
 */

import type { Database } from 'better-sqlite3-multiple-ciphers'

type Category = 'company' | 'llp' | 'limited_partnership' | 'partnership' | 'individual' | 'sole_trader' | 'trust' | 'estate' | 'charity'

export interface ClientFacts {
  category: string | null
  client: Record<string, unknown>
  /** Active service types; empty when none are recorded. */
  services: Set<string>
  /** True when the client has no service rows at all, so the type's usual filings are assumed. */
  servicesUnknown: boolean
  contactEmail: boolean
  contactPhone: boolean
  contactName: boolean
  directors: number
  amlComplete: boolean
  partners: number
  trustees: number
  payrollSchemes: number
}

export interface Requirement {
  field: string
  label: string
  reason: string
  applies: (f: ClientFacts) => boolean
  satisfied: (f: ClientFacts) => boolean
}

const has = (v: unknown): boolean => v !== null && v !== undefined && v !== '' && v !== 0
const is = (f: ClientFacts, ...cats: Category[]): boolean => cats.includes(f.category as Category)
const uses = (f: ClientFacts, ...services: string[]): boolean => services.some((s) => f.services.has(s))
const ORGANISATIONS: Category[] = ['company', 'llp', 'limited_partnership', 'partnership', 'trust', 'estate', 'charity']
const AT_COMPANIES_HOUSE: Category[] = ['company', 'llp', 'limited_partnership']
const HMRC_SERVICES = ['self_assessment', 'corporation_tax', 'vat_returns', 'payroll', 'partnership_tax_return', 'trust_tax_return']
const CH_SERVICES = ['accounts_submission', 'confirmation_statement', 'dormant_accounts', 'company_formation']

export const REQUIREMENTS: readonly Requirement[] = [
  // Every client
  { field: 'email', label: 'Email address', reason: 'Needed for correspondence, engagement letters and invoices',
    applies: () => true, satisfied: (f) => has(f.client.email) || f.contactEmail },
  { field: 'phone', label: 'Phone number', reason: 'Needed to reach the client',
    applies: () => true, satisfied: (f) => has(f.client.phone) || f.contactPhone },
  { field: 'engagement_letter', label: 'Engagement letter', reason: 'Professional body rules: agree the terms before work starts',
    applies: () => true, satisfied: (f) => has(f.client.engagement_letter) },
  { field: 'aml_check', label: 'AML customer due diligence', reason: 'Money Laundering Regulations 2017: identify and verify the client before work starts',
    applies: () => true, satisfied: (f) => f.amlComplete },
  { field: 'signed_64_8', label: '64-8 agent authorisation', reason: 'Lets HMRC deal with the practice on the client\u2019s behalf',
    applies: (f) => f.servicesUnknown || uses(f, ...HMRC_SERVICES), satisfied: (f) => has(f.client.signed_64_8) },

  // Organisations
  { field: 'contact_name', label: 'Contact name', reason: 'Someone to address correspondence to',
    applies: (f) => is(f, ...ORGANISATIONS), satisfied: (f) => has(f.client.contact_name) || f.contactName },

  // Registered at Companies House
  { field: 'reg_no', label: 'Company number', reason: 'Identifies the entity at Companies House',
    applies: (f) => is(f, ...AT_COMPANIES_HOUSE), satisfied: (f) => has(f.client.reg_no) },
  { field: 'director', label: 'Director / designated member', reason: 'Needed for the engagement letter, AML and filings',
    applies: (f) => is(f, ...AT_COMPANIES_HOUSE), satisfied: (f) => has(f.client.director) || f.directors > 0 },
  { field: 'year_end_month', label: 'Year end', reason: 'Drives the accounts and corporation tax deadlines',
    applies: (f) => is(f, ...AT_COMPANIES_HOUSE, 'charity'), satisfied: (f) => has(f.client.year_end_month) || has(f.client.accounting_ref_date) },
  { field: 'auth_code', label: 'Companies House authentication code', reason: 'Needed to file at Companies House',
    applies: (f) => is(f, ...AT_COMPANIES_HOUSE) && (f.servicesUnknown || uses(f, ...CH_SERVICES)), satisfied: (f) => has(f.client.auth_code) },
  { field: 'ct_ref', label: 'Corporation tax UTR', reason: 'Needed for CT600 returns',
    applies: (f) => (is(f, 'company') && f.servicesUnknown) || uses(f, 'corporation_tax'), satisfied: (f) => has(f.client.ct_ref) },

  // People
  { field: 'utr', label: 'Self Assessment UTR', reason: 'Needed for the tax return',
    applies: (f) => (is(f, 'individual', 'sole_trader') && (f.servicesUnknown || uses(f, 'self_assessment'))) || (!is(f, 'trust', 'estate') && uses(f, 'self_assessment')),
    satisfied: (f) => has(f.client.utr) },
  { field: 'nino', label: 'National Insurance number', reason: 'Needed for the tax return',
    applies: (f) => is(f, 'individual', 'sole_trader') && (f.servicesUnknown || uses(f, 'self_assessment')),
    satisfied: (f) => has(f.client.nino) },

  // Partnerships and LLPs
  { field: 'partnership_utr', label: 'Partnership UTR', reason: 'Needed for the partnership return (SA800)',
    applies: (f) => is(f, 'partnership', 'limited_partnership', 'llp') && (f.servicesUnknown || uses(f, 'partnership_tax_return')),
    satisfied: (f) => has(f.client.partnership_utr) },
  { field: 'partners', label: 'Partners / members recorded', reason: 'Needed for the partnership return and AML',
    applies: (f) => is(f, 'partnership', 'limited_partnership', 'llp'), satisfied: (f) => f.partners > 0 },

  // Trusts and estates
  { field: 'trust_utr', label: 'Trust UTR', reason: 'Needed for the trust and estate return (SA900)',
    applies: (f) => is(f, 'trust', 'estate'), satisfied: (f) => has(f.client.utr) },
  { field: 'trustees', label: 'Trustees / personal representatives recorded', reason: 'Needed for the return and AML (trust registration)',
    applies: (f) => is(f, 'trust', 'estate'), satisfied: (f) => f.trustees > 0 },

  // Services
  { field: 'vat_no', label: 'VAT number', reason: 'Needed for VAT returns',
    applies: (f) => uses(f, 'vat_returns'), satisfied: (f) => has(f.client.vat_no) },
  { field: 'paye_ref', label: 'PAYE reference', reason: 'Needed for payroll submissions',
    applies: (f) => uses(f, 'payroll'), satisfied: (f) => has(f.client.paye_ref) || f.payrollSchemes > 0 }
]

/** Former clients and dissolved companies need nothing on file. */
export const isLive = (client: Record<string, unknown>): boolean =>
  client.status !== 'Former client' && client.company_status !== 'dissolved' && client.company_status !== 'Dissolved'

export function evaluate(f: ClientFacts): Array<{ field: string; label: string; reason: string; status: 'missing' | 'provided' }> {
  if (!isLive(f.client)) return []
  return REQUIREMENTS.filter((r) => r.applies(f)).map((r) => ({
    field: r.field, label: r.label, reason: r.reason, status: r.satisfied(f) ? 'provided' : 'missing'
  }))
}

// ── Reading the facts ───────────────────────────────────────────────────────

const tableExists = (db: Database, name: string): boolean =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
const count = (db: Database, sql: string, ref: string): number => (db.prepare(sql).get(ref) as { n: number }).n

export function loadFacts(db: Database, client: Record<string, unknown>): ClientFacts {
  const ref = String(client.ref)
  const services = tableExists(db, 'client_services')
    ? (db.prepare('SELECT service_type, active FROM client_services WHERE client_ref = ?').all(ref) as Array<{ service_type: string; active: number }>)
    : []
  const contacts = tableExists(db, 'client_contacts')
    ? (db.prepare('SELECT name, email, phone, contact_type FROM client_contacts WHERE client_ref = ?').all(ref) as Array<Record<string, unknown>>)
    : []
  return {
    category: (client.client_category as string | null) ?? null,
    client,
    services: new Set(services.filter((s) => s.active).map((s) => s.service_type)),
    servicesUnknown: services.length === 0,
    contactEmail: contacts.some((c) => has(c.email)),
    contactPhone: contacts.some((c) => has(c.phone)),
    contactName: contacts.some((c) => has(c.name)),
    directors: contacts.filter((c) => c.contact_type === 'director').length,
    amlComplete: tableExists(db, 'aml_records') && count(db, 'SELECT count(*) AS n FROM aml_records WHERE client_ref = ? AND cdd_completed = 1', ref) > 0,
    partners: tableExists(db, 'partnership_members') ? count(db, 'SELECT count(*) AS n FROM partnership_members WHERE client_ref = ? AND resigned_on IS NULL', ref) : 0,
    trustees: tableExists(db, 'trust_members') ? count(db, 'SELECT count(*) AS n FROM trust_members WHERE client_ref = ? AND resigned_on IS NULL', ref) : 0,
    payrollSchemes: tableExists(db, 'payroll_schemes') ? count(db, 'SELECT count(*) AS n FROM payroll_schemes WHERE client_ref = ?', ref) : 0
  }
}

// ── The scan ─────────────────────────────────────────────────────────────────

export interface ScanResult {
  success: boolean
  /** Requirements met (kept for the original reply shape). */
  created: number
  missing: number
  /** Stale "missing" rows removed because they no longer apply. */
  removed: number
}

/**
 * Brings a client's observations in line with what applies to them now.
 * A "provided" or "waived" mark made by hand is kept even if the field is
 * still empty; "missing" rows that no longer apply are removed.
 */
export function scanClient(db: Database, clientRef: string): ScanResult {
  const client = db.prepare('SELECT * FROM clients WHERE ref = ?').get(clientRef) as Record<string, unknown> | undefined
  if (!client) return { success: false, created: 0, missing: 0, removed: 0 }
  const items = evaluate(loadFacts(db, client))
  return db.transaction((): ScanResult => {
    const upsert = db.prepare(`
      INSERT INTO onboarding_observations (client_ref, field_name, label, status, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(client_ref, field_name) DO UPDATE SET
        label = excluded.label,
        status = CASE
          WHEN excluded.status = 'missing' AND onboarding_observations.status IN ('provided', 'waived') THEN onboarding_observations.status
          ELSE excluded.status
        END,
        updated_at = datetime('now')`)
    for (const i of items) upsert.run(clientRef, i.field, i.label, i.status)
    const keep = items.map((i) => i.field)
    const removed = db.prepare(`DELETE FROM onboarding_observations WHERE client_ref = ? AND status = 'missing'
        AND field_name NOT IN (${keep.map(() => '?').join(', ') || "''"})`).run(clientRef, ...keep).changes
    const missing = count(db, "SELECT count(*) AS n FROM onboarding_observations WHERE client_ref = ? AND status = 'missing'", clientRef)
    db.prepare('UPDATE clients SET onboarding_complete = ? WHERE ref = ?').run(missing === 0 ? 1 : 0, clientRef)
    return { success: true, created: items.filter((i) => i.status === 'provided').length, missing, removed }
  })()
}
