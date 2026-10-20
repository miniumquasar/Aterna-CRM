/**
 * Every reference number the practice keeps, in one typed list.
 *
 * The main process validates with these functions before anything is saved,
 * and the screens use the same functions for instant feedback, so the two can
 * never disagree. Pure TypeScript: no Node or browser APIs.
 *
 * Checks:
 *   strict   — the format is published (or has a checksum); a value that fails is refused.
 *   advisory — the format isn't published or varies; a value that looks unusual is
 *              saved with a warning rather than refused.
 *   none     — free text.
 *
 * Core client references (company number, UTRs, NINO, VAT, PAYE, Accounts
 * Office, authentication code, charity number, TPR letter code, personal codes)
 * stay where they already live — on the client record and in the registers
 * from migration 0007. This catalogue covers everything else.
 */

export type ReferenceScope = 'practice' | 'client'

export type ReferenceCategory =
  | 'agent'
  | 'companies_house'
  | 'regulation'
  | 'firm'
  | 'hmrc'
  | 'payroll_cis'
  | 'trade'
  | 'pensions'
  | 'charity'
  | 'penalties'
  | 'insolvency'
  | 'aml'
  | 'other'

export type ReferenceCheck = 'strict' | 'advisory' | 'none'

export interface ReferenceKind {
  key: string
  label: string
  scope: ReferenceScope
  category: ReferenceCategory
  issuer: string
  /** Plain-English shape, shown as a hint under the input. */
  format: string
  /** Made-up example in the right shape. Never a real number. */
  example?: string
  check: ReferenceCheck
  /** More than one allowed per client (or per practice). */
  repeatable: boolean
  /** Label for the context field when the reference only means something alongside it. */
  context?: string
  /** Which date the screen asks for. */
  dates?: 'renewal' | 'issued' | 'validity'
  /** Ask who issued it (e.g. the supervisory body). */
  askIssuer?: boolean
  note?: string
}

export const CATEGORY_LABELS: Record<ReferenceCategory, string> = {
  agent: 'HMRC agent identity',
  companies_house: 'Companies House',
  regulation: 'Regulation and insurance',
  firm: "Your firm's own tax references",
  hmrc: 'HMRC',
  payroll_cis: 'Payroll and CIS',
  trade: 'Customs and trade',
  pensions: 'Pensions',
  charity: 'Charities',
  penalties: 'Penalties and HMRC debt',
  insolvency: 'Insolvency and redundancy',
  aml: 'Identity checks',
  other: 'Other'
}

export const REFERENCE_KINDS: readonly ReferenceKind[] = [
  // ── Practice: HMRC agent identity ─────────────────────────────────────────
  {
    key: 'agent_sign_in_id', label: 'Agent services account sign-in ID', scope: 'practice', category: 'agent', issuer: 'HMRC',
    format: '12-digit Government Gateway user ID, or the email address you use with GOV.UK One Login',
    example: '112233445566', check: 'advisory', repeatable: true,
    note: 'The sign-in ID only. Passwords are never stored here; give each person their own user in the agent services account.'
  },
  {
    key: 'legacy_agent_sign_in_id', label: 'HMRC online services for agents sign-in ID', scope: 'practice', category: 'agent', issuer: 'HMRC',
    format: '12-digit Government Gateway user ID (the older account, separate from the agent services account)',
    example: '665544332211', check: 'advisory', repeatable: true
  },
  {
    key: 'agent_reference_number', label: 'Agent reference number (ARN)', scope: 'practice', category: 'agent', issuer: 'HMRC',
    format: 'Four letters then seven digits, shown on the agent services account home page', example: 'XARN1234567',
    check: 'strict', repeatable: false
  },
  {
    key: 'sa_agent_code', label: 'Self Assessment agent code', scope: 'practice', category: 'agent', issuer: 'HMRC',
    format: 'Usually 6 letters and digits', example: 'A1234B', check: 'advisory', repeatable: false
  },
  {
    key: 'ct_agent_code', label: 'Corporation Tax agent code', scope: 'practice', category: 'agent', issuer: 'HMRC',
    format: 'Usually 6 letters and digits', example: 'C5678D', check: 'advisory', repeatable: false
  },
  {
    key: 'paye_agent_code', label: 'PAYE agent code', scope: 'practice', category: 'agent', issuer: 'HMRC',
    format: 'Usually 6 letters and digits', example: 'P9012Q', check: 'advisory', repeatable: false
  },
  {
    key: 'vat_agent_reference', label: 'VAT agent reference number', scope: 'practice', category: 'agent', issuer: 'HMRC',
    format: 'Issued only to agents that are not VAT registered', check: 'advisory', repeatable: false,
    note: 'A VAT-registered firm enrols with its own VAT number instead. VAT client authorisation itself is done in the agent services account.'
  },
  {
    key: 'charities_agent_reference', label: 'Charities agent reference', scope: 'practice', category: 'agent', issuer: 'HMRC',
    format: 'As issued by HMRC Charities', check: 'none', repeatable: false
  },
  {
    key: 'other_agent_reference', label: 'Other HMRC agent reference', scope: 'practice', category: 'agent', issuer: 'HMRC',
    format: 'For example Machine Games Duty', check: 'none', repeatable: true, context: 'Which service'
  },

  // ── Practice: Companies House ─────────────────────────────────────────────
  {
    key: 'acsp_number', label: 'Companies House authorised agent (ACSP) number', scope: 'practice', category: 'companies_house',
    issuer: 'Companies House', format: 'As shown in your authorised agent account', check: 'none', repeatable: false, dates: 'issued',
    note: 'Needed now to verify identities for clients; Companies House says filing for clients will need it from no earlier than November 2027.'
  },
  {
    key: 'ch_presenter_id', label: 'Companies House presenter ID', scope: 'practice', category: 'companies_house', issuer: 'Companies House',
    format: 'Used by filing software. Keep the presenter authentication code in the vault, not here.', check: 'none', repeatable: true
  },

  // ── Practice: regulation and insurance ────────────────────────────────────
  {
    key: 'aml_supervision_number', label: 'AML supervision number', scope: 'practice', category: 'regulation',
    issuer: 'Supervisory body', format: 'HMRC: XAML followed by 11 digits. Professional bodies use their own numbers.',
    example: 'XAML00000123456', check: 'advisory', repeatable: false, askIssuer: true, dates: 'renewal'
  },
  {
    key: 'professional_membership', label: 'Professional body membership or firm number', scope: 'practice', category: 'regulation',
    issuer: 'Professional body', format: 'As issued by your body', check: 'none', repeatable: true, askIssuer: true,
    context: 'Whose membership'
  },
  {
    key: 'practising_certificate', label: 'Practising certificate', scope: 'practice', category: 'regulation', issuer: 'Professional body',
    format: 'As issued by your body', check: 'none', repeatable: true, askIssuer: true, context: 'Holder', dates: 'renewal'
  },
  {
    key: 'ico_registration', label: 'ICO registration number', scope: 'practice', category: 'regulation',
    issuer: 'Information Commissioner’s Office', format: '8 characters starting with Z, such as Z1234567 or ZA123456',
    example: 'ZA123456', check: 'strict', repeatable: false, dates: 'renewal'
  },
  {
    key: 'pii_policy', label: 'Professional indemnity insurance policy', scope: 'practice', category: 'regulation', issuer: 'Insurer',
    format: 'Policy number from your schedule', check: 'none', repeatable: false, askIssuer: true, dates: 'renewal'
  },

  // ── Practice: the firm's own references ───────────────────────────────────
  { key: 'firm_company_number', label: 'Company number', scope: 'practice', category: 'firm', issuer: 'Companies House', format: '8 characters', example: '01234567', check: 'strict', repeatable: false },
  {
    key: 'firm_vat_number', label: 'VAT number', scope: 'practice', category: 'firm', issuer: 'HMRC', format: '9 digits, GB prefix optional',
    example: 'GB 123 4567 82', check: 'strict', repeatable: false, note: 'Printed on your invoices.'
  },
  { key: 'firm_ct_utr', label: 'Corporation Tax UTR', scope: 'practice', category: 'firm', issuer: 'HMRC', format: '10 digits', example: '1234567802', check: 'strict', repeatable: false },
  { key: 'firm_paye_reference', label: 'Employer PAYE reference', scope: 'practice', category: 'firm', issuer: 'HMRC', format: '3-digit office number / reference', example: '123/AB45678', check: 'strict', repeatable: false },
  { key: 'firm_accounts_office_reference', label: 'Accounts Office reference', scope: 'practice', category: 'firm', issuer: 'HMRC', format: '13 characters', example: '123PA00123456', check: 'strict', repeatable: false },

  // ── Client: Companies House (beyond the company number on the client record) ──
  { key: 'overseas_entity_id', label: 'Overseas entity ID', scope: 'client', category: 'companies_house', issuer: 'Companies House', format: 'OE followed by 6 digits', example: 'OE001234', check: 'strict', repeatable: false },
  { key: 'uk_establishment_number', label: 'UK establishment number', scope: 'client', category: 'companies_house', issuer: 'Companies House', format: 'BR followed by 6 digits', example: 'BR001234', check: 'strict', repeatable: true },

  // ── Client: HMRC ──────────────────────────────────────────────────────────
  {
    key: 'trs_reference', label: 'Trust Registration Service reference', scope: 'client', category: 'hmrc', issuer: 'HMRC',
    format: 'Unique reference number from the Trust Registration Service', check: 'advisory', repeatable: false,
    note: 'Trusts that have a UTR keep it on the client record; this is the TRS registration itself.'
  },
  {
    key: 'cgt_property_account', label: 'CGT on UK property account reference', scope: 'client', category: 'hmrc', issuer: 'HMRC',
    format: 'From the client’s Capital Gains Tax on UK property account (60-day returns)', check: 'advisory', repeatable: false
  },
  {
    key: 'sdlt_utrn', label: 'SDLT transaction reference (UTRN)', scope: 'client', category: 'hmrc', issuer: 'HMRC',
    format: 'One per purchase, from the SDLT return', check: 'advisory', repeatable: true, context: 'Property and completion date', dates: 'issued'
  },
  { key: 'ated_reference', label: 'ATED reference', scope: 'client', category: 'hmrc', issuer: 'HMRC', format: 'From the ATED registration', check: 'advisory', repeatable: false },
  { key: 'nrl_reference', label: 'Non-resident landlord approval reference', scope: 'client', category: 'hmrc', issuer: 'HMRC', format: 'From HMRC’s approval letter', check: 'advisory', repeatable: false },
  { key: 'child_benefit_reference', label: 'Child Benefit reference', scope: 'client', category: 'hmrc', issuer: 'HMRC', format: 'From Child Benefit letters (High Income Child Benefit Charge work)', check: 'none', repeatable: false },
  {
    key: 'ct_payment_reference', label: 'Corporation Tax payment reference', scope: 'client', category: 'hmrc', issuer: 'HMRC',
    format: '17 characters: the 10-digit UTR, A, then the accounting period code', example: '1234567802A00108A',
    check: 'advisory', repeatable: true, context: 'Accounting period end'
  },

  // ── Client: payroll and CIS ───────────────────────────────────────────────
  {
    key: 'cis_contractor_reference', label: 'CIS contractor reference', scope: 'client', category: 'payroll_cis', issuer: 'HMRC',
    format: 'Usually the employer PAYE reference', example: '123/AB45678', check: 'strict', repeatable: false
  },
  {
    key: 'cis_verification_number', label: 'CIS verification number', scope: 'client', category: 'payroll_cis', issuer: 'HMRC',
    format: 'V followed by 10 digits, with one or two letters at the end for the higher deduction rate', example: 'V0001234567',
    check: 'strict', repeatable: true, context: 'Contractor or subcontractor', dates: 'issued'
  },

  // ── Client: customs and trade ─────────────────────────────────────────────
  { key: 'eori_gb', label: 'EORI number (GB)', scope: 'client', category: 'trade', issuer: 'HMRC', format: 'GB followed by 12 digits', example: 'GB123456782000', check: 'strict', repeatable: false },
  { key: 'eori_xi', label: 'EORI number (XI, Northern Ireland)', scope: 'client', category: 'trade', issuer: 'HMRC', format: 'XI followed by 12 digits', example: 'XI123456782000', check: 'strict', repeatable: false },
  { key: 'duty_deferment_account', label: 'Duty deferment account number', scope: 'client', category: 'trade', issuer: 'HMRC', format: '7 digits', example: '1234567', check: 'strict', repeatable: false },

  // ── Client: pensions ──────────────────────────────────────────────────────
  {
    key: 'pension_employer_reference', label: 'Pension provider employer reference', scope: 'client', category: 'pensions',
    issuer: 'Pension provider', format: 'As shown in the provider’s employer portal', check: 'none', repeatable: true, askIssuer: true
  },
  { key: 'pension_scheme_registry', label: 'Pension Scheme Registry number', scope: 'client', category: 'pensions', issuer: 'The Pensions Regulator', format: '8 digits', example: '12345678', check: 'strict', repeatable: true },
  { key: 'pension_scheme_tax_reference', label: 'Pension scheme tax reference (PSTR)', scope: 'client', category: 'pensions', issuer: 'HMRC', format: '8 digits then 2 letters', example: '00123456RA', check: 'strict', repeatable: true },

  // ── Client: charities ─────────────────────────────────────────────────────
  {
    key: 'charity_number_scotland', label: 'Scottish charity number (OSCR)', scope: 'client', category: 'charity', issuer: 'OSCR',
    format: 'SC0 followed by 5 digits', example: 'SC012345', check: 'strict', repeatable: false
  },
  {
    key: 'charity_number_ni', label: 'Northern Ireland charity number', scope: 'client', category: 'charity', issuer: 'Charity Commission for Northern Ireland',
    format: 'NIC followed by 6 digits', example: 'NIC100002', check: 'advisory', repeatable: false
  },
  { key: 'hmrc_charity_reference', label: 'HMRC charity reference (Gift Aid)', scope: 'client', category: 'charity', issuer: 'HMRC', format: 'From HMRC Charities', check: 'advisory', repeatable: false },

  // ── Client: penalties and HMRC debt ───────────────────────────────────────
  {
    key: 'penalty_payment_reference', label: 'Penalty payment reference', scope: 'client', category: 'penalties', issuer: 'HMRC',
    format: '14 characters starting with X', example: 'X1234567890123', check: 'strict', repeatable: true,
    context: 'What the penalty is for', dates: 'issued'
  },
  {
    key: 'hmrc_charge_reference', label: 'HMRC charge or debt reference', scope: 'client', category: 'penalties', issuer: 'HMRC',
    format: 'As printed on the notice to pay', check: 'none', repeatable: true, context: 'Notice and amount', dates: 'issued'
  },
  {
    key: 'penalty_notice', label: 'Penalty point or warning letter', scope: 'client', category: 'penalties', issuer: 'HMRC',
    format: 'For example LSP1, LPP1, or a civil penalty warning letter reason code', check: 'none', repeatable: true,
    context: 'Return or period it relates to', dates: 'issued'
  },

  // ── Client: insolvency and redundancy ─────────────────────────────────────
  {
    key: 'insolvency_case_reference', label: 'Insolvency Service case reference', scope: 'client', category: 'insolvency', issuer: 'Insolvency Service',
    format: 'Usually LQD or BKT followed by 7 or 8 digits', example: 'LQD1234567', check: 'advisory', repeatable: true, dates: 'issued'
  },
  {
    key: 'insolvency_vat_reference', label: 'Insolvency VAT case reference', scope: 'client', category: 'insolvency', issuer: 'HMRC',
    format: 'Usually 10 digits then CVA, ADM or LIQ', example: '8801234567LIQ', check: 'advisory', repeatable: true
  },
  {
    key: 'insolvency_dividend_reference', label: 'Insolvency dividend reference', scope: 'client', category: 'insolvency', issuer: 'Insolvency Service',
    format: 'Usually 623, 075 or 880 followed by 7 digits', check: 'advisory', repeatable: true
  },
  {
    key: 'redundancy_case_number', label: 'Redundancy Payments case number (RP1)', scope: 'client', category: 'insolvency', issuer: 'Redundancy Payments Service',
    format: 'CN followed by 8 digits', example: 'CN12345678', check: 'advisory', repeatable: true, context: 'Employee'
  },
  {
    key: 'notice_pay_reference', label: 'Loss of notice pay reference (RP2)', scope: 'client', category: 'insolvency', issuer: 'Redundancy Payments Service',
    format: 'LN followed by 8 digits', example: 'LN12345678', check: 'advisory', repeatable: true, context: 'Employee'
  },

  // ── Client: identity checks (the evidence itself stays in AML records) ────
  {
    key: 'id_check_reference', label: 'Electronic ID check reference', scope: 'client', category: 'aml', issuer: 'ID check provider',
    format: 'The provider’s check or report ID', check: 'none', repeatable: true, askIssuer: true, context: 'Person checked', dates: 'validity'
  },

  // ── Anything else ─────────────────────────────────────────────────────────
  { key: 'other_reference', label: 'Other reference', scope: 'client', category: 'other', issuer: 'Other', format: 'Say what it is in the context field', check: 'none', repeatable: true, context: 'What it is' }
] as const

const KINDS_BY_KEY = new Map(REFERENCE_KINDS.map((k) => [k.key, k]))

export const referenceKind = (key: string): ReferenceKind | undefined => KINDS_BY_KEY.get(key)

export const kindsFor = (scope: ReferenceScope): ReferenceKind[] => REFERENCE_KINDS.filter((k) => k.scope === scope)

// ── Validation ──────────────────────────────────────────────────────────────

export type ReferenceCheckResult = { ok: true; value: string; warning?: string } | { ok: false; error: string }

const compact = (raw: string): string => raw.replace(/[\s-]+/g, '').toUpperCase()

/** HMRC UTR: 10 digits; the first digit is a check digit over the other nine. */
export function utrChecksumOk(utr: string): boolean {
  if (!/^\d{10}$/.test(utr)) return false
  const weights = [6, 7, 8, 9, 10, 5, 4, 3, 2]
  const sum = weights.reduce((acc, w, i) => acc + w * Number(utr[i + 1]), 0)
  return [2, 1, 9, 8, 7, 6, 5, 4, 3, 2, 1][sum % 11] === Number(utr[0])
}

/** UK VAT number: 9 digits, mod-97 check in either the old or the post-2010 range. */
export function vatChecksumOk(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false
  const total = [8, 7, 6, 5, 4, 3, 2].reduce((acc, w, i) => acc + w * Number(digits[i]), 0) + Number(digits.slice(7))
  return total % 97 === 0 || (total + 55) % 97 === 0
}

const NINO = /^(?!BG|GB|KN|NK|NT|TN|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]$/

/** Two-letter Companies House prefixes seen on the register (England and Wales numbers are 8 digits). */
const CRN_PREFIXES = new Set([
  'SC', 'NI', 'OC', 'SO', 'NC', 'LP', 'SL', 'NL', 'R0', 'RC', 'SE', 'SR', 'ES', 'FC', 'SF', 'NF', 'GE', 'GS', 'GN',
  'IP', 'SP', 'NP', 'IC', 'SI', 'NA', 'NZ', 'RS', 'CE', 'CS', 'OE', 'BR', 'NR', 'SG', 'NO', 'AC', 'SA', 'SZ', 'ZC',
  'FE', 'FS', 'ZS', 'PC', 'NV', 'RO', 'IS', 'NE'
])

export function checkCompanyNumber(raw: string): ReferenceCheckResult {
  const v = compact(raw)
  if (/^\d{1,8}$/.test(v)) return { ok: true, value: v.padStart(8, '0') }
  const m = /^([A-Z][A-Z0-9])(\d{1,6})$/.exec(v)
  if (!m) return { ok: false, error: 'A company number is 8 digits, or 2 letters and 6 digits (for example SC123456 or OC123456).' }
  const value = m[1] + m[2].padStart(6, '0')
  return CRN_PREFIXES.has(m[1]) ? { ok: true, value } : { ok: true, value, warning: `${m[1]} isn’t a prefix this app recognises. Check it on the Companies House register.` }
}

export function checkUtr(raw: string): ReferenceCheckResult {
  const v = compact(raw).replace(/K$/, '')
  if (!/^\d{10}$/.test(v)) return { ok: false, error: 'A UTR is 10 digits.' }
  if (!utrChecksumOk(v)) return { ok: false, error: 'Those 10 digits don’t pass the UTR check. Look for a mistyped digit.' }
  return { ok: true, value: v }
}

export function checkVatNumber(raw: string): ReferenceCheckResult {
  const v = compact(raw).replace(/^GB/, '')
  if (!/^\d{9}$/.test(v)) return { ok: false, error: 'A UK VAT number is 9 digits (the GB prefix is optional).' }
  if (!vatChecksumOk(v)) return { ok: false, error: 'Those 9 digits don’t pass the VAT number check. Look for a mistyped digit.' }
  return { ok: true, value: v }
}

export function checkPayeReference(raw: string): ReferenceCheckResult {
  const v = raw.replace(/\s+/g, '').toUpperCase()
  const m = /^(\d{3})\/?([A-Z0-9]{1,10})$/.exec(v)
  return m ? { ok: true, value: `${m[1]}/${m[2]}` } : { ok: false, error: 'An employer PAYE reference is a 3-digit office number, a slash, then letters and digits (for example 123/AB45678).' }
}

export function checkAccountsOfficeReference(raw: string): ReferenceCheckResult {
  const v = compact(raw)
  return /^\d{3}P[A-Z]\d{7}[\dX]$/.test(v)
    ? { ok: true, value: v }
    : { ok: false, error: 'An Accounts Office reference is 13 characters: 3 digits, P, a letter, then 8 digits (the last can be X).' }
}

export function checkNino(raw: string): ReferenceCheckResult {
  const v = compact(raw)
  return NINO.test(v) ? { ok: true, value: v } : { ok: false, error: 'A National Insurance number is 2 letters, 6 digits and a letter A to D (for example QQ 12 34 56 A).' }
}

const advisory = (value: string, pattern: RegExp, shape: string): ReferenceCheckResult =>
  pattern.test(value) ? { ok: true, value } : { ok: true, value, warning: `Saved, but it doesn’t look like the usual shape (${shape}). Worth a second look.` }

const strict = (value: string, pattern: RegExp, error: string): ReferenceCheckResult =>
  pattern.test(value) ? { ok: true, value } : { ok: false, error }

const MAX_LENGTH = 200

/** Checks and tidies a value for a reference kind. Unknown kinds are refused. */
export function validateReference(kindKey: string, raw: string): ReferenceCheckResult {
  const kind = referenceKind(kindKey)
  if (!kind) return { ok: false, error: `Unknown reference type “${kindKey}”.` }
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { ok: false, error: 'Enter the reference.' }
  if (trimmed.length > MAX_LENGTH) return { ok: false, error: `That’s longer than ${MAX_LENGTH} characters.` }
  const v = compact(trimmed)

  switch (kind.key) {
    case 'agent_sign_in_id':
    case 'legacy_agent_sign_in_id':
      if (/^\d{12}$/.test(v)) return { ok: true, value: v }
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { ok: true, value: trimmed.toLowerCase() }
      return { ok: true, value: trimmed, warning: 'Saved, but it’s neither a 12-digit Gateway ID nor an email address.' }
    case 'agent_reference_number':
      return strict(v, /^[A-Z]{4}\d{7}$/, 'An agent reference number is four letters then seven digits (for example XARN1234567).')
    case 'sa_agent_code':
    case 'ct_agent_code':
    case 'paye_agent_code':
      return advisory(v, /^[A-Z0-9]{6}$/, '6 letters and digits')
    case 'vat_agent_reference':
      return advisory(v, /^[A-Z0-9]{5,15}$/, 'letters and digits')
    case 'aml_supervision_number':
      if (v.startsWith('XAML')) return strict(v, /^XAML\d{11}$/, 'An HMRC AML registration number is XAML followed by 11 digits.')
      return { ok: true, value: trimmed }
    case 'ico_registration':
      return strict(v, /^Z[A-Z0-9]\d{6}$/, 'An ICO registration number is 8 characters starting with Z (for example Z1234567 or ZA123456).')
    case 'firm_company_number':
      return checkCompanyNumber(trimmed)
    case 'firm_vat_number':
      return checkVatNumber(trimmed)
    case 'firm_ct_utr':
      return checkUtr(trimmed)
    case 'firm_paye_reference':
    case 'cis_contractor_reference':
      return checkPayeReference(trimmed)
    case 'firm_accounts_office_reference':
      return checkAccountsOfficeReference(trimmed)
    case 'overseas_entity_id':
      return strict(v, /^OE\d{6}$/, 'An overseas entity ID is OE followed by 6 digits.')
    case 'uk_establishment_number':
      return strict(v, /^BR\d{6}$/, 'A UK establishment number is BR followed by 6 digits.')
    case 'trs_reference':
      return advisory(v, /^[A-Z0-9]{10,20}$/, 'letters and digits, usually starting with X')
    case 'cgt_property_account':
    case 'ated_reference':
    case 'nrl_reference':
    case 'hmrc_charity_reference':
      return advisory(v, /^[A-Z0-9]{5,20}$/, 'letters and digits')
    case 'sdlt_utrn':
      return advisory(v, /^[A-Z0-9]{9,14}$/, 'about 11 letters and digits')
    case 'ct_payment_reference': {
      const shaped = /^\d{10}A\d{5}[A-Z0-9]$/.test(v)
      if (shaped && !utrChecksumOk(v.slice(0, 10))) return { ok: false, error: 'The first 10 digits should be the company’s UTR, and they don’t pass the UTR check.' }
      return advisory(v, /^\d{10}A\d{5}[A-Z0-9]$/, 'UTR, A, then the period code — 17 characters')
    }
    case 'cis_verification_number':
      return strict(v.replace(/\//g, ''), /^V\d{10}[A-Z]{0,2}$/, 'A CIS verification number is V followed by 10 digits, sometimes with one or two letters at the end.')
    case 'eori_gb':
      return strict(v, /^GB\d{12}(\d{3})?$/, 'A GB EORI number is GB followed by 12 digits.')
    case 'eori_xi':
      return strict(v, /^XI\d{12}(\d{3})?$/, 'A Northern Ireland EORI number is XI followed by 12 digits.')
    case 'duty_deferment_account':
      return strict(v, /^\d{7}$/, 'A duty deferment account number is 7 digits.')
    case 'pension_scheme_registry':
      return strict(v, /^\d{8}$/, 'A Pension Scheme Registry number is 8 digits.')
    case 'pension_scheme_tax_reference':
      return strict(v, /^\d{8}[A-Z]{2}$/, 'A pension scheme tax reference is 8 digits then 2 letters.')
    case 'charity_number_scotland':
      return strict(v, /^SC0\d{5}$/, 'A Scottish charity number is SC0 followed by 5 digits.')
    case 'charity_number_ni':
      return advisory(v, /^NIC\d{6}$/, 'NIC followed by 6 digits')
    case 'penalty_payment_reference':
      return strict(v, /^X[A-Z0-9]{13}$/, 'A penalty payment reference is 14 characters starting with X.')
    case 'insolvency_case_reference':
      return advisory(v, /^(LQD|BKT)\d{7,8}$/, 'LQD or BKT followed by 7 or 8 digits')
    case 'insolvency_vat_reference':
      return advisory(v, /^\d{10}(CVA|ADM|LIQ)$/, '10 digits then CVA, ADM or LIQ')
    case 'insolvency_dividend_reference':
      return advisory(v, /^(623|075|880)\d{7}$/, '623, 075 or 880 followed by 7 digits')
    case 'redundancy_case_number':
      return advisory(v, /^CN\d{8}$/, 'CN followed by 8 digits')
    case 'notice_pay_reference':
      return advisory(v, /^LN\d{8}$/, 'LN followed by 8 digits')
    default:
      // check: 'none' — free text, kept as typed
      return { ok: true, value: trimmed }
  }
}

// ── Derived references (worked out, never stored) ───────────────────────────

/** Self Assessment payments of every kind (balancing payments, payments on account, penalties) use the UTR followed by K. */
export function selfAssessmentPaymentReference(utr: string | null | undefined): string | null {
  if (!utr) return null
  const checked = checkUtr(utr)
  return checked.ok ? `${checked.value}K` : null
}

// ── Sign-in details that are never stored ───────────────────────────────────

const GOV_SIGN_IN = [
  /\bhmrc\b/i,
  /government\s*gateway/i,
  /\bgov\.?\s*uk\b/i,
  /one\s*login/i,
  /\b(personal|business)\s+tax\s+account\b/i,
  /agent\s+services?\s+account/i,
  /online\s+services?\s+for\s+agents/i
]

/**
 * True when a platform name refers to HMRC or GOV.UK sign-in. The vault refuses
 * these: HMRC's Standard for Agents says agents must never ask clients for
 * their sign-in details, and HMRC's May 2026 policy on accessing its web
 * services covers software that collects them.
 */
export const isGovernmentSignIn = (platform: string): boolean => GOV_SIGN_IN.some((re) => re.test(platform))

export const GOVERNMENT_SIGN_IN_REFUSAL =
  'HMRC and GOV.UK sign-in details can’t be stored. HMRC’s Standard for Agents says agents must never ask clients to share them, and the same applies to sharing your own agent sign-in among staff — give each person their own user in the agent services account. Record the client’s authorisation under Agent authorisations instead.'

export interface NotStoredItem {
  item: string
  reason: string
}

/** Shown on both screens so nobody has to wonder where these went. */
export const NOT_STORED: readonly NotStoredItem[] = [
  { item: 'Client HMRC sign-in details (Government Gateway or GOV.UK One Login)', reason: 'Agents must never ask clients for them. Authorisations are tracked per client instead.' },
  { item: 'Government Gateway recovery words and 2-step backup codes', reason: 'These are sign-in details too, and they unlock the account outright.' },
  { item: 'Your agent Government Gateway or One Login password', reason: 'Not shared among staff: each person gets their own user in the agent services account. The sign-in ID is kept on the Practice details screen.' },
  { item: 'HMRC postal authorisation codes', reason: 'Single-use and short-lived. The date posted and the expiry are tracked; the code goes straight into HMRC online services.' },
  { item: 'Self Assessment payment reference', reason: 'Always the UTR followed by K, so it is worked out from the UTR rather than stored.' },
  { item: 'Tax Credits joint claims', reason: 'Tax Credits closed in April 2025. Joint claims and Marriage Allowance are links between two clients: use client relationships.' }
]

// ── Agent authorisations ────────────────────────────────────────────────────

export const AUTHORISATION_STATUSES = ['not_requested', 'requested', 'code_posted', 'active', 'expired', 'removed'] as const
export type AuthorisationStatusKey = (typeof AUTHORISATION_STATUSES)[number]

export const AUTHORISATION_STATUS_LABELS: Record<AuthorisationStatusKey, string> = {
  not_requested: 'Not requested',
  requested: 'Requested — waiting for the client',
  code_posted: 'Code posted to the client',
  active: 'Authorised',
  expired: 'Expired',
  removed: 'Removed'
}

export const AUTHORISATION_METHODS = {
  asa_request: 'Agent services account request',
  online_code: 'Online authorisation (code posted to the client)',
  form_64_8: 'Paper 64-8',
  auth_code: 'Authentication code held',
  other: 'Other'
} as const
export type AuthorisationMethodKey = keyof typeof AUTHORISATION_METHODS

export interface AuthorisationService {
  key: string
  label: string
  methods: readonly AuthorisationMethodKey[]
  /** Client categories this normally applies to; empty = any. */
  appliesTo: readonly string[]
}

export const AUTHORISATION_SERVICES: readonly AuthorisationService[] = [
  { key: 'self_assessment', label: 'Self Assessment', methods: ['asa_request', 'online_code', 'form_64_8'], appliesTo: ['individual', 'sole_trader', 'partnership', 'trust', 'estate'] },
  { key: 'mtd_income_tax_main', label: 'Making Tax Digital for Income Tax — main agent', methods: ['asa_request'], appliesTo: ['individual', 'sole_trader'] },
  { key: 'mtd_income_tax_supporting', label: 'Making Tax Digital for Income Tax — supporting agent', methods: ['asa_request'], appliesTo: ['individual', 'sole_trader'] },
  { key: 'corporation_tax', label: 'Corporation Tax', methods: ['online_code', 'form_64_8', 'asa_request'], appliesTo: ['company'] },
  { key: 'vat', label: 'VAT', methods: ['asa_request'], appliesTo: [] },
  { key: 'paye', label: 'PAYE for employers', methods: ['online_code', 'form_64_8', 'asa_request'], appliesTo: [] },
  { key: 'cis', label: 'Construction Industry Scheme', methods: ['online_code', 'form_64_8', 'asa_request'], appliesTo: [] },
  { key: 'trusts', label: 'Trusts (Trust Registration Service)', methods: ['asa_request'], appliesTo: ['trust'] },
  { key: 'cgt_uk_property', label: 'Capital Gains Tax on UK property', methods: ['asa_request'], appliesTo: ['individual', 'sole_trader', 'trust', 'estate'] },
  { key: 'companies_house', label: 'Companies House filing', methods: ['auth_code', 'other'], appliesTo: ['company', 'llp', 'limited_partnership'] },
  { key: 'other', label: 'Other', methods: ['asa_request', 'online_code', 'form_64_8', 'other'], appliesTo: [] }
]

export const authorisationService = (key: string): AuthorisationService | undefined => AUTHORISATION_SERVICES.find((s) => s.key === key)

/** Typical validity, used only to suggest an expiry date the user can change. */
export const SUGGESTED_EXPIRY_DAYS: Partial<Record<AuthorisationStatusKey, number>> = { code_posted: 30, requested: 21 }

/** A request or posted code past its expiry date still waiting on the client. */
export const authorisationOverdue = (status: string, expiresOn: string | null, today: string): boolean =>
  (status === 'requested' || status === 'code_posted') && expiresOn !== null && expiresOn < today
