/**
 * The registers on the Client file that are changed there: PAYE schemes and
 * their years, workplace pensions, the Self Assessment registration and the
 * client's sources of income, links between clients, and other names.
 *
 *   who        staff work on their own clients' registers; partners and
 *              managers on every client's. A link needs both clients to be
 *              ones the person may work on.
 *   checking   references are checked as they are everywhere in the app
 *              (src/shared/references.ts): a PAYE reference is 123/AB45678, an
 *              Accounts Office reference 13 characters, a UTR 10 digits that
 *              pass HMRC's check. One that fails is kept as entered and flagged
 *              under Issues, never refused (reference-flags.ts); the flag closes
 *              when it is corrected. A Pensions Regulator letter code is 10
 *              digits and belongs to one employer. Values are checked when they
 *              change, so an odd value from an import never blocks another edit.
 *   following  the client record's PAYE reference and UTR are filled from a
 *              scheme or registration when the record has none. A pension's
 *              duties start date sets its re-declaration deadlines, by the same
 *              rule the import uses (five months from each third anniversary);
 *              a changed or removed date archives the open deadlines made from
 *              the old one, and a date changed back restores them.
 *   audit      every change, with the values before and after, in the same
 *              transaction, naming the client it was about.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type {
  AliasType, ClientAlias, ClientIncomeSource, ClientRelationship, FilingRoute, FilingStatus, IncomeSourceType, PayrollScheme,
  PayrollSchemeStatus, PayrollSchemeYear, PensionSaveResult, SaRegistration
} from '../../shared/types'
import { ALIAS_TYPE_LABELS, FILING_ROUTE_LABELS, INCOME_SOURCE_LABELS, PAYROLL_STATUS_LABELS } from '../../shared/types'
import { checkAccountsOfficeReference, checkPayeReference, checkUtr, keepReference } from '../../shared/references'
import { auditChanges, auditRow, auditValue, writeAudit, type Row } from '../access/audit'
import { clientForActor, idArg, refArg, UserFacingError, type Actor } from '../access/policy'
import { nameKey } from '../import/core/normalise'
import { aeRedeclaration } from '../import/core/rules'
import { dateOrNull, friendly, localDate, textOrNull } from './common'
import { closeFlagsOfRow, closeImportFlags, settleReferenceFlag } from './reference-flags'
import { listPayrollSchemes, listPensionSchemes, listRelationships, saRegistration, taxYearOrNull } from './registers'

const has = (input: object, key: string): boolean => Object.prototype.hasOwnProperty.call(input, key)

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new UserFacingError('Nothing to save.')
  return input as Record<string, unknown>
}

/** Whether a value sent by the screen differs from the row as it stands (any value, for a new row). */
const changes = (data: Record<string, unknown>, before: Row | null) => (key: string): boolean =>
  has(data, key) && (before === null || (data[key] ?? null) !== (before[key] ?? null))

/** A whole number from 0 to `max`, or null for blank. */
function countOrNull(value: unknown, label: string, max = 100_000): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isInteger(n) || n < 0 || n > max) throw new UserFacingError(`${label} is a whole number from 0 to ${max.toLocaleString('en-GB')}.`)
  return n
}

/** A date that has happened: not after today. */
function pastDateOrNull(value: unknown, label: string, today: string): string | null {
  const d = dateOrNull(value, label)
  if (d && d > today) throw new UserFacingError(`${label} is in the future.`)
  return d
}

/**
 * Writes `values` to a row: only the columns that change on an existing one,
 * every column (with `defaults`) on a new one. Constraint failures become
 * sentences. Returns the row's id.
 */
function persist(db: Database, table: string, before: Row | null, values: Row, defaults: Row = {}): number {
  try {
    if (before) {
      const id = before.id as number
      const cols = Object.keys(values).filter((c) => (values[c] ?? null) !== (before[c] ?? null))
      if (cols.length) {
        db.prepare(`UPDATE "${table}" SET ${cols.map((c) => `"${c}" = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...cols.map((c) => values[c]), id)
      }
      return id
    }
    const row: Row = { ...defaults, ...values }
    const cols = Object.keys(row)
    return Number(db.prepare(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => row[c])).lastInsertRowid)
  } catch (err) {
    friendly(err, table)
  }
}

/** The row being changed (with `id`) and its client, or the client a new row is for (with `client_ref`). */
function target(db: Database, actor: Actor, table: string, data: Record<string, unknown>, noun: string): { before: Row | null; clientRef: string } {
  if (data.id !== undefined && data.id !== null) {
    const before = (db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(idArg(data.id, noun)) as Row | undefined) ?? null
    if (!before) throw new UserFacingError(`That ${noun} no longer exists.`)
    return { before, clientRef: clientForActor(db, before.client_ref as string, actor).ref as string }
  }
  return { before: null, clientRef: clientForActor(db, refArg(data.client_ref), actor).ref as string }
}

/** Records a new row, or the columns of an existing one that changed. */
function auditSave(db: Database, actor: Actor, table: string, id: number, before: Row | null, after: Row, actions: [added: string, changed: string], context: readonly string[], extra: Row = {}): void {
  if (!before) {
    writeAudit(db, actor, actions[0], table, id, null, { ...extra, ...auditRow(table, after) })
    return
  }
  const diff = auditChanges(table, { ...extra, ...before }, { ...extra, ...after }, [...Object.keys(extra), ...context])
  if (diff) writeAudit(db, actor, actions[1], table, id, diff.before, diff.after)
}

/** Fills a column on the client record when it is empty, and records that it was filled. */
function fillClient(db: Database, actor: Actor, clientRef: string, column: 'paye_ref' | 'utr', value: string): void {
  const client = db.prepare(`SELECT id, ${column} AS v FROM clients WHERE ref = ?`).get(clientRef) as { id: number; v: string | null } | undefined
  if (!client || (client.v !== null && String(client.v).trim() !== '')) return
  db.prepare(`UPDATE clients SET ${column} = ?, updated_at = datetime('now') WHERE id = ?`).run(value, client.id)
  writeAudit(db, actor, 'Updated client', 'clients', client.id, { client_ref: clientRef, [column]: null }, { client_ref: clientRef, [column]: auditValue('clients', column, value) })
}

// ── PAYE schemes ─────────────────────────────────────────────────────────────

const PAYROLL_STATUSES = Object.keys(PAYROLL_STATUS_LABELS) as PayrollSchemeStatus[]

/** Adds a PAYE scheme (with `client_ref`) or changes one (with `id`). */
export function savePayrollScheme(db: Database, actor: Actor, input: unknown): PayrollScheme {
  const data = asObject(input)
  return db.transaction(() => {
    const { before, clientRef } = target(db, actor, 'payroll_schemes', data, 'PAYE scheme')
    const changed = changes(data, before)
    const values: Row = {}
    // A reference that fails its check is kept as entered, and flagged below.
    const problems: Partial<Record<'paye_reference' | 'accounts_office_ref', string | null>> = {}
    if (before === null || changed('paye_reference')) {
      const raw = textOrNull(data.paye_reference, 'The PAYE reference', 40)
      if (!raw) throw new UserFacingError('Enter the employer PAYE reference, like 123/AB45678.')
      const kept = keepReference(raw, checkPayeReference)
      values.paye_reference = kept.value
      problems.paye_reference = kept.problem
    }
    if (changed('accounts_office_ref')) {
      const raw = textOrNull(data.accounts_office_ref, 'The Accounts Office reference', 40)
      if (raw) {
        const kept = keepReference(raw, checkAccountsOfficeReference)
        values.accounts_office_ref = kept.value
        problems.accounts_office_ref = kept.problem
      } else {
        values.accounts_office_ref = null
        problems.accounts_office_ref = null
      }
    }
    if (changed('pay_frequency')) values.pay_frequency = textOrNull(data.pay_frequency, 'How often they pay', 40)
    if (changed('scheme_status')) {
      if (!PAYROLL_STATUSES.includes(data.scheme_status as PayrollSchemeStatus)) throw new UserFacingError('Choose where the scheme stands from the list.')
      values.scheme_status = data.scheme_status
    }
    if (changed('payroll_contact_id')) {
      if (data.payroll_contact_id === null || data.payroll_contact_id === undefined || data.payroll_contact_id === '') values.payroll_contact_id = null
      else {
        const contact = db.prepare('SELECT id FROM client_contacts WHERE id = ? AND client_ref = ?').get(idArg(data.payroll_contact_id, 'contact'), clientRef)
        if (!contact) throw new UserFacingError('Choose one of this client’s contacts for payroll.')
        values.payroll_contact_id = data.payroll_contact_id
      }
    }
    if (changed('notes')) values.notes = textOrNull(data.notes, 'The notes', 2000)

    if (values.paye_reference !== undefined) {
      const clash = db.prepare('SELECT 1 FROM payroll_schemes WHERE client_ref = ? AND paye_reference = ? AND id <> ?').get(clientRef, values.paye_reference, before?.id ?? 0)
      if (clash) throw new UserFacingError(`This client already has PAYE scheme ${values.paye_reference}.`)
    }
    const id = persist(db, 'payroll_schemes', before, values, { client_ref: clientRef, scheme_status: 'unknown' })
    const after = db.prepare('SELECT * FROM payroll_schemes WHERE id = ?').get(id) as Row
    auditSave(db, actor, 'payroll_schemes', id, before, after, ['Added PAYE scheme', 'Updated PAYE scheme'], ['client_ref', 'paye_reference'])
    const scheme = String(after.paye_reference)
    if (problems.paye_reference !== undefined) {
      settleReferenceFlag(db, actor, { table: 'payroll_schemes', key: id, field: 'paye_reference', clientRef, label: `PAYE reference of scheme ${scheme}` }, problems.paye_reference)
      if (!problems.paye_reference) closeImportFlags(db, actor, clientRef, 'paye')
    }
    if (problems.accounts_office_ref !== undefined) {
      settleReferenceFlag(db, actor, { table: 'payroll_schemes', key: id, field: 'accounts_office_ref', clientRef, label: `Accounts Office reference of PAYE scheme ${scheme}` }, problems.accounts_office_ref)
      if (!problems.accounts_office_ref && values.accounts_office_ref) closeImportFlags(db, actor, clientRef, 'ao')
    }
    // The client record takes the scheme's reference only when it passes its check.
    if (checkPayeReference(scheme).ok) fillClient(db, actor, clientRef, 'paye_ref', scheme)
    return listPayrollSchemes(db, actor, clientRef).find((s) => s.id === id)!
  })()
}

/** Removes a PAYE scheme, and its years with it. */
export function deletePayrollScheme(db: Database, actor: Actor, id: unknown): void {
  const rowId = idArg(id, 'PAYE scheme')
  db.transaction(() => {
    const before = db.prepare('SELECT * FROM payroll_schemes WHERE id = ?').get(rowId) as Row | undefined
    if (!before) throw new UserFacingError('That PAYE scheme no longer exists.')
    clientForActor(db, before.client_ref as string, actor)
    const years = (db.prepare('SELECT COUNT(*) AS n FROM payroll_scheme_years WHERE scheme_id = ?').get(rowId) as { n: number }).n
    db.prepare('DELETE FROM payroll_schemes WHERE id = ?').run(rowId)
    writeAudit(db, actor, 'Removed PAYE scheme', 'payroll_schemes', rowId, { ...auditRow('payroll_schemes', before), years }, null)
    closeFlagsOfRow(db, actor, 'payroll_schemes', rowId, 'The PAYE scheme was removed.')
  })()
}

/** The scheme a year belongs to, if the person may work on its client. */
function schemeFor(db: Database, actor: Actor, schemeId: number): Row {
  const scheme = db.prepare('SELECT * FROM payroll_schemes WHERE id = ?').get(schemeId) as Row | undefined
  if (!scheme) throw new UserFacingError('That PAYE scheme no longer exists.')
  clientForActor(db, scheme.client_ref as string, actor)
  return scheme
}

/** Adds a tax year to a scheme (with `scheme_id`) or changes one (with `id`). */
export function savePayrollYear(db: Database, actor: Actor, input: unknown): PayrollSchemeYear {
  const data = asObject(input)
  return db.transaction(() => {
    let before: Row | null = null
    let scheme: Row
    if (data.id !== undefined && data.id !== null) {
      before = (db.prepare('SELECT * FROM payroll_scheme_years WHERE id = ?').get(idArg(data.id, 'payroll year')) as Row | undefined) ?? null
      if (!before) throw new UserFacingError('That payroll year no longer exists.')
      scheme = schemeFor(db, actor, before.scheme_id as number)
    } else scheme = schemeFor(db, actor, idArg(data.scheme_id, 'PAYE scheme'))
    const changed = changes(data, before)
    const values: Row = {}
    if (before === null || changed('tax_year')) {
      const year = taxYearOrNull(data.tax_year)
      if (!year) throw new UserFacingError('Enter the tax year, like 2025-26.')
      values.tax_year = year
      const clash = db.prepare('SELECT 1 FROM payroll_scheme_years WHERE scheme_id = ? AND tax_year = ? AND id <> ?').get(scheme.id, year, before?.id ?? 0)
      if (clash) throw new UserFacingError(`This scheme already has ${year}.`)
    }
    if (changed('employees')) values.employees = countOrNull(data.employees, 'The number of employees')
    if (changed('cis_subcontractors')) values.cis_subcontractors = countOrNull(data.cis_subcontractors, 'The number of CIS subcontractors')
    if (changed('rti_status')) values.rti_status = textOrNull(data.rti_status, 'The RTI status', 60)
    if (changed('payroll_file')) values.payroll_file = textOrNull(data.payroll_file, 'The payroll file', 200)
    const id = persist(db, 'payroll_scheme_years', before, values, { scheme_id: scheme.id })
    const after = db.prepare('SELECT * FROM payroll_scheme_years WHERE id = ?').get(id) as Row
    auditSave(db, actor, 'payroll_scheme_years', id, before, after, ['Added payroll year', 'Updated payroll year'], ['tax_year'], {
      client_ref: scheme.client_ref, paye_reference: scheme.paye_reference
    })
    return after as unknown as PayrollSchemeYear
  })()
}

export function deletePayrollYear(db: Database, actor: Actor, id: unknown): void {
  const rowId = idArg(id, 'payroll year')
  db.transaction(() => {
    const before = db.prepare('SELECT * FROM payroll_scheme_years WHERE id = ?').get(rowId) as Row | undefined
    if (!before) throw new UserFacingError('That payroll year no longer exists.')
    const scheme = schemeFor(db, actor, before.scheme_id as number)
    db.prepare('DELETE FROM payroll_scheme_years WHERE id = ?').run(rowId)
    writeAudit(db, actor, 'Removed payroll year', 'payroll_scheme_years', rowId, {
      client_ref: scheme.client_ref, paye_reference: scheme.paye_reference, ...auditRow('payroll_scheme_years', before)
    }, null)
  })()
}

// ── Workplace pensions and their re-declaration deadlines ────────────────────

const REDECLARATION_ASSUMPTION = 'Assumes each earlier re-enrolment used the anniversary of the duties start date'

/** The duties start date a re-declaration deadline was worked out from (import or Client file), if any. */
function dutiesStartOf(details: unknown): string | null {
  if (typeof details !== 'string' || !details) return null
  try {
    const v = (JSON.parse(details) as Record<string, unknown>).duties_start
    return typeof v === 'string' ? v : null
  } catch {
    return null
  }
}

const OPEN_PERIOD = "archived = 0 AND filed_date IS NULL AND status NOT IN ('filed', 'not_applicable')"

/**
 * Makes sure the re-declaration deadlines for a duties start date are on the
 * client's list: the current cycle's, and one that passed within six months
 * (to confirm), as the import does. One archived when the date last changed
 * comes back.
 */
function ensureRedeclarations(db: Database, actor: Actor, clientRef: string, duties: string, today: string, result: PensionSaveResult): void {
  const ae = aeRedeclaration(duties, today)
  const cycles = [{ cycle: ae.current, recent: false }, ...(ae.recentlyPassed ? [{ cycle: ae.recentlyPassed, recent: true }] : [])]
  for (const { cycle, recent } of cycles) {
    const existing = db.prepare("SELECT * FROM compliance_periods WHERE client_ref = ? AND obligation = 'ae_redeclaration' AND period_key = ?").get(clientRef, cycle.anniversary) as Row | undefined
    if (existing) {
      if (existing.archived === 1 && dutiesStartOf(existing.details_json) === duties) {
        db.prepare("UPDATE compliance_periods SET archived = 0, updated_at = datetime('now') WHERE id = ?").run(existing.id)
        writeAudit(db, actor, 'Restored deadline', 'compliance_periods', existing.id as number,
          { client_ref: clientRef, obligation: 'ae_redeclaration', period_key: cycle.anniversary, archived: 1 },
          { client_ref: clientRef, obligation: 'ae_redeclaration', period_key: cycle.anniversary, archived: 0 })
        result.deadlinesRestored += 1
      }
      continue
    }
    const status: FilingStatus = recent ? 'unknown' : 'not_started'
    const row: Row = {
      client_ref: clientRef, obligation: 'ae_redeclaration', period_key: cycle.anniversary, period_end: cycle.anniversary,
      due_date: cycle.deadline, due_date_basis: 'rule', rule_due_date: cycle.deadline, status,
      details_json: JSON.stringify({ assumption: REDECLARATION_ASSUMPTION, cycle: cycle.cycle, duties_start: duties }),
      notes: recent ? 'Deadline passed recently — confirm the re-declaration was made' : null
    }
    const id = persist(db, 'compliance_periods', null, row)
    writeAudit(db, actor, 'Added deadline', 'compliance_periods', id, null, auditRow('compliance_periods', db.prepare('SELECT * FROM compliance_periods WHERE id = ?').get(id) as Row))
    result.deadlinesAdded.push({ id, due_date: cycle.deadline, status })
  }
}

/** Archives the open re-declaration deadlines worked out from a duties start date that no longer applies. */
function archiveRedeclarations(db: Database, actor: Actor, clientRef: string, duties: string, reason: string, result: PensionSaveResult): void {
  const rows = db.prepare(`SELECT * FROM compliance_periods WHERE client_ref = ? AND obligation = 'ae_redeclaration' AND ${OPEN_PERIOD}`).all(clientRef) as Row[]
  for (const p of rows.filter((r) => dutiesStartOf(r.details_json) === duties)) {
    const notes = [p.notes, reason].filter((n) => typeof n === 'string' && n.trim()).join(' ')
    db.prepare("UPDATE compliance_periods SET archived = 1, notes = ?, updated_at = datetime('now') WHERE id = ?").run(notes, p.id)
    const after = db.prepare('SELECT * FROM compliance_periods WHERE id = ?').get(p.id) as Row
    const diff = auditChanges('compliance_periods', p, after, ['client_ref', 'obligation', 'period_key'])
    if (diff) writeAudit(db, actor, 'Archived deadline', 'compliance_periods', p.id as number, diff.before, diff.after)
    result.deadlinesArchived += 1
  }
}

/** Whether another of the client's pensions has the same duties start date (so its deadlines stay). */
const dutiesShared = (db: Database, clientRef: string, duties: string, exceptId: number): boolean =>
  db.prepare('SELECT 1 FROM pension_schemes WHERE client_ref = ? AND duties_start_date = ? AND id <> ?').get(clientRef, duties, exceptId) !== undefined

/** Adds a workplace pension (with `client_ref`) or changes one (with `id`), keeping its re-declaration deadlines in step. */
export function savePensionScheme(db: Database, actor: Actor, input: unknown, today: string = localDate()): PensionSaveResult {
  const data = asObject(input)
  return db.transaction(() => {
    const { before, clientRef } = target(db, actor, 'pension_schemes', data, 'workplace pension')
    const changed = changes(data, before)
    const values: Row = {}
    if (changed('letter_code')) {
      const raw = textOrNull(data.letter_code, 'The letter code', 40)
      const code = raw ? raw.replace(/\s+/g, '') : null
      if (code && !/^\d{10}$/.test(code)) throw new UserFacingError('A Pensions Regulator letter code is 10 digits.')
      if (code) {
        const other = db.prepare('SELECT p.client_ref, c.client_name, c.assigned_to FROM pension_schemes p JOIN clients c ON c.ref = p.client_ref WHERE p.letter_code = ? AND p.id <> ?').get(code, before?.id ?? 0) as
          | { client_ref: string; client_name: string; assigned_to: string | null }
          | undefined
        if (other) {
          const whose = other.client_ref === clientRef ? 'another of this client’s pensions' : actor.role === 'staff' && other.assigned_to !== actor.name ? 'another client' : other.client_name
          throw new UserFacingError(`That letter code is already recorded for ${whose}. Each employer has its own letter code.`)
        }
      }
      values.letter_code = code
    }
    if (changed('duties_start_date')) values.duties_start_date = dateOrNull(data.duties_start_date, 'The duties start date')
    if (changed('provider')) values.provider = textOrNull(data.provider, 'The provider', 120)
    if (changed('declaration_date')) values.declaration_date = pastDateOrNull(data.declaration_date, 'The declaration date', today)
    if (changed('declaration_status')) values.declaration_status = textOrNull(data.declaration_status, 'The declaration status', 60)
    if (changed('last_payment_date')) values.last_payment_date = pastDateOrNull(data.last_payment_date, 'The last payment date', today)
    if (changed('notes')) values.notes = textOrNull(data.notes, 'The notes', 2000)
    const id = persist(db, 'pension_schemes', before, values, { client_ref: clientRef })
    const after = db.prepare('SELECT * FROM pension_schemes WHERE id = ?').get(id) as Row
    auditSave(db, actor, 'pension_schemes', id, before, after, ['Added workplace pension', 'Updated workplace pension'], ['client_ref', 'provider'])

    const result: PensionSaveResult = { scheme: null, deadlinesAdded: [], deadlinesArchived: 0, deadlinesRestored: 0 }
    const oldDuties = (before?.duties_start_date as string | null | undefined) ?? null
    const newDuties = (after.duties_start_date as string | null) ?? null
    if (oldDuties && oldDuties !== newDuties && !dutiesShared(db, clientRef, oldDuties, id)) {
      archiveRedeclarations(db, actor, clientRef, oldDuties, `Archived: the duties start date changed from ${oldDuties}.`, result)
    }
    if (newDuties && (before === null || newDuties !== oldDuties)) ensureRedeclarations(db, actor, clientRef, newDuties, today, result)
    result.scheme = listPensionSchemes(db, actor, clientRef).find((s) => s.id === id) ?? null
    return result
  })()
}

/** Removes a workplace pension; the open re-declaration deadlines made from its duties start date are archived. */
export function deletePensionScheme(db: Database, actor: Actor, id: unknown): PensionSaveResult {
  const rowId = idArg(id, 'workplace pension')
  return db.transaction(() => {
    const before = db.prepare('SELECT * FROM pension_schemes WHERE id = ?').get(rowId) as Row | undefined
    if (!before) throw new UserFacingError('That workplace pension no longer exists.')
    const clientRef = clientForActor(db, before.client_ref as string, actor).ref as string
    db.prepare('DELETE FROM pension_schemes WHERE id = ?').run(rowId)
    writeAudit(db, actor, 'Removed workplace pension', 'pension_schemes', rowId, auditRow('pension_schemes', before), null)
    const result: PensionSaveResult = { scheme: null, deadlinesAdded: [], deadlinesArchived: 0, deadlinesRestored: 0 }
    const duties = before.duties_start_date as string | null
    if (duties && !dutiesShared(db, clientRef, duties, rowId)) archiveRedeclarations(db, actor, clientRef, duties, 'Archived: the workplace pension was removed.', result)
    return result
  })()
}

// ── Self Assessment ──────────────────────────────────────────────────────────

const FILING_ROUTES = Object.keys(FILING_ROUTE_LABELS) as FilingRoute[]

/** The filing routes as stored ("own_agent; client_gateway"), from a list or that text. */
function filingRoutesOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const list = Array.isArray(value) ? value : String(value).split(/\s*;\s*/)
  const keys = [...new Set(list.map((v) => String(v).trim()).filter(Boolean))]
  for (const k of keys) if (!FILING_ROUTES.includes(k as FilingRoute)) throw new UserFacingError('Choose how the return is filed from the list.')
  return keys.length ? FILING_ROUTES.filter((r) => keys.includes(r)).join('; ') : null
}

/** Adds the client's Self Assessment registration or changes it; there is one per client. */
export function saveSaRegistration(db: Database, actor: Actor, input: unknown): SaRegistration {
  const data = asObject(input)
  return db.transaction(() => {
    const found = target(db, actor, 'sa_registrations', data, 'Self Assessment registration')
    const clientRef = found.clientRef
    // One per client: saving for a client that has one changes it.
    const before = found.before ?? (db.prepare('SELECT * FROM sa_registrations WHERE client_ref = ?').get(clientRef) as Row | undefined) ?? null
    const changed = changes(data, before)
    const values: Row = {}
    // A UTR that fails its check is kept as entered, and flagged below.
    let utrProblem: string | null | undefined
    if (changed('utr')) {
      const raw = textOrNull(data.utr, 'The UTR', 20)
      if (raw) {
        const kept = keepReference(raw, checkUtr)
        values.utr = kept.value
        utrProblem = kept.problem
      } else {
        values.utr = null
        utrProblem = null
      }
    }
    if (changed('business_description')) values.business_description = textOrNull(data.business_description, 'What the business does', 200)
    if (has(data, 'filing_route')) {
      const routes = filingRoutesOrNull(data.filing_route)
      if (routes !== ((before?.filing_route as string | null | undefined) ?? null)) values.filing_route = routes
    }
    if (changed('first_year_on_file')) values.first_year_on_file = taxYearOrNull(data.first_year_on_file)
    if (changed('last_year_on_file')) values.last_year_on_file = taxYearOrNull(data.last_year_on_file)
    if (changed('register_status')) values.register_status = textOrNull(data.register_status, 'Where the registration stands', 60)
    if (changed('notes')) values.notes = textOrNull(data.notes, 'The notes', 2000)
    const will = (key: string): unknown => (has(values, key) ? values[key] : (before?.[key] ?? null))
    const first = will('first_year_on_file')
    const last = will('last_year_on_file')
    if (typeof first === 'string' && typeof last === 'string' && /^\d{4}-\d{2}$/.test(first) && /^\d{4}-\d{2}$/.test(last) && last < first) {
      throw new UserFacingError('The last year on file is before the first.')
    }
    const id = persist(db, 'sa_registrations', before, values, { client_ref: clientRef })
    const after = db.prepare('SELECT * FROM sa_registrations WHERE id = ?').get(id) as Row
    auditSave(db, actor, 'sa_registrations', id, before, after, ['Added Self Assessment registration', 'Updated Self Assessment registration'], ['client_ref'])
    if (utrProblem !== undefined) {
      settleReferenceFlag(db, actor, { table: 'sa_registrations', key: id, field: 'utr', clientRef, label: 'UTR of the Self Assessment registration' }, utrProblem)
    }
    // The client record takes the UTR only when it passes its check.
    if (typeof after.utr === 'string' && after.utr && checkUtr(after.utr).ok) fillClient(db, actor, clientRef, 'utr', after.utr)
    if (utrProblem === null && values.utr) closeImportFlags(db, actor, clientRef, 'utr')
    return saRegistration(db, actor, clientRef)!
  })()
}

export function deleteSaRegistration(db: Database, actor: Actor, id: unknown): void {
  const rowId = idArg(id, 'Self Assessment registration')
  db.transaction(() => {
    const before = db.prepare('SELECT * FROM sa_registrations WHERE id = ?').get(rowId) as Row | undefined
    if (!before) throw new UserFacingError('That Self Assessment registration no longer exists.')
    clientForActor(db, before.client_ref as string, actor)
    db.prepare('DELETE FROM sa_registrations WHERE id = ?').run(rowId)
    writeAudit(db, actor, 'Removed Self Assessment registration', 'sa_registrations', rowId, auditRow('sa_registrations', before), null)
    closeFlagsOfRow(db, actor, 'sa_registrations', rowId, 'The Self Assessment registration was removed.')
  })()
}

const INCOME_TYPES = Object.keys(INCOME_SOURCE_LABELS) as IncomeSourceType[]

/** Adds a source of income (with `client_ref`) or changes one (with `id`). */
export function saveIncomeSource(db: Database, actor: Actor, input: unknown): ClientIncomeSource {
  const data = asObject(input)
  return db.transaction(() => {
    const { before, clientRef } = target(db, actor, 'client_income_sources', data, 'source of income')
    const changed = changes(data, before)
    const values: Row = {}
    if (before === null || changed('source_type')) {
      if (!INCOME_TYPES.includes(data.source_type as IncomeSourceType)) throw new UserFacingError('Choose the kind of income from the list.')
      values.source_type = data.source_type
    }
    if (before === null || changed('detail')) values.detail = textOrNull(data.detail, 'The detail', 60) ?? ''
    if (has(data, 'active')) {
      const active = data.active === true || data.active === 1 ? 1 : 0
      if (active !== ((before?.active as number | undefined) ?? -1)) values.active = active
    }
    const will = (key: string): unknown => (has(values, key) ? values[key] : (before?.[key] ?? null))
    const clash = db.prepare('SELECT 1 FROM client_income_sources WHERE client_ref = ? AND source_type = ? AND detail = ? AND id <> ?').get(clientRef, will('source_type'), will('detail') ?? '', before?.id ?? 0)
    if (clash) throw new UserFacingError('This client already has that source of income.')
    const id = persist(db, 'client_income_sources', before, values, { client_ref: clientRef, active: 1 })
    const after = db.prepare('SELECT * FROM client_income_sources WHERE id = ?').get(id) as Row
    auditSave(db, actor, 'client_income_sources', id, before, after, ['Added source of income', 'Updated source of income'], ['client_ref', 'source_type', 'detail'])
    return after as unknown as ClientIncomeSource
  })()
}

export function deleteIncomeSource(db: Database, actor: Actor, id: unknown): void {
  const rowId = idArg(id, 'source of income')
  db.transaction(() => {
    const before = db.prepare('SELECT * FROM client_income_sources WHERE id = ?').get(rowId) as Row | undefined
    if (!before) throw new UserFacingError('That source of income no longer exists.')
    clientForActor(db, before.client_ref as string, actor)
    db.prepare('DELETE FROM client_income_sources WHERE id = ?').run(rowId)
    writeAudit(db, actor, 'Removed source of income', 'client_income_sources', rowId, auditRow('client_income_sources', before), null)
  })()
}

// ── Links between clients ────────────────────────────────────────────────────

/** Links that read the same both ways round ("connected to", "spouse or partner", "group member"). */
export const SYMMETRIC_LINKS: ReadonlySet<string> = new Set(['connected_to', 'spouse_or_partner', 'group_member'])

/** Adds a link from one of the two clients' files (with `client_ref`), or changes one (with `id`). */
export function saveRelationship(db: Database, actor: Actor, input: unknown): ClientRelationship {
  const data = asObject(input)
  return db.transaction(() => {
    const clientRef = clientForActor(db, refArg(data.client_ref), actor).ref as string
    let before: Row | null = null
    if (data.id !== undefined && data.id !== null) {
      before = (db.prepare('SELECT * FROM client_relationships WHERE id = ?').get(idArg(data.id, 'link')) as Row | undefined) ?? null
      if (!before) throw new UserFacingError('That link no longer exists.')
      if (before.from_client_ref !== clientRef && before.to_client_ref !== clientRef) throw new UserFacingError('That link isn’t on this client’s file.')
    }
    const wasOutgoing = before ? before.from_client_ref === clientRef : true
    const otherBefore = before ? ((wasOutgoing ? before.to_client_ref : before.from_client_ref) as string) : null
    const other = has(data, 'other_client_ref') ? refArg(data.other_client_ref) : otherBefore
    if (!other) throw new UserFacingError('Choose the other client.')
    if (other === clientRef) throw new UserFacingError('A client can’t be linked to itself.')
    clientForActor(db, other, actor)
    const outgoing = has(data, 'direction') ? data.direction !== 'incoming' : wasOutgoing
    const type = (has(data, 'relationship_type') ? data.relationship_type : before?.relationship_type) as string | undefined
    if (typeof type !== 'string' || !type) throw new UserFacingError('Choose how they are linked.')
    if (!before || type !== before.relationship_type) {
      const known = db.prepare("SELECT 1 FROM lookup_values WHERE list_key = 'relationship_type' AND value_key = ? AND active = 1").get(type)
      if (!known) throw new UserFacingError('Choose how they are linked from the list.')
    }
    const values: Row = {
      from_client_ref: outgoing ? clientRef : other,
      to_client_ref: outgoing ? other : clientRef,
      relationship_type: type
    }
    if (has(data, 'basis') || !before) values.basis = textOrNull(data.basis, 'The basis', 200)
    const same = db.prepare('SELECT 1 FROM client_relationships WHERE from_client_ref = ? AND to_client_ref = ? AND relationship_type = ? AND id <> ?')
    const id0 = before?.id ?? 0
    if (same.get(values.from_client_ref, values.to_client_ref, type, id0) || (SYMMETRIC_LINKS.has(type) && same.get(values.to_client_ref, values.from_client_ref, type, id0))) {
      throw new UserFacingError('These two clients are already linked that way.')
    }
    const id = persist(db, 'client_relationships', before, values)
    const after = db.prepare('SELECT * FROM client_relationships WHERE id = ?').get(id) as Row
    auditSave(db, actor, 'client_relationships', id, before, after, ['Linked clients', 'Changed link between clients'], ['from_client_ref', 'to_client_ref', 'relationship_type'], { client_ref: clientRef })
    return listRelationships(db, actor, clientRef).find((r) => r.id === id)!
  })()
}

/** Removes a link, from the file of `clientRef` (one of its two clients). */
export function deleteRelationship(db: Database, actor: Actor, id: unknown, clientRef: unknown): void {
  const rowId = idArg(id, 'link')
  const ref = refArg(clientRef)
  db.transaction(() => {
    const before = db.prepare('SELECT * FROM client_relationships WHERE id = ?').get(rowId) as Row | undefined
    if (!before) throw new UserFacingError('That link no longer exists.')
    if (before.from_client_ref !== ref && before.to_client_ref !== ref) throw new UserFacingError('That link isn’t on this client’s file.')
    clientForActor(db, before.from_client_ref as string, actor)
    clientForActor(db, before.to_client_ref as string, actor)
    db.prepare('DELETE FROM client_relationships WHERE id = ?').run(rowId)
    writeAudit(db, actor, 'Removed link between clients', 'client_relationships', rowId, { client_ref: ref, ...auditRow('client_relationships', before) }, null)
  })()
}

// ── Other names ──────────────────────────────────────────────────────────────

const ALIAS_TYPES = Object.keys(ALIAS_TYPE_LABELS) as AliasType[]

/** Adds another name for a client (with `client_ref`) or changes one (with `id`). */
export function saveAlias(db: Database, actor: Actor, input: unknown): ClientAlias {
  const data = asObject(input)
  return db.transaction(() => {
    const { before, clientRef } = target(db, actor, 'client_aliases', data, 'other name')
    const changed = changes(data, before)
    const values: Row = {}
    if (before === null || changed('alias')) {
      const alias = textOrNull(data.alias, 'The name', 200)
      const norm = alias ? nameKey(alias) : null
      if (!alias || !norm) throw new UserFacingError('Write the other name.')
      const own = db.prepare('SELECT client_name FROM clients WHERE ref = ?').get(clientRef) as { client_name: string }
      if (nameKey(own.client_name) === norm) throw new UserFacingError('That’s the client’s own name.')
      const clash = db.prepare('SELECT 1 FROM client_aliases WHERE client_ref = ? AND alias_norm = ? AND id <> ?').get(clientRef, norm, before?.id ?? 0)
      if (clash) throw new UserFacingError('This client already has that name.')
      values.alias = alias
      values.alias_norm = norm
    }
    if (before === null || changed('alias_type')) {
      const type = data.alias_type ?? 'also_known_as'
      if (!ALIAS_TYPES.includes(type as AliasType)) throw new UserFacingError('Choose what kind of name it is from the list.')
      values.alias_type = type
    }
    const id = persist(db, 'client_aliases', before, values, { client_ref: clientRef })
    const after = db.prepare('SELECT * FROM client_aliases WHERE id = ?').get(id) as Row
    auditSave(db, actor, 'client_aliases', id, before, after, ['Added other name', 'Changed other name'], ['client_ref', 'alias'])
    return { id, client_ref: clientRef, alias: after.alias as string, alias_type: after.alias_type as string }
  })()
}

export function deleteAlias(db: Database, actor: Actor, id: unknown): void {
  const rowId = idArg(id, 'other name')
  db.transaction(() => {
    const before = db.prepare('SELECT * FROM client_aliases WHERE id = ?').get(rowId) as Row | undefined
    if (!before) throw new UserFacingError('That other name no longer exists.')
    clientForActor(db, before.client_ref as string, actor)
    db.prepare('DELETE FROM client_aliases WHERE id = ?').run(rowId)
    writeAudit(db, actor, 'Removed other name', 'client_aliases', rowId, auditRow('client_aliases', before), null)
  })()
}
