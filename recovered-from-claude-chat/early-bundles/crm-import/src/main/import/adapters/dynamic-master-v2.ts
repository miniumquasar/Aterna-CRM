/**
 * Adapter: Dynamic Accountants master client database (v2 workbook).
 *
 * Reads every data sheet, normalises and validates values, and emits the
 * canonical bundle. It never writes. Calculated columns are identified from
 * the workbook's own Data_Dictionary and skipped — the CRM recomputes them.
 * Any column that is neither mapped nor calculated is reported, so a future
 * workbook version cannot silently lose data.
 */

import type ExcelJS from 'exceljs'
import type { ServiceType } from '@shared/types'
import type {
  AdapterContext,
  CanonicalBundle,
  CanonicalClient,
  CanonicalContact,
  CanonicalIssue,
  CanonicalPayrollScheme,
  CanonicalPeriod,
  ImportAdapter,
  SourceFile,
  SourceRef
} from '../core/canonical'
import {
  accountsOfficeRef, crn, email, int, isoDate, letterCode, nameKey, nino, payeRef, personalCode, phoneUk, text, utr,
  vatNumber, yesNo, type CellValue
} from '../core/normalise'
import { addDays, addMonths, aeRedeclaration, daysBetween, iso, taxYearEnd, taxYearEndYear, type IsoDate } from '../core/rules'
import { readSheet, readWorkbook, type SheetData, type SheetRecord } from '../core/xlsx'
import * as V from './dynamic-master-v2.vocab'

/** Columns read or deliberately ignored per sheet (calculated ones come from Data_Dictionary). */
const HANDLED: Record<string, string[]> = {
  Clients: ['CLIENT_ID', 'REF_CODE', 'CLIENT_NAME', 'CLIENT_TYPE', 'CRN', 'INCORPORATION_DATE', 'YEAR_END',
    'COMPANY_STATUS', 'CLIENT_STATUS', ...V.SERVICE_COLUMNS.map(([c]) => c), 'ALSO_KNOWN_AS', 'POSSIBLE_DUPLICATE_OF',
    'SOURCE_SYSTEMS', 'HISTORIC_MODULES', 'NOTES', 'LAST_UPDATED'],
  Contacts: ['CONTACT_ID', 'CLIENT_ID', 'CONTACT_TYPE', 'TITLE', 'CONTACT_NAME', 'ROLE', 'PHONE', 'EMAIL', 'IS_PRIMARY', 'SOURCE', 'NOTES'],
  Confirmation_Statement: ['CS_ID', 'CLIENT_ID', 'LAST_STATEMENT_DATE', 'NEXT_STATEMENT_DUE', 'LAST_FILED_DATE',
    'FILING_STATUS', 'PERSONAL_CODE', 'DIRECTOR_NAME', 'SOURCE', 'NOTES'],
  Accounts: ['AC_ID', 'CLIENT_ID', 'YEAR_END', 'LAST_ACCOUNTS_MADE_UP_TO', 'NEXT_ACCOUNTS_DUE', 'FILED_DATE', 'STATUS', 'SOURCE', 'NOTES'],
  Corporation_Tax: ['CT_ID', 'CLIENT_ID', 'CT_UTR', 'PERIOD_END', 'FILED_DATE', 'STATUS', 'SOURCE', 'NOTES'],
  VAT: ['VAT_ID', 'CLIENT_ID', 'VAT_REG_NO', 'SCHEME', 'STAGGER', 'MTD_SIGNED_UP', 'PERIOD_END', 'DUE_DATE', 'SUBMITTED_DATE', 'SOURCE', 'NOTES'],
  Payroll_PAYE: ['PAY_ID', 'CLIENT_ID', 'TAX_YEAR', 'PAYE_REFERENCE', 'ACCOUNTS_OFFICE_REF', 'EMPLOYEES', 'CIS_SUBCONTRACTORS',
    'PAYROLL_EMAIL', 'PAYROLL_FILE', 'PAY_FREQUENCY', 'RTI_STATUS', 'SOURCE', 'NOTES'],
  Pension_AE: ['PEN_ID', 'CLIENT_ID', 'LETTER_CODE', 'DUTIES_START_DATE', 'PROVIDER', 'DECLARATION_DATE', 'DECLARATION_STATUS',
    'LAST_PAYMENT_MADE', 'SOURCE', 'NOTES'],
  Self_Assessment: ['SA_ID', 'CLIENT_ID', 'UTR', 'NINO', 'SA_CLIENT_TYPE', 'BUSINESS_DESCRIPTION', 'FILING_ROUTE',
    'FIRST_YEAR_ON_FILE', 'LAST_YEAR_ON_FILE', 'REGISTER_STATUS', 'RELATED_CLIENT', 'RELATION_BASIS', 'ALSO_KNOWN_AS', 'SOURCE', 'NOTES'],
  SA_Returns: ['RETURN_ID', 'CLIENT_ID', 'TAX_YEAR', 'FILING_DEADLINE', 'ACCOUNTS_PREPARED', 'SUBMISSION_STATUS', 'SUBMITTED_DATE',
    'FILING_ROUTE', 'SOURCE_STATUS_TEXT', 'REMARK', 'SOURCE_FILE', 'CONFLICT_NOTE'],
  Credentials: ['CRED_ID', 'CLIENT_ID', 'SYSTEM', 'USER_ID', 'PASSWORD', 'AUTH_CODE', 'LAST_VERIFIED', 'SOURCE', 'NOTES'],
  Deadline_Calendar: ['DEADLINE_ID', 'CLIENT_ID', 'OBLIGATION', 'PERIOD', 'DUE_DATE', 'ASSIGNED_TO', 'COMPLETED_DATE', 'SOURCE', 'NOTES'],
  Data_Issues: ['ISSUE_ID', 'SEVERITY', 'TABLE_NAME', 'CLIENT_ID', 'CLIENT_NAME', 'FIELD', 'ISSUE_DESCRIPTION', 'SOURCE_FILE',
    'SUGGESTED_ACTION', 'STATUS', 'RESOLVED_DATE', 'RESOLVED_BY'],
  Email_Directory: ['EMAIL_ID', 'EMAIL_ADDRESS', 'NAME_ON_RECORD', 'MATCH_STATUS', 'CLIENT_ID', 'MATCHED_TO', 'ALREADY_IN_MASTER',
    'ACTION', 'SOURCE', 'NOTES']
}

const REQUIRED_SHEETS = ['Clients', 'Contacts', 'Deadline_Calendar', 'Data_Dictionary', 'Self_Assessment']

let cache: { sha: string; wb: ExcelJS.Workbook } | null = null
async function load(file: SourceFile): Promise<ExcelJS.Workbook> {
  if (cache?.sha === file.sha256) return cache.wb
  const wb = await readWorkbook(file.path)
  cache = { sha: file.sha256, wb }
  return wb
}

const lc = (v: CellValue): string => text(v)?.toLowerCase() ?? ''
const splitList = (v: CellValue): string[] =>
  (text(v) ?? '').split(';').map((t) => t.trim()).filter(Boolean)
const cleanNote = (v: CellValue): string | null => {
  const t = text(v)
  return t && !V.BOILERPLATE_NOTES.has(t.toLowerCase()) ? t : null
}
const joinNotes = (...parts: Array<string | null | undefined>): string | null =>
  parts.filter((p): p is string => !!p).join(' · ') || null

export const dynamicMasterV2: ImportAdapter = {
  id: 'dynamic-master-workbook-v2',
  label: 'Dynamic Accountants master client database (v2 workbook)',
  version: '2.0.0',
  extensions: ['.xlsx'],

  async detect(file) {
    if (!file.name.toLowerCase().endsWith('.xlsx')) return 0
    try {
      const wb = await load(file)
      const names = wb.worksheets.map((w) => w.name)
      if (!REQUIRED_SHEETS.every((s) => names.includes(s))) return 0
      return readSheet(wb, 'Clients', 'CLIENT_ID') ? 1 : 0
    } catch {
      return 0
    }
  },

  async extract(file: SourceFile, ctx: AdapterContext): Promise<CanonicalBundle> {
    const wb = await load(file)
    const bundle: CanonicalBundle = {
      adapter: { id: this.id, label: this.label, version: this.version },
      sourceSystem: V.SOURCE_SYSTEM,
      file: { name: file.name, sha256: file.sha256, size: file.size },
      clients: [], contacts: [], periods: [], payrollSchemes: [], pensionSchemes: [], saRegistrations: [],
      relationships: [], logins: [], issues: [], findings: [], lookups: [],
      customFieldLabels: {}, excluded: [], unmappedColumns: [], warnings: []
    }

    // ── helpers bound to this extraction ────────────────────────────────────
    const findings = new Map<string, CanonicalIssue>()
    const finding = (
      type: string, severity: CanonicalIssue['severity'], source: SourceRef, clientKey: string | null,
      description: string, suggestedAction: string | null = null, field: string | null = null
    ): void => {
      const key = `IMP:${type}:${source.sheet}:${source.id}${field ? `:${field}` : ''}`
      if (findings.has(key)) return
      findings.set(key, {
        key, source, clientKey, relatedClientKey: null, severity, type: `import:${type}`, table: source.sheet,
        field, description, suggestedAction, status: 'open', resolvedAt: null, resolvedBy: null
      })
    }
    const ref = (s: SheetData, r: SheetRecord, idCol: string): SourceRef => ({
      sheet: s.name, row: r.row, id: text(r.values[idCol]) ?? `row-${r.row}`
    })
    const date = (raw: CellValue, source: SourceRef, clientKey: string | null, field: string): IsoDate | null => {
      const d = isoDate(raw)
      if (d.problem) finding('invalid_date', 'medium', source, clientKey, `${field}: ${d.problem}`, 'Correct the date in the source', field)
      return d.value
    }

    const calculated = new Set<string>()
    readSheet(wb, 'Data_Dictionary', 'TABLE_NAME')?.records.forEach((r) => {
      if (lc(r.values.REQUIRED) === 'calculated') calculated.add(`${text(r.values.TABLE_NAME)}.${text(r.values.FIELD)}`)
    })
    const sheet = (name: string, keyCol: string): SheetData | null => {
      const s = readSheet(wb, name, keyCol)
      if (!s) {
        bundle.warnings.push(`Sheet "${name}" not found — skipped`)
        return null
      }
      for (const h of s.headers) {
        if (!(HANDLED[name] ?? []).includes(h) && !calculated.has(`${name}.${h}`)) bundle.unmappedColumns.push({ sheet: name, column: h })
      }
      return s
    }

    // ── Clients (parent) ────────────────────────────────────────────────────
    const clientsSheet = sheet('Clients', 'CLIENT_ID')
    if (!clientsSheet) throw new Error('Not a master client workbook: the Clients sheet is missing')
    const clients = new Map<string, CanonicalClient>()
    for (const rec of clientsSheet.records) {
      const v = rec.values
      const source = ref(clientsSheet, rec, 'CLIENT_ID')
      const key = text(v.CLIENT_ID)
      if (!key) continue
      if (clients.has(key)) {
        finding('duplicate_id', 'high', source, key, `CLIENT_ID ${key} appears more than once; the first row was kept`)
        continue
      }
      const c = crn(v.CRN)
      if (c.problem) finding('invalid_identifier', 'high', source, key, `Company number — ${c.problem}`, 'Check the number on the Companies House register', 'CRN')
      let category = V.CLIENT_TYPE[lc(v.CLIENT_TYPE)]
      if (!category) {
        category = c.value ? 'company' : 'individual'
        finding('unknown_value', 'low', source, key, `Unrecognised client type "${text(v.CLIENT_TYPE) ?? ''}" — imported as ${category}`, null, 'CLIENT_TYPE')
      }
      const engagement = V.ENGAGEMENT_STATUS[lc(v.CLIENT_STATUS)]
      if (!engagement) finding('unknown_value', 'medium', source, key, `Unrecognised client status "${text(v.CLIENT_STATUS) ?? ''}" — imported as Review required`, null, 'CLIENT_STATUS')

      const services = new Map<ServiceType, boolean>()
      for (const [col, type] of V.SERVICE_COLUMNS) if (yesNo(v[col]) === true) services.set(type, true)
      for (const token of (text(v.HISTORIC_MODULES) ?? '').split(/[;,]/).map((t) => t.trim().toUpperCase()).filter(Boolean)) {
        const type = V.HISTORIC_MODULE[token]
        if (!type) finding('unknown_value', 'low', source, key, `Unrecognised historic module "${token}"`, null, 'HISTORIC_MODULES')
        else if (!services.has(type)) services.set(type, false)
      }

      clients.set(key, {
        key, source,
        name: text(v.CLIENT_NAME) ?? `(unnamed ${key})`,
        category,
        legacyRef: text(v.REF_CODE),
        crn: c.value,
        incorporated: date(v.INCORPORATION_DATE, source, key, 'INCORPORATION_DATE'),
        yearEnd: date(v.YEAR_END, source, key, 'YEAR_END'),
        companyStatus: V.COMPANY_STATUS[lc(v.COMPANY_STATUS)] ?? 'unknown',
        engagementStatus: engagement ?? 'Review required',
        utr: null, nino: null, authCode: null, vatNo: null, vatScheme: null, vatStagger: null, mtdVat: null, ctUtr: null, payeRef: null,
        notes: cleanNote(v.NOTES),
        services: [...services].map(([type, active]) => ({ type, active })),
        aliases: splitList(v.ALSO_KNOWN_AS),
        custom: { source_systems: text(v.SOURCE_SYSTEMS) }
      })
    }
    bundle.customFieldLabels.source_systems = 'Source systems (master workbook)'

    const clientOf = (rec: SheetRecord, source: SourceRef): string | null => {
      const key = text(rec.values.CLIENT_ID)
      if (key && clients.has(key)) return key
      finding('orphan_row', 'high', source, null, `Row refers to unknown CLIENT_ID "${key ?? ''}" — not imported`, 'Fix the CLIENT_ID so the row joins to a client')
      return null
    }
    const setOnClient = <K extends 'utr' | 'nino' | 'authCode' | 'vatNo' | 'ctUtr' | 'payeRef'>(
      clientKey: string, field: K, value: string, source: SourceRef, column: string
    ): void => {
      const c = clients.get(clientKey)!
      if (c[field] && c[field] !== value) {
        finding('conflicting_value', 'medium', source, clientKey, `Two different values for ${column} on one client; the first was kept`, 'Confirm which is correct', column)
      } else c[field] = value
    }

    // ── Contacts ────────────────────────────────────────────────────────────
    const byClient = new Map<string, CanonicalContact[]>()
    const addContact = (c: CanonicalContact): CanonicalContact => {
      bundle.contacts.push(c)
      byClient.set(c.clientKey, [...(byClient.get(c.clientKey) ?? []), c])
      return c
    }
    let repairedPhones = 0
    const contactsSheet = sheet('Contacts', 'CONTACT_ID')
    for (const rec of contactsSheet?.records ?? []) {
      const v = rec.values
      const source = ref(contactsSheet!, rec, 'CONTACT_ID')
      const clientKey = clientOf(rec, source)
      if (!clientKey) continue
      const ph = phoneUk(v.PHONE)
      if (ph.problem) finding('invalid_contact', 'low', source, clientKey, ph.problem, null, 'PHONE')
      if (ph.repaired) repairedPhones += 1
      const em = email(v.EMAIL)
      if (em.problem) finding('invalid_contact', 'low', source, clientKey, em.problem, null, 'EMAIL')
      addContact({
        key: source.id, source, clientKey,
        type: V.CONTACT_TYPE[lc(v.CONTACT_TYPE)] ?? 'other',
        title: text(v.TITLE), name: text(v.CONTACT_NAME), role: text(v.ROLE),
        phone: ph.value, email: em.value, isPrimary: yesNo(v.IS_PRIMARY) === true, personalCode: null,
        notes: joinNotes(cleanNote(v.NOTES), ph.extra.length ? `Other phone: ${ph.extra.join(', ')}` : null)
      })
    }
    for (const [clientKey, list] of byClient) {
      list.filter((c) => c.isPrimary).slice(1).forEach((c) => {
        c.isPrimary = false
        finding('multiple_primary', 'low', c.source, clientKey, 'More than one primary contact — the first was kept as primary')
      })
    }

    const director = (clientKey: string, name: string | null, code: string | null, source: SourceRef): void => {
      const nk = nameKey(name)
      let contact = nk ? (byClient.get(clientKey) ?? []).find((c) => nameKey(c.name) === nk) : undefined
      contact ??= addContact({
        key: `${source.id}:director`, source, clientKey, type: 'director', title: null, name,
        role: name ? 'Director (confirmation statement register)' : 'Director — name not recorded',
        phone: null, email: null, isPrimary: false, personalCode: null, notes: null
      })
      if (!code) return
      if (contact.personalCode && contact.personalCode !== code) {
        finding('conflicting_value', 'medium', source, clientKey, 'Two different personal codes for the same director', 'Confirm the code with the director', 'PERSONAL_CODE')
      } else contact.personalCode = code
      if (!name) finding('code_without_director', 'medium', source, clientKey, 'Personal code recorded with no director name', 'Add the director\u2019s name so the code is held against the right person', 'DIRECTOR_NAME')
    }

    // ── Compliance periods (registers) ──────────────────────────────────────
    const periods = new Map<string, CanonicalPeriod>()
    const byObligation = new Map<string, CanonicalPeriod[]>()
    const addPeriod = (p: CanonicalPeriod): void => {
      const nk = `${p.clientKey}|${p.obligation}|${p.periodKey}`
      if (periods.has(nk)) {
        finding('duplicate_period', 'medium', p.source, p.clientKey, `Duplicate ${p.obligation.replace(/_/g, ' ')} for period ${p.periodKey}; the first row was kept`)
        return
      }
      periods.set(nk, p)
      const ok = `${p.clientKey}|${p.obligation}`
      byObligation.set(ok, [...(byObligation.get(ok) ?? []), p])
    }
    const period = (p: Partial<CanonicalPeriod> & Pick<CanonicalPeriod, 'key' | 'source' | 'clientKey' | 'obligation' | 'periodKey'>): CanonicalPeriod => ({
      periodStart: null, periodEnd: null, taxYear: null, sourceDueDate: null, ruleInputs: {}, filedDate: null,
      status: 'not_started', assignedTo: null, archived: false, reference: null, details: {}, notes: null, ...p
    })

    const csSheet = sheet('Confirmation_Statement', 'CS_ID')
    for (const rec of csSheet?.records ?? []) {
      const v = rec.values
      const source = ref(csSheet!, rec, 'CS_ID')
      const clientKey = clientOf(rec, source)
      if (!clientKey) continue
      const due = date(v.NEXT_STATEMENT_DUE, source, clientKey, 'NEXT_STATEMENT_DUE')
      const last = date(v.LAST_STATEMENT_DATE, source, clientKey, 'LAST_STATEMENT_DATE')
      const filedOn = date(v.LAST_FILED_DATE, source, clientKey, 'LAST_FILED_DATE')
      const status = V.FILING_STATUS[lc(v.FILING_STATUS)] ?? 'not_started'
      const pc = personalCode(v.PERSONAL_CODE)
      const details: CanonicalPeriod['details'] = {}
      if (pc.statusText) {
        details.personal_code_cell = pc.statusText
        finding('status_in_code_column', 'low', source, clientKey, `PERSONAL_CODE holds "${pc.statusText}", not a personal code`,
          'Keep statuses in notes; enter the 11-character code once the director has verified', 'PERSONAL_CODE')
      }
      if (filedOn && status !== 'filed') details.last_filed_date = filedOn
      const directorName = text(v.DIRECTOR_NAME)
      if (directorName || pc.value) director(clientKey, directorName, pc.value, source)
      if (!due) continue
      const confirmationDate = addDays(due, -14)
      addPeriod(period({
        key: source.id, source, clientKey, obligation: 'confirmation_statement', periodKey: confirmationDate,
        periodEnd: confirmationDate, sourceDueDate: due, ruleInputs: { lastMadeUpTo: last },
        filedDate: status === 'filed' ? filedOn : null, status, details, notes: cleanNote(v.NOTES)
      }))
    }

    const accSheet = sheet('Accounts', 'AC_ID')
    for (const rec of accSheet?.records ?? []) {
      const v = rec.values
      const source = ref(accSheet!, rec, 'AC_ID')
      const clientKey = clientOf(rec, source)
      if (!clientKey) continue
      const client = clients.get(clientKey)!
      const ye = date(v.YEAR_END, source, clientKey, 'YEAR_END')
      const due = date(v.NEXT_ACCOUNTS_DUE, source, clientKey, 'NEXT_ACCOUNTS_DUE')
      const last = date(v.LAST_ACCOUNTS_MADE_UP_TO, source, clientKey, 'LAST_ACCOUNTS_MADE_UP_TO')
      const filed = date(v.FILED_DATE, source, clientKey, 'FILED_DATE')
      const statusRaw = lc(v.STATUS)
      const details: CanonicalPeriod['details'] = {}
      if (statusRaw && !V.FILING_STATUS[statusRaw]) details.source_status = text(v.STATUS)
      if (statusRaw === 'dormant accounts') details.dormant = true
      const notes = cleanNote(v.NOTES)
      const inc = client.incorporated
      const firstAccounts = /first accounts/i.test(notes ?? '') || (!last && !!inc && !!ye && ye <= addMonths(inc, 24))
      if (firstAccounts) details.first_accounts = true
      const periodKey = ye ?? (due ? `due:${due}` : null)
      if (!periodKey) continue
      if (ye && (!client.yearEnd || ye > client.yearEnd)) client.yearEnd = ye
      addPeriod(period({
        key: source.id, source, clientKey, obligation: 'annual_accounts', periodKey, periodEnd: ye, sourceDueDate: due,
        ruleInputs: { incorporated: inc, firstAccounts, lastMadeUpTo: last }, filedDate: filed,
        status: filed ? 'filed' : V.FILING_STATUS[statusRaw] ?? 'not_started', details, notes
      }))
    }

    const ctSheet = sheet('Corporation_Tax', 'CT_ID')
    for (const rec of ctSheet?.records ?? []) {
      const v = rec.values
      const source = ref(ctSheet!, rec, 'CT_ID')
      const clientKey = clientOf(rec, source)
      if (!clientKey) continue
      const u = utr(v.CT_UTR)
      if (u.problem) finding('invalid_identifier', 'high', source, clientKey, `Corporation tax UTR — ${u.problem}`, 'Check against HMRC correspondence', 'CT_UTR')
      if (u.value) setOnClient(clientKey, 'ctUtr', u.value, source, 'CT_UTR')
      const pe = date(v.PERIOD_END, source, clientKey, 'PERIOD_END')
      if (!pe) continue
      const filed = date(v.FILED_DATE, source, clientKey, 'FILED_DATE')
      const status = filed ? 'filed' : V.FILING_STATUS[lc(v.STATUS)] ?? 'not_started'
      addPeriod(period({ key: `${source.id}:ct600`, source, clientKey, obligation: 'ct600', periodKey: pe, periodEnd: pe, filedDate: filed, status, notes: cleanNote(v.NOTES) }))
      addPeriod(period({ key: `${source.id}:ct_payment`, source, clientKey, obligation: 'ct_payment', periodKey: pe, periodEnd: pe }))
    }

    const vatSheet = sheet('VAT', 'VAT_ID')
    for (const rec of vatSheet?.records ?? []) {
      const v = rec.values
      const source = ref(vatSheet!, rec, 'VAT_ID')
      const clientKey = clientOf(rec, source)
      if (!clientKey) continue
      const client = clients.get(clientKey)!
      const vn = vatNumber(v.VAT_REG_NO)
      if (vn.problem) finding('invalid_identifier', 'high', source, clientKey, `VAT number — ${vn.problem}`, 'Check the VAT certificate', 'VAT_REG_NO')
      if (vn.value) setOnClient(clientKey, 'vatNo', vn.value, source, 'VAT_REG_NO')
      const mtd = yesNo(v.MTD_SIGNED_UP)
      if (mtd !== null) client.mtdVat = (client.mtdVat ?? false) || mtd
      client.vatScheme ??= text(v.SCHEME)
      client.vatStagger ??= text(v.STAGGER)
      const pe = date(v.PERIOD_END, source, clientKey, 'PERIOD_END')
      const due = date(v.DUE_DATE, source, clientKey, 'DUE_DATE')
      const submitted = date(v.SUBMITTED_DATE, source, clientKey, 'SUBMITTED_DATE')
      if (!pe && !due) continue
      addPeriod(period({
        key: source.id, source, clientKey, obligation: 'vat_return', periodKey: pe ?? `due:${due}`, periodEnd: pe,
        sourceDueDate: due, filedDate: submitted, status: submitted ? 'filed' : 'not_started', notes: cleanNote(v.NOTES)
      }))
    }

    // ── Payroll ─────────────────────────────────────────────────────────────
    const schemes = new Map<string, CanonicalPayrollScheme>()
    const payrollContact = (clientKey: string, address: string, source: SourceRef): CanonicalContact =>
      (byClient.get(clientKey) ?? []).find((c) => c.email === address) ??
      addContact({
        key: `${source.id}:payroll-contact`, source, clientKey, type: 'payroll', title: null, name: null,
        role: 'Payroll e-mail', phone: null, email: address, isPrimary: false, personalCode: null, notes: null
      })
    const paySheet = sheet('Payroll_PAYE', 'PAY_ID')
    for (const rec of paySheet?.records ?? []) {
      const v = rec.values
      const source = ref(paySheet!, rec, 'PAY_ID')
      const clientKey = clientOf(rec, source)
      if (!clientKey) continue
      const pr = payeRef(v.PAYE_REFERENCE)
      if (pr.placeholder) {
        clients.get(clientKey)!.custom.paye_registration = pr.placeholder
        bundle.customFieldLabels.paye_registration = 'PAYE registration (source note)'
        continue
      }
      if (!pr.value) {
        if (pr.problem) finding('invalid_identifier', 'medium', source, clientKey, pr.problem, 'Check the PAYE reference on HMRC correspondence', 'PAYE_REFERENCE')
        continue
      }
      const ao = accountsOfficeRef(v.ACCOUNTS_OFFICE_REF)
      if (ao.problem) finding('invalid_identifier', 'medium', source, clientKey, ao.problem, 'Check the Accounts Office reference', 'ACCOUNTS_OFFICE_REF')
      const sk = `${clientKey}|${pr.value}`
      let scheme = schemes.get(sk)
      if (!scheme) {
        scheme = {
          key: `${clientKey}:paye:${pr.value}`, source, clientKey, payeRef: pr.value, accountsOfficeRef: ao.value,
          payFrequency: text(v.PAY_FREQUENCY), status: 'unknown', payrollContactKey: null, years: [], notes: cleanNote(v.NOTES)
        }
        schemes.set(sk, scheme)
      } else if (ao.value && scheme.accountsOfficeRef && ao.value !== scheme.accountsOfficeRef) {
        finding('conflicting_value', 'medium', source, clientKey, 'Two Accounts Office references for one PAYE scheme', null, 'ACCOUNTS_OFFICE_REF')
      } else scheme.accountsOfficeRef ??= ao.value
      const ty = text(v.TAX_YEAR) ?? ''
      const taxYear = taxYearEndYear(ty) ? ty : 'reference'
      const rti = text(v.RTI_STATUS)
      const employees = int(v.EMPLOYEES)
      if (!scheme.years.some((y) => y.taxYear === taxYear)) {
        scheme.years.push({ key: source.id, taxYear, employees, cisSubcontractors: int(v.CIS_SUBCONTRACTORS), rtiStatus: rti, payrollFile: text(v.PAYROLL_FILE) })
      }
      const rtiKey = rti?.toLowerCase()
      if (taxYear !== 'reference' && rtiKey) {
        scheme.status = rtiKey === 'active' ? 'active' : rtiKey === 'ceased' ? 'ceased' : rtiKey === 'dormant' ? 'dormant' : rtiKey === 'not started' ? 'not_started' : scheme.status
      }
      if (rtiKey === 'active' && employees === 0) {
        finding('scheme_without_employees', 'medium', source, clientKey, 'PAYE scheme is open with no employees',
          'Close the scheme or file nil EPS returns to avoid RTI penalties', 'EMPLOYEES')
      }
      const em = email(v.PAYROLL_EMAIL)
      if (em.problem) finding('invalid_contact', 'low', source, clientKey, em.problem, null, 'PAYROLL_EMAIL')
      if (em.value) scheme.payrollContactKey ??= payrollContact(clientKey, em.value, source).key
      clients.get(clientKey)!.payeRef ??= pr.value
    }
    bundle.payrollSchemes = [...schemes.values()]

    // ── Auto-enrolment ──────────────────────────────────────────────────────
    const letterSeen = new Map<string, string>()
    const penSheet = sheet('Pension_AE', 'PEN_ID')
    for (const rec of penSheet?.records ?? []) {
      const v = rec.values
      const source = ref(penSheet!, rec, 'PEN_ID')
      const clientKey = clientOf(rec, source)
      if (!clientKey) continue
      const lcode = letterCode(v.LETTER_CODE)
      if (lcode.problem) finding('invalid_identifier', 'medium', source, clientKey, lcode.problem, 'Check TPR correspondence', 'LETTER_CODE')
      if (lcode.value) {
        const seen = letterSeen.get(lcode.value)
        if (seen) finding('duplicate_identifier', 'medium', source, clientKey, `Letter code also used on ${seen}`, 'Each employer has its own letter code — confirm which row is right', 'LETTER_CODE')
        else letterSeen.set(lcode.value, source.id)
      }
      const duties = date(v.DUTIES_START_DATE, source, clientKey, 'DUTIES_START_DATE')
      const providerRaw = text(v.PROVIDER)
      const provider = providerRaw && !V.PROVIDER_STATUS_WORDS.has(providerRaw.toUpperCase()) ? providerRaw : null
      bundle.pensionSchemes.push({
        key: source.id, source, clientKey, letterCode: lcode.value, dutiesStart: duties, provider,
        declarationDate: date(v.DECLARATION_DATE, source, clientKey, 'DECLARATION_DATE'),
        declarationStatus: text(v.DECLARATION_STATUS),
        lastPaymentDate: date(v.LAST_PAYMENT_MADE, source, clientKey, 'LAST_PAYMENT_MADE'),
        notes: joinNotes(cleanNote(v.NOTES), providerRaw && !provider ? `Provider column held "${providerRaw}"` : null)
      })
      if (!duties) {
        finding('missing_input', 'medium', source, clientKey, 'No duties start date, so the re-declaration deadline cannot be calculated',
          'Add the duties start date from TPR correspondence', 'DUTIES_START_DATE')
        continue
      }
      const ae = aeRedeclaration(duties, ctx.today)
      const assumption = 'Assumes each earlier re-enrolment used the anniversary of the duties start date'
      addPeriod(period({
        key: `${source.id}:redeclaration:${ae.current.cycle}`, source, clientKey, obligation: 'ae_redeclaration',
        periodKey: ae.current.anniversary, periodEnd: ae.current.anniversary,
        details: { cycle: ae.current.cycle, duties_start: duties, assumption }
      }))
      if (ae.recentlyPassed) {
        addPeriod(period({
          key: `${source.id}:redeclaration:${ae.recentlyPassed.cycle}`, source, clientKey, obligation: 'ae_redeclaration',
          periodKey: ae.recentlyPassed.anniversary, periodEnd: ae.recentlyPassed.anniversary, status: 'unknown',
          details: { cycle: ae.recentlyPassed.cycle, duties_start: duties, assumption },
          notes: 'Deadline passed recently — confirm the re-declaration was made'
        }))
      }
    }

    // ── Self assessment ─────────────────────────────────────────────────────
    const saSheet = sheet('Self_Assessment', 'SA_ID')
    for (const rec of saSheet?.records ?? []) {
      const v = rec.values
      const source = ref(saSheet!, rec, 'SA_ID')
      const clientKey = clientOf(rec, source)
      if (!clientKey) continue
      const u = utr(v.UTR)
      if (u.problem) finding('invalid_identifier', 'high', source, clientKey, `UTR — ${u.problem}`, 'Confirm the UTR with HMRC or the client', 'UTR')
      if (u.value) setOnClient(clientKey, 'utr', u.value, source, 'UTR')
      const n = nino(v.NINO)
      if (n.problem) finding('invalid_identifier', 'medium', source, clientKey, n.problem, 'Confirm the National Insurance number', 'NINO')
      if (n.value) setOnClient(clientKey, 'nino', n.value, source, 'NINO')
      const raw = text(v.SA_CLIENT_TYPE)
      bundle.saRegistrations.push({
        key: source.id, source, clientKey, utr: u.value, businessDescription: text(v.BUSINESS_DESCRIPTION),
        filingRoutes: [...new Set(splitList(v.FILING_ROUTE).map(V.filingRoute))],
        firstYearOnFile: text(v.FIRST_YEAR_ON_FILE), lastYearOnFile: text(v.LAST_YEAR_ON_FILE),
        registerStatus: text(v.REGISTER_STATUS), notes: cleanNote(v.NOTES),
        incomeSources: raw ? V.classifyIncome(raw).map((i) => ({ ...i, raw })) : []
      })
      const basis = text(v.RELATION_BASIS)
      for (const target of splitList(v.RELATED_CLIENT)) {
        if (!clients.has(target)) {
          finding('orphan_link', 'low', source, clientKey, `RELATED_CLIENT "${target}" is not a known client`, null, 'RELATED_CLIENT')
          continue
        }
        if (target === clientKey) continue
        bundle.relationships.push({
          key: `${source.id}:rel:${target}`, source, fromClientKey: clientKey, toClientKey: target,
          type: /director|contact/i.test(basis ?? '') ? 'director_of' : 'connected_to', basis
        })
      }
      clients.get(clientKey)!.aliases.push(...splitList(v.ALSO_KNOWN_AS))
    }

    const sarSheet = sheet('SA_Returns', 'RETURN_ID')
    for (const rec of sarSheet?.records ?? []) {
      const v = rec.values
      const source = ref(sarSheet!, rec, 'RETURN_ID')
      const clientKey = clientOf(rec, source)
      if (!clientKey) continue
      const taxYear = text(v.TAX_YEAR) ?? ''
      const end = taxYearEnd(taxYear)
      if (!end) {
        finding('invalid_value', 'medium', source, clientKey, `Unrecognised tax year "${taxYear}"`, null, 'TAX_YEAR')
        continue
      }
      const deadline = date(v.FILING_DEADLINE, source, clientKey, 'FILING_DEADLINE')
      const details: CanonicalPeriod['details'] = {}
      for (const [k, col] of [['accounts_prepared', 'ACCOUNTS_PREPARED'], ['source_status_text', 'SOURCE_STATUS_TEXT'],
        ['conflict_note', 'CONFLICT_NOTE'], ['source_file', 'SOURCE_FILE']] as const) {
        const t = text(v[col])
        if (t) details[k] = t
      }
      const route = text(v.FILING_ROUTE)
      if (route) details.filing_route = V.filingRoute(route)
      addPeriod(period({
        key: source.id, source, clientKey, obligation: 'self_assessment', periodKey: taxYear,
        periodStart: iso(Number(end.slice(0, 4)) - 1, 4, 6), periodEnd: end, taxYear, sourceDueDate: deadline,
        filedDate: date(v.SUBMITTED_DATE, source, clientKey, 'SUBMITTED_DATE'),
        status: V.SA_RETURN_STATUS[lc(v.SUBMISSION_STATUS)] ?? 'unknown',
        // Historic register: expired deadlines must not flood the live worklist (workbook README).
        archived: deadline ? daysBetween(deadline, ctx.today) > 365 : true,
        details, notes: text(v.REMARK)
      }))
    }

    // ── Deadline calendar: merge assignees / completion into register periods ──
    const dlSheet = sheet('Deadline_Calendar', 'DEADLINE_ID')
    for (const rec of dlSheet?.records ?? []) {
      const v = rec.values
      const source = ref(dlSheet!, rec, 'DEADLINE_ID')
      const clientKey = clientOf(rec, source)
      if (!clientKey) continue
      const obligation = V.OBLIGATION[lc(v.OBLIGATION)]
      if (!obligation) {
        finding('unknown_value', 'medium', source, clientKey, `Unrecognised obligation "${text(v.OBLIGATION) ?? ''}"`, null, 'OBLIGATION')
        continue
      }
      const per = date(v.PERIOD, source, clientKey, 'PERIOD')
      const due = date(v.DUE_DATE, source, clientKey, 'DUE_DATE')
      const completed = date(v.COMPLETED_DATE, source, clientKey, 'COMPLETED_DATE')
      const assigned = text(v.ASSIGNED_TO)
      const assignedTo = assigned && assigned.toLowerCase() !== 'unassigned' ? assigned : null
      const note = cleanNote(v.NOTES)
      const candidates = byObligation.get(`${clientKey}|${obligation}`) ?? []
      const match = obligation === 'confirmation_statement'
        ? candidates.find((p) => p.sourceDueDate === due)
        : candidates.find((p) => per !== null && p.periodEnd === per) ?? candidates.find((p) => due !== null && p.sourceDueDate === due)
      if (match) {
        match.assignedTo ??= assignedTo
        if (completed && !match.filedDate) {
          match.filedDate = completed
          match.status = 'filed'
        }
        if (note && !(match.notes ?? '').includes(note)) match.notes = joinNotes(match.notes, note)
      } else if (per || due) {
        addPeriod(period({
          key: source.id, source, clientKey, obligation, periodKey: per ?? `due:${due}`, periodEnd: per, sourceDueDate: due,
          filedDate: completed, status: completed ? 'filed' : 'not_started', assignedTo, notes: note
        }))
      }
    }
    bundle.periods = [...periods.values()]

    // ── Credentials: auth codes + gateway ids; passwords never leave the file ──
    let passwords = 0
    const credSheet = sheet('Credentials', 'CRED_ID')
    for (const rec of credSheet?.records ?? []) {
      const v = rec.values
      const source = ref(credSheet!, rec, 'CRED_ID')
      if (text(v.PASSWORD)) passwords += 1
      const clientKey = clientOf(rec, source)
      if (!clientKey) continue
      const auth = text(v.AUTH_CODE)?.toUpperCase().replace(/\s/g, '')
      if (auth) {
        if (!/^[A-Z0-9]{6}$/.test(auth)) finding('invalid_identifier', 'low', source, clientKey, 'Companies House authentication code is not 6 characters', 'Request a new code if needed', 'AUTH_CODE')
        setOnClient(clientKey, 'authCode', auth, source, 'AUTH_CODE')
      }
      const user = text(v.USER_ID)
      if (user) {
        bundle.logins.push({
          key: source.id, source, clientKey, platform: text(v.SYSTEM) ?? 'Unknown', username: user,
          notes: joinNotes('Imported from master workbook; password not imported', cleanNote(v.NOTES))
        })
      }
    }
    bundle.excluded.push({
      what: 'Plain-text gateway passwords', count: passwords,
      reason: 'Never imported. Move them to a password manager, then delete the PASSWORD column (workbook README).'
    })

    // ── Source issue log ────────────────────────────────────────────────────
    const issuesSheet = sheet('Data_Issues', 'ISSUE_ID')
    for (const rec of issuesSheet?.records ?? []) {
      const v = rec.values
      const key = text(v.ISSUE_ID)
      if (!key) continue
      const ck = text(v.CLIENT_ID)
      const tableName = text(v.TABLE_NAME)
      const field = text(v.FIELD)
      bundle.issues.push({
        key, source: ref(issuesSheet!, rec, 'ISSUE_ID'), clientKey: ck && clients.has(ck) ? ck : null, relatedClientKey: null,
        severity: V.SEVERITY[lc(v.SEVERITY)] ?? 'medium',
        type: `workbook:${tableName ?? 'practice'}${field ? `.${field}` : ''}`, table: tableName, field,
        description: text(v.ISSUE_DESCRIPTION) ?? '(no description)', suggestedAction: text(v.SUGGESTED_ACTION),
        status: V.ISSUE_STATUS[lc(v.STATUS)] ?? 'open',
        resolvedAt: isoDate(v.RESOLVED_DATE).value, resolvedBy: text(v.RESOLVED_BY)
      })
    }

    // ── E-mail directory: only addresses attributed to a client ─────────────
    let unattributed = 0
    const mailSheet = sheet('Email_Directory', 'EMAIL_ID')
    for (const rec of mailSheet?.records ?? []) {
      const v = rec.values
      const ck = text(v.CLIENT_ID)
      if (!lc(v.MATCH_STATUS).startsWith('matched') || !ck || !clients.has(ck)) {
        unattributed += 1
        continue
      }
      const em = email(v.EMAIL_ADDRESS).value
      if (!em || yesNo(v.ALREADY_IN_MASTER) === true || (byClient.get(ck) ?? []).some((c) => c.email === em)) continue
      const source = ref(mailSheet!, rec, 'EMAIL_ID')
      addContact({
        key: source.id, source, clientKey: ck, type: 'other', title: null, name: text(v.NAME_ON_RECORD),
        role: 'E-mail directory record', phone: null, email: em, isPrimary: false, personalCode: null, notes: null
      })
    }
    bundle.excluded.push({
      what: 'Unattributed e-mail addresses', count: unattributed,
      reason: 'A triage list, not client data — holding them in the CRM would keep personal data with no purpose.'
    })

    // ── Drop-down lists worth keeping as editable vocabularies ──────────────
    const listsWs = wb.getWorksheet('Lists')
    if (listsWs) {
      const wanted: Record<string, string> = { Staff: 'staff', CredentialSystem: 'credential_platform' }
      let nameRow = 0
      listsWs.eachRow((row, n) => {
        if (!nameRow && (row.values as unknown[]).some((x) => x === 'ClientType')) nameRow = n
      })
      if (nameRow) {
        const names = listsWs.getRow(nameRow).values as unknown[]
        names.forEach((name, col) => {
          const listKey = typeof name === 'string' ? wanted[name] : undefined
          if (!listKey) return
          for (let r = nameRow + 1, order = 1; r <= listsWs.rowCount; r += 1) {
            const label = text(listsWs.getRow(r).getCell(col).value as CellValue)
            if (!label) break
            if (label.toLowerCase() === 'unassigned') continue
            bundle.lookups.push({ listKey, valueKey: label, label, sortOrder: order++ })
          }
        })
      }
    }

    // Dedupe aliases after SA merge; drop aliases equal to the client name.
    for (const c of clients.values()) {
      const own = nameKey(c.name)
      c.aliases = [...new Map(c.aliases.map((a) => [nameKey(a), a])).entries()]
        .filter(([k]) => k && k !== own).map(([, a]) => a)
    }
    bundle.clients = [...clients.values()]
    bundle.findings = [...findings.values()]
    if (repairedPhones) bundle.warnings.push(`Restored the leading 0 on ${repairedPhones} UK phone numbers that the spreadsheet stored as numbers`)
    if (bundle.unmappedColumns.length) {
      bundle.warnings.push(`${bundle.unmappedColumns.length} source column(s) are not mapped and will not be imported — see unmapped columns`)
    }
    return bundle
  }
}
