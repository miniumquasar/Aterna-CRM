/**
 * References kept as entered, and flagged.
 *
 * The practice's rule: a reference that fails its check (a UTR whose check
 * digit is wrong, a PAYE reference with no office number) is saved as it was
 * typed, never refused, and an issue is raised so it isn't forgotten. The
 * practice may hold the reference HMRC actually uses, or need to keep a wrong
 * one until the right one arrives.
 *
 *   one flag a place  the issue key names the table, the row (for a list saved
 *                     as a whole, the person) and the column, so saving the same
 *                     wrong value again doesn't add another issue
 *   closes itself     when the value is corrected or cleared, or its row is
 *                     removed, the flag is resolved; so is the workbook import's
 *                     own issue for that kind of reference, once nothing on the
 *                     client fails that check any more
 *   accepted stays    a flag accepted as a risk stays accepted while the value
 *                     stays the same; a new value that fails opens it again
 *   no numbers        the issue says what fails and where, and never repeats a
 *                     UTR or National Insurance number (a PAYE scheme is named
 *                     by its employer reference, so it can be found)
 *   audit             every flag raised or closed is in the audit log, in the
 *                     same transaction as the change that caused it
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import {
  checkAccountsOfficeReference, checkCompanyNumber, checkNino, checkPayeReference, checkUtr, checkVatNumber, type ReferenceCheckResult
} from '../../shared/references'
import { writeAudit, type Row } from '../access/audit'
import type { Actor } from '../access/policy'

/** data_issues.source for a flag raised here. */
export const ENTERED_IN_APP = 'Entered in the app'

/** data_issues.issue_type for a reference that fails its check (the import's is "import:invalid_identifier"). */
export const INVALID_REFERENCE = 'invalid_identifier'

export interface FlagPlace {
  table: string
  /** The row's id, or for a person on a list saved as a whole, a key for the person. */
  key: string | number
  field: string
  clientRef: string | null
  /** Names the reference in the issue: "UTR on the client record". */
  label: string
  /** Who issues the reference, for the suggested action. */
  issuer?: string
}

export const flagKey = (p: Pick<FlagPlace, 'table' | 'key' | 'field'>): string => `entered:${p.table}:${p.key}:${p.field}`

const UNRESOLVED = new Set(['open', 'in_progress'])

function resolveRow(db: Database, actor: Actor, row: Row, why: string): void {
  db.prepare(`UPDATE data_issues SET status = 'resolved', resolved_at = datetime('now'), resolved_by = ?, updated_at = datetime('now')
    WHERE id = ?`).run(actor.name, row.id)
  writeAudit(db, actor, 'Closed a flagged reference', 'data_issues', row.id as number,
    { client_ref: row.client_ref ?? null, issue_key: row.issue_key, status: row.status },
    { client_ref: row.client_ref ?? null, issue_key: row.issue_key, status: 'resolved', why })
}

/**
 * Raises, updates or closes the flag on one reference, after it was saved.
 * `problem` is why the saved value fails its check (null when it passes or is
 * empty); `changed` says whether this save changed the value.
 */
export function settleReferenceFlag(db: Database, actor: Actor, place: FlagPlace, problem: string | null, changed = true): void {
  const key = flagKey(place)
  const row = db.prepare('SELECT * FROM data_issues WHERE issue_key = ?').get(key) as Row | undefined
  if (!problem) {
    if (row && UNRESOLVED.has(String(row.status))) resolveRow(db, actor, row, 'The reference now passes its check, or was cleared.')
    return
  }
  const description = `${place.label}: ${problem}`
  const action = `Check it against ${place.issuer ?? 'HMRC'}’s letters and correct it. This closes by itself once it passes the check.`
  if (!row) {
    const id = Number(db.prepare(`INSERT INTO data_issues (issue_key, severity, issue_type, entity_table, client_ref, field, description,
        suggested_action, status, source) VALUES (?, 'medium', ?, ?, ?, ?, ?, ?, 'open', ?)`)
      .run(key, INVALID_REFERENCE, place.table, place.clientRef, place.field, description, action, ENTERED_IN_APP).lastInsertRowid)
    writeAudit(db, actor, 'Flagged a reference', 'data_issues', id, null,
      { client_ref: place.clientRef, issue_key: key, field: place.field, description, status: 'open' })
    return
  }
  const unresolved = UNRESOLVED.has(String(row.status))
  if (!unresolved && !changed) return // closed or accepted by someone, and the value hasn't changed since
  if (unresolved && row.description === description && row.client_ref === place.clientRef) return
  const status = unresolved ? String(row.status) : 'open'
  db.prepare(`UPDATE data_issues SET status = ?, description = ?, suggested_action = ?, client_ref = ?, resolved_at = NULL, resolved_by = NULL,
      updated_at = datetime('now') WHERE id = ?`).run(status, description, action, place.clientRef, row.id)
  writeAudit(db, actor, 'Flagged a reference', 'data_issues', row.id as number,
    { client_ref: row.client_ref ?? null, issue_key: key, description: row.description, status: row.status },
    { client_ref: place.clientRef, issue_key: key, description, status })
}

/** Closes the open flags on a row that was removed (every column of it). */
export function closeFlagsOfRow(db: Database, actor: Actor, table: string, key: string | number, why: string): void {
  const prefix = `entered:${table}:${key}:`
  const rows = db.prepare(`SELECT * FROM data_issues WHERE substr(issue_key, 1, ?) = ? AND status IN ('open', 'in_progress')`)
    .all(prefix.length, prefix) as Row[]
  for (const row of rows) resolveRow(db, actor, row, why)
}

/**
 * For a list saved as a whole (partners, trustees): closes the client's open
 * flags on that table whose place isn't among `keep`.
 */
export function closeOtherFlags(db: Database, actor: Actor, table: string, clientRef: string, keep: ReadonlySet<string>, why: string): void {
  const rows = db.prepare(`SELECT * FROM data_issues WHERE source = ? AND entity_table = ? AND client_ref = ? AND status IN ('open', 'in_progress')`)
    .all(ENTERED_IN_APP, table, clientRef) as Row[]
  for (const row of rows) if (!keep.has(String(row.issue_key))) resolveRow(db, actor, row, why)
}

// ── The workbook import's own issues ────────────────────────────────────────

export type ReferenceKind = 'utr' | 'ct_utr' | 'vat' | 'crn' | 'nino' | 'paye' | 'ao'

/** Where each kind of reference is held for a client, and the import's name for it (data_issues.field). */
const KINDS: Record<ReferenceKind, { importField: string; check: (raw: string) => ReferenceCheckResult; held: readonly string[] }> = {
  utr: { importField: 'UTR', check: checkUtr, held: ['SELECT utr AS v FROM clients WHERE ref = ?', 'SELECT utr AS v FROM sa_registrations WHERE client_ref = ?'] },
  ct_utr: { importField: 'CT_UTR', check: checkUtr, held: ['SELECT ct_ref AS v FROM clients WHERE ref = ?'] },
  vat: { importField: 'VAT_REG_NO', check: checkVatNumber, held: ['SELECT vat_no AS v FROM clients WHERE ref = ?'] },
  crn: { importField: 'CRN', check: checkCompanyNumber, held: ['SELECT reg_no AS v FROM clients WHERE ref = ?'] },
  nino: { importField: 'NINO', check: checkNino, held: ['SELECT nino AS v FROM clients WHERE ref = ?'] },
  paye: {
    importField: 'PAYE_REFERENCE', check: checkPayeReference,
    held: ['SELECT paye_ref AS v FROM clients WHERE ref = ?', 'SELECT paye_reference AS v FROM payroll_schemes WHERE client_ref = ?']
  },
  ao: { importField: 'ACCOUNTS_OFFICE_REF', check: checkAccountsOfficeReference, held: ['SELECT accounts_office_ref AS v FROM payroll_schemes WHERE client_ref = ?'] }
}

/** Whether any reference of this kind held for the client fails its check. */
export function clientHasFailing(db: Database, clientRef: string, kind: ReferenceKind): boolean {
  const { check, held } = KINDS[kind]
  return held.some((sql) =>
    (db.prepare(sql).all(clientRef) as Array<{ v: unknown }>).some((r) => typeof r.v === 'string' && r.v.trim() !== '' && !check(r.v).ok)
  )
}

/**
 * After a reference of this kind was corrected (or entered for the first time)
 * on a client: closes the workbook import's issue about it, once nothing of
 * that kind on the client fails its check.
 */
export function closeImportFlags(db: Database, actor: Actor, clientRef: string, kind: ReferenceKind): void {
  if (clientHasFailing(db, clientRef, kind)) return
  const rows = db.prepare(`SELECT * FROM data_issues WHERE client_ref = ? AND issue_type = ? AND field = ? AND status IN ('open', 'in_progress')`)
    .all(clientRef, `import:${INVALID_REFERENCE}`, KINDS[kind].importField) as Row[]
  for (const row of rows) resolveRow(db, actor, row, 'A reference that passes its check was entered in the app.')
}

/** The client record's references: the column, its name, how the issue names it, its check and its kind. */
export const CLIENT_REFERENCE_COLUMNS: ReadonlyArray<{
  column: string; name: string; label: string; check: (raw: string) => ReferenceCheckResult; kind: ReferenceKind | null; issuer: string
}> = [
  { column: 'utr', name: 'The UTR', label: 'UTR on the client record', check: checkUtr, kind: 'utr', issuer: 'HMRC' },
  { column: 'ct_ref', name: 'The Corporation Tax UTR', label: 'Corporation Tax UTR on the client record', check: checkUtr, kind: 'ct_utr', issuer: 'HMRC' },
  { column: 'partnership_utr', name: 'The partnership UTR', label: 'Partnership UTR on the client record', check: checkUtr, kind: null, issuer: 'HMRC' },
  { column: 'vat_no', name: 'The VAT number', label: 'VAT number on the client record', check: checkVatNumber, kind: 'vat', issuer: 'HMRC' },
  { column: 'reg_no', name: 'The company number', label: 'Company number on the client record', check: checkCompanyNumber, kind: 'crn', issuer: 'Companies House' },
  { column: 'nino', name: 'The National Insurance number', label: 'National Insurance number on the client record', check: checkNino, kind: 'nino', issuer: 'HMRC' },
  { column: 'paye_ref', name: 'The employer PAYE reference', label: 'Employer PAYE reference on the client record', check: checkPayeReference, kind: 'paye', issuer: 'HMRC' }
]
