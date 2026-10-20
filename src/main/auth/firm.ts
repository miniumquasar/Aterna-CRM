/**
 * The firm's own details (the firm table: one row): name, address, contact
 * details and references. They appear on reports, the recovery sheet and
 * emails, and the name in the title bar until a licence names the firm.
 *
 * Saved from Settings → Firm details by a partner or manager, or by the
 * setup wizard before anyone can sign in (a new installation; recorded as
 * the app's own change). Fields a form leaves out keep their value. Every
 * save is recorded with the values it replaced. A reference that doesn't
 * pass its check (company number, VAT number, UTR, PAYE reference) is kept,
 * with a note and a data issue that resolves itself when it is corrected.
 */
import {
  FIRM_FIELDS,
  FIRM_FIELD_LABELS,
  FIRM_REFERENCE_FIELDS,
  checkFirmField,
  type FirmDetails,
  type FirmField,
  type FirmView
} from '@shared/contracts/auth'
import { roleAtLeast, type Actor } from '@shared/domain/roles'
import { changedFields, recordChange } from '../access/audit'
import { raiseIssue, resolveIssue } from '../access/issues'
import { requireRole } from '../access/policy'
import type { Db } from '../db/connection'
import { invalid } from '../ipc/errors'
import { record } from '../ipc/input'

const COLUMN: Record<FirmField, string> = {
  name: 'name',
  tradingName: 'trading_name',
  addressLine1: 'address_line1',
  addressLine2: 'address_line2',
  town: 'town',
  county: 'county',
  postcode: 'postcode',
  country: 'country',
  email: 'email',
  phone: 'phone',
  website: 'website',
  companyNumber: 'company_number',
  vatNumber: 'vat_number',
  utr: 'utr',
  payeRef: 'paye_ref'
}

type FirmRow = Record<string, string | null>

export function readFirm(db: Db): FirmDetails | null {
  const row = db.prepare('SELECT * FROM firm WHERE id = 1').get() as FirmRow | undefined
  if (!row) return null
  const details = Object.fromEntries(FIRM_FIELDS.map((f) => [f, row[COLUMN[f]] ?? null])) as Record<FirmField, string | null>
  return { ...details, name: details.name ?? '', country: details.country ?? 'United Kingdom', updatedAt: row.updated_at ?? null }
}

/** The firm's name, or null when none has been saved. */
export function firmName(db: Db): string | null {
  const row = db.prepare('SELECT name FROM firm WHERE id = 1').get() as { name: string } | undefined
  return row?.name?.trim() || null
}

/** The notes for stored references that don't pass their check. */
export function firmWarnings(details: FirmDetails | null): FirmView['warnings'] {
  const warnings: FirmView['warnings'] = {}
  if (!details) return warnings
  for (const field of FIRM_FIELDS) {
    const check = checkFirmField(field, details[field], details.country)
    if (check.warning) warnings[field] = check.warning
  }
  return warnings
}

export function firmView(db: Db, actor: Actor | null): FirmView {
  const details = readFirm(db)
  return { details, warnings: firmWarnings(details), canEdit: actor ? roleAtLeast(actor.role, 'manager') : true }
}

const snake = (field: FirmField): string => COLUMN[field]

/** How each reference reads inside a sentence. */
const IN_SENTENCE: Partial<Record<FirmField, string>> = {
  companyNumber: 'company number',
  vatNumber: 'VAT number',
  utr: 'Corporation Tax UTR',
  payeRef: 'employer PAYE reference'
}

/** Raises or resolves the data issue for each of the firm's references. */
function syncReferenceIssues(db: Db, details: FirmDetails, actorId: number | null, now: Date): void {
  for (const field of FIRM_REFERENCE_FIELDS) {
    const key = `firm:${field}`
    const check = checkFirmField(field, details[field], details.country)
    if (details[field] && check.warning) {
      raiseIssue(
        db,
        {
          dedupeKey: key,
          source: 'reference_check',
          kind: `firm_${snake(field)}_check`,
          severity: 'warning',
          title: `The firm’s ${IN_SENTENCE[field] ?? FIRM_FIELD_LABELS[field]} doesn’t pass its check`,
          detail: check.warning,
          entity: 'firm',
          entityId: 1,
          field: snake(field)
        },
        now
      )
    } else {
      resolveIssue(db, key, actorId, now)
    }
  }
}

export interface SaveFirmOptions {
  /** The audit entry's summary, when the caller knows better ('Named the firm'). */
  summary?: string
}

/**
 * Saves the firm's details. `actor` is the person signed in, or null only
 * while a new installation is being set up and nobody can sign in yet (the
 * caller checks that). Returns the saved view.
 */
export function saveFirm(db: Db, actor: Actor | null, input: unknown, now: Date = new Date(), options: SaveFirmOptions = {}): FirmView {
  if (actor) requireRole(actor, 'manager', 'change the firm’s details')
  const body = record(input)
  const existing = readFirm(db)
  const has = (f: FirmField): boolean => Object.prototype.hasOwnProperty.call(body, f)
  if (!has('name')) throw invalid('Enter the firm’s name.', 'name')
  const country = has('country') ? checkFirmField('country', body.country as string | null).value : (existing?.country ?? 'United Kingdom')

  const next: Record<FirmField, string | null> = Object.fromEntries(FIRM_FIELDS.map((f) => [f, existing ? existing[f] : f === 'country' ? 'United Kingdom' : null])) as Record<
    FirmField,
    string | null
  >
  for (const field of FIRM_FIELDS) {
    if (!has(field)) continue
    const raw = body[field]
    if (raw !== null && raw !== undefined && typeof raw !== 'string') throw invalid(`${FIRM_FIELD_LABELS[field]} must be text.`, field)
    const check = checkFirmField(field, raw as string | null | undefined, country)
    if (check.problem) throw invalid(check.problem, field)
    next[field] = check.value
  }
  next.country = next.country ?? 'United Kingdom'

  const before = existing ? (Object.fromEntries(FIRM_FIELDS.map((f) => [f, existing[f]])) as Record<string, unknown>) : null
  const diff = changedFields(before, next)
  if (existing && Object.keys(diff).length === 0) return firmView(db, actor)

  return db.transaction((): FirmView => {
    const at = now.toISOString()
    const columns = FIRM_FIELDS.map((f) => COLUMN[f])
    const values = FIRM_FIELDS.map((f) => next[f])
    db.prepare(
      `INSERT INTO firm (id, ${columns.join(', ')}, created_at, updated_at, updated_by) VALUES (1, ${columns.map(() => '?').join(', ')}, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET ${columns.map((c) => `${c} = excluded.${c}`).join(', ')}, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).run(...values, at, at, actor?.id ?? null)
    const saved = readFirm(db) as FirmDetails
    const summary = options.summary ?? (existing ? 'Changed the firm’s details' : actor ? 'Added the firm’s details' : 'Added the firm’s details while setting up')
    recordChange(
      db,
      actor,
      {
        action: 'firm.update',
        entity: 'firm',
        entityId: 1,
        summary,
        before: existing ? Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.before])) : undefined,
        after: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.after]))
      },
      now
    )
    syncReferenceIssues(db, saved, actor?.id ?? null, now)
    return firmView(db, actor)
  })()
}
