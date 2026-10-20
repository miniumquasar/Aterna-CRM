/**
 * Practice and client references and agent authorisations (migration 0011).
 *
 * Every function takes the database and the acting user, so the rules —
 * who may see and change what — live here and are tested here, not in the
 * IPC layer. Values are validated with the same functions the screens use
 * (src/shared/references.ts).
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type {
  AgentAuthorisation,
  AgentAuthorisationInput,
  AuthorisationWaitingRow,
  ClientIdentifier,
  ClientIdentifierInput,
  ClientReferenceSheet,
  CoreReference,
  PracticeIdentifier,
  PracticeIdentifierInput,
  PracticeIdentifierList,
  ReferenceMatch,
  UserRole
} from '../../shared/types'
import {
  AUTHORISATION_STATUSES,
  authorisationOverdue,
  authorisationService,
  checkCompanyNumber,
  checkNino,
  checkUtr,
  checkVatNumber,
  referenceKind,
  selfAssessmentPaymentReference,
  validateReference
} from '../../shared/references'

export interface Actor {
  id: number | null
  name: string | null
  role: UserRole
}

export type AuditFn = (action: string, table: string, recordId: string | number, oldValue?: unknown, newValue?: unknown) => void

/** An error whose message is written for the person using the app. */
export class UserFacingError extends Error {}

export const canManage = (actor: Actor): boolean => actor.role === 'partner' || actor.role === 'manager'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function dateOrNull(value: string | null | undefined, label: string): string | null {
  if (value === null || value === undefined || value === '') return null
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new UserFacingError(`${label} isn’t a valid date.`)
  return value
}

const textOrNull = (value: string | null | undefined, max = 2000): string | null => {
  const t = (value ?? '').trim()
  if (!t) return null
  if (t.length > max) throw new UserFacingError(`That text is longer than ${max} characters.`)
  return t
}

/** Local calendar date (the practice works in local time, not UTC). */
export const localToday = (now: Date = new Date()): string => {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Error && /UNIQUE constraint failed/i.test(err.message)

interface ClientRow {
  ref: string
  client_name: string
  client_category: string | null
  assigned_to: string | null
}

/** The client, if this person may work on it. Staff see their own clients only. */
export function clientForActor(db: Database, clientRef: string, actor: Actor): ClientRow {
  const row = db
    .prepare('SELECT ref, client_name, client_category, assigned_to FROM clients WHERE ref = ?')
    .get(clientRef) as ClientRow | undefined
  if (!row) throw new UserFacingError('That client no longer exists.')
  if (actor.role === 'staff' && row.assigned_to !== actor.name) {
    throw new UserFacingError('You can only work on references for clients assigned to you.')
  }
  return row
}

// ── Practice identifiers ────────────────────────────────────────────────────

interface PracticeRow {
  id: number
  kind: string
  value: string
  issuer: string | null
  context: string | null
  issued_on: string | null
  renewal_due: string | null
  warning: string | null
  notes: string | null
  updated_at: string
}

const toPractice = (r: PracticeRow): PracticeIdentifier => ({
  id: r.id,
  kind: r.kind,
  value: r.value,
  issuer: r.issuer,
  context: r.context,
  issuedOn: r.issued_on,
  renewalDue: r.renewal_due,
  warning: r.warning,
  notes: r.notes,
  updatedAt: r.updated_at
})

export function listPractice(db: Database, actor: Actor): PracticeIdentifierList {
  const rows = db.prepare('SELECT * FROM practice_identifiers ORDER BY kind, value').all() as PracticeRow[]
  return { items: rows.map(toPractice), canEdit: canManage(actor) }
}

export function savePractice(db: Database, input: PracticeIdentifierInput, actor: Actor, audit: AuditFn): PracticeIdentifier {
  if (!canManage(actor)) throw new UserFacingError('Only partners and managers can change practice details.')
  const kind = referenceKind(input.kind)
  if (!kind || kind.scope !== 'practice') throw new UserFacingError('That isn’t a practice reference type.')
  const checked = validateReference(kind.key, input.value)
  if (!checked.ok) throw new UserFacingError(checked.error)

  const fields = {
    issuer: textOrNull(input.issuer, 200),
    context: textOrNull(input.context, 200),
    issued_on: dateOrNull(input.issuedOn, 'Issue date'),
    renewal_due: dateOrNull(input.renewalDue, 'Renewal date'),
    warning: checked.warning ?? null,
    notes: textOrNull(input.notes)
  }

  return db.transaction((): PracticeIdentifier => {
    if (!kind.repeatable) {
      const other = db.prepare('SELECT id FROM practice_identifiers WHERE kind = ? AND id != ?').get(kind.key, input.id ?? -1)
      if (other) throw new UserFacingError(`Only one ${kind.label.toLowerCase()} is kept. Edit the existing one instead.`)
    }
    try {
      if (input.id) {
        const before = db.prepare('SELECT * FROM practice_identifiers WHERE id = ?').get(input.id) as PracticeRow | undefined
        if (!before) throw new UserFacingError('That entry no longer exists.')
        if (before.kind !== kind.key) throw new UserFacingError('The reference type of an existing entry can’t be changed.')
        db.prepare(
          `UPDATE practice_identifiers SET value = ?, issuer = ?, context = ?, issued_on = ?, renewal_due = ?, warning = ?, notes = ?,
             updated_at = datetime('now') WHERE id = ?`
        ).run(checked.value, fields.issuer, fields.context, fields.issued_on, fields.renewal_due, fields.warning, fields.notes, input.id)
        const after = db.prepare('SELECT * FROM practice_identifiers WHERE id = ?').get(input.id) as PracticeRow
        audit('Updated practice reference', 'practice_identifiers', input.id, toPractice(before), toPractice(after))
        return toPractice(after)
      }
      const res = db
        .prepare(
          `INSERT INTO practice_identifiers (kind, value, issuer, context, issued_on, renewal_due, warning, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(kind.key, checked.value, fields.issuer, fields.context, fields.issued_on, fields.renewal_due, fields.warning, fields.notes)
      const created = db.prepare('SELECT * FROM practice_identifiers WHERE id = ?').get(Number(res.lastInsertRowid)) as PracticeRow
      audit('Added practice reference', 'practice_identifiers', created.id, null, toPractice(created))
      return toPractice(created)
    } catch (err) {
      if (isUniqueViolation(err)) throw new UserFacingError('That reference is already recorded.')
      throw err
    }
  })()
}

export function deletePractice(db: Database, id: number, actor: Actor, audit: AuditFn): void {
  if (!canManage(actor)) throw new UserFacingError('Only partners and managers can change practice details.')
  const before = db.prepare('SELECT * FROM practice_identifiers WHERE id = ?').get(id) as PracticeRow | undefined
  if (!before) throw new UserFacingError('That entry no longer exists.')
  db.prepare('DELETE FROM practice_identifiers WHERE id = ?').run(id)
  audit('Deleted practice reference', 'practice_identifiers', id, toPractice(before), null)
}

// ── Client identifiers ──────────────────────────────────────────────────────

interface IdentifierRow {
  id: number
  client_ref: string
  kind: string
  value: string
  issuer: string | null
  context: string | null
  issued_on: string | null
  valid_to: string | null
  status: 'active' | 'closed'
  warning: string | null
  notes: string | null
  updated_at: string
}

const toIdentifier = (r: IdentifierRow): ClientIdentifier => ({
  id: r.id,
  clientRef: r.client_ref,
  kind: r.kind,
  value: r.value,
  issuer: r.issuer,
  context: r.context,
  issuedOn: r.issued_on,
  validTo: r.valid_to,
  status: r.status,
  warning: r.warning,
  notes: r.notes,
  updatedAt: r.updated_at
})

export function saveClientIdentifier(db: Database, input: ClientIdentifierInput, actor: Actor, audit: AuditFn): ClientIdentifier {
  const client = clientForActor(db, input.clientRef, actor)
  const kind = referenceKind(input.kind)
  if (!kind || kind.scope !== 'client') throw new UserFacingError('That isn’t a client reference type.')
  const checked = validateReference(kind.key, input.value)
  if (!checked.ok) throw new UserFacingError(checked.error)
  const status = input.status ?? 'active'
  if (status !== 'active' && status !== 'closed') throw new UserFacingError('Status must be active or closed.')

  const fields = {
    issuer: textOrNull(input.issuer, 200),
    context: textOrNull(input.context, 200),
    issued_on: dateOrNull(input.issuedOn, 'Issue date'),
    valid_to: dateOrNull(input.validTo, 'Valid-to date'),
    warning: checked.warning ?? null,
    notes: textOrNull(input.notes)
  }

  return db.transaction((): ClientIdentifier => {
    if (!kind.repeatable) {
      const other = db
        .prepare('SELECT id FROM client_identifiers WHERE client_ref = ? AND kind = ? AND id != ?')
        .get(client.ref, kind.key, input.id ?? -1)
      if (other) throw new UserFacingError(`This client already has a ${kind.label.toLowerCase()}. Edit that one instead.`)
    }
    try {
      if (input.id) {
        const before = db.prepare('SELECT * FROM client_identifiers WHERE id = ?').get(input.id) as IdentifierRow | undefined
        if (!before || before.client_ref !== client.ref) throw new UserFacingError('That entry no longer exists.')
        if (before.kind !== kind.key) throw new UserFacingError('The reference type of an existing entry can’t be changed.')
        db.prepare(
          `UPDATE client_identifiers SET value = ?, issuer = ?, context = ?, issued_on = ?, valid_to = ?, status = ?, warning = ?, notes = ?,
             updated_at = datetime('now') WHERE id = ?`
        ).run(checked.value, fields.issuer, fields.context, fields.issued_on, fields.valid_to, status, fields.warning, fields.notes, input.id)
        const after = db.prepare('SELECT * FROM client_identifiers WHERE id = ?').get(input.id) as IdentifierRow
        audit('Updated client reference', 'client_identifiers', input.id, toIdentifier(before), toIdentifier(after))
        return toIdentifier(after)
      }
      const res = db
        .prepare(
          `INSERT INTO client_identifiers (client_ref, kind, value, issuer, context, issued_on, valid_to, status, warning, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(client.ref, kind.key, checked.value, fields.issuer, fields.context, fields.issued_on, fields.valid_to, status, fields.warning, fields.notes)
      const created = db.prepare('SELECT * FROM client_identifiers WHERE id = ?').get(Number(res.lastInsertRowid)) as IdentifierRow
      audit('Added client reference', 'client_identifiers', created.id, null, toIdentifier(created))
      return toIdentifier(created)
    } catch (err) {
      if (isUniqueViolation(err)) throw new UserFacingError('This client already has that reference.')
      throw err
    }
  })()
}

export function deleteClientIdentifier(db: Database, id: number, actor: Actor, audit: AuditFn): void {
  const before = db.prepare('SELECT * FROM client_identifiers WHERE id = ?').get(id) as IdentifierRow | undefined
  if (!before) throw new UserFacingError('That entry no longer exists.')
  clientForActor(db, before.client_ref, actor)
  db.prepare('DELETE FROM client_identifiers WHERE id = ?').run(id)
  audit('Deleted client reference', 'client_identifiers', id, toIdentifier(before), null)
}

// ── Agent authorisations ────────────────────────────────────────────────────

interface AuthorisationRow {
  id: number
  client_ref: string
  service: string
  method: string | null
  status: AgentAuthorisation['status']
  requested_on: string | null
  authorised_on: string | null
  expires_on: string | null
  removed_on: string | null
  notes: string | null
  updated_by: string | null
  updated_at: string
}

const toAuthorisation = (r: AuthorisationRow, today: string): AgentAuthorisation => ({
  id: r.id,
  clientRef: r.client_ref,
  service: r.service,
  method: r.method,
  status: r.status,
  requestedOn: r.requested_on,
  authorisedOn: r.authorised_on,
  expiresOn: r.expires_on,
  removedOn: r.removed_on,
  notes: r.notes,
  updatedBy: r.updated_by,
  updatedAt: r.updated_at,
  overdue: authorisationOverdue(r.status, r.expires_on, today)
})

export function saveAuthorisation(
  db: Database,
  input: AgentAuthorisationInput,
  actor: Actor,
  audit: AuditFn,
  today: string = localToday()
): AgentAuthorisation {
  const client = clientForActor(db, input.clientRef, actor)
  const service = authorisationService(input.service)
  if (!service) throw new UserFacingError('Unknown service.')
  if (!(AUTHORISATION_STATUSES as readonly string[]).includes(input.status)) throw new UserFacingError('Unknown status.')
  const method = input.method ?? null
  if (method !== null && !(service.methods as readonly string[]).includes(method)) {
    throw new UserFacingError(`That method isn’t used for ${service.label}.`)
  }

  let authorisedOn = dateOrNull(input.authorisedOn, 'Authorised date')
  let removedOn = dateOrNull(input.removedOn, 'Removed date')
  const requestedOn = dateOrNull(input.requestedOn, 'Requested date')
  const expiresOn = dateOrNull(input.expiresOn, 'Expiry date')
  if (input.status === 'active' && !authorisedOn) authorisedOn = today
  if (input.status === 'removed' && !removedOn) removedOn = today
  if (requestedOn && expiresOn && expiresOn < requestedOn) throw new UserFacingError('The expiry date is before the request date.')

  return db.transaction((): AgentAuthorisation => {
    const before = db
      .prepare('SELECT * FROM agent_authorisations WHERE client_ref = ? AND service = ?')
      .get(client.ref, service.key) as AuthorisationRow | undefined
    db.prepare(
      `INSERT INTO agent_authorisations (client_ref, service, method, status, requested_on, authorised_on, expires_on, removed_on, notes, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (client_ref, service) DO UPDATE SET
         method = excluded.method, status = excluded.status, requested_on = excluded.requested_on,
         authorised_on = excluded.authorised_on, expires_on = excluded.expires_on, removed_on = excluded.removed_on,
         notes = excluded.notes, updated_by = excluded.updated_by, updated_at = datetime('now')`
    ).run(client.ref, service.key, method, input.status, requestedOn, authorisedOn, expiresOn, removedOn, textOrNull(input.notes), actor.name)
    const after = db
      .prepare('SELECT * FROM agent_authorisations WHERE client_ref = ? AND service = ?')
      .get(client.ref, service.key) as AuthorisationRow
    audit(
      before ? 'Updated agent authorisation' : 'Added agent authorisation',
      'agent_authorisations',
      after.id,
      before ? toAuthorisation(before, today) : null,
      toAuthorisation(after, today)
    )
    return toAuthorisation(after, today)
  })()
}

/** Requests and posted codes still waiting on clients, soonest expiry first. Staff: their own clients. */
export function waitingAuthorisations(db: Database, actor: Actor, today: string = localToday()): AuthorisationWaitingRow[] {
  const rows = db
    .prepare(
      `SELECT a.*, c.client_name FROM agent_authorisations a JOIN clients c ON c.ref = a.client_ref
       WHERE a.status IN ('requested', 'code_posted') AND (? = 0 OR c.assigned_to = ?)
       ORDER BY a.expires_on IS NULL, a.expires_on, c.client_name`
    )
    .all(actor.role === 'staff' ? 1 : 0, actor.name) as Array<AuthorisationRow & { client_name: string }>
  return rows.map((r) => ({ ...toAuthorisation(r, today), clientName: r.client_name }))
}

// ── The client reference sheet ──────────────────────────────────────────────

const COMPANY_LIKE = new Set(['company', 'llp', 'limited_partnership'])

interface CoreSpec {
  key: string
  label: string
  column: string
  secret?: boolean
  when: (category: string | null) => boolean
}

const any = (): boolean => true
const CORE: readonly CoreSpec[] = [
  { key: 'reg_no', label: 'Company number', column: 'reg_no', when: (c) => c === null || COMPANY_LIKE.has(c) || c === 'charity' },
  { key: 'auth_code', label: 'Companies House authentication code', column: 'auth_code', secret: true, when: (c) => c === null || COMPANY_LIKE.has(c) },
  { key: 'ct_ref', label: 'Corporation Tax UTR', column: 'ct_ref', when: (c) => c === null || c === 'company' || c === 'charity' },
  { key: 'utr', label: 'Self Assessment UTR', column: 'utr', when: (c) => c === null || !COMPANY_LIKE.has(c) },
  { key: 'partnership_utr', label: 'Partnership UTR', column: 'partnership_utr', when: (c) => c === null || c === 'partnership' || c === 'llp' || c === 'limited_partnership' },
  { key: 'nino', label: 'National Insurance number', column: 'nino', secret: true, when: (c) => c === null || c === 'individual' || c === 'sole_trader' },
  { key: 'vat_no', label: 'VAT number', column: 'vat_no', when: any },
  { key: 'paye_ref', label: 'Employer PAYE reference', column: 'paye_ref', when: any },
  { key: 'charity_number', label: 'Charity number', column: 'charity_number', when: (c) => c === null || c === 'charity' || c === 'company' }
]

export function clientSheet(db: Database, clientRef: string, actor: Actor): Omit<ClientReferenceSheet, 'credentials'> {
  const client = clientForActor(db, clientRef, actor)
  const today = localToday()
  const row = db.prepare(`SELECT ${CORE.map((c) => c.column).join(', ')} FROM clients WHERE ref = ?`).get(client.ref) as Record<string, string | null>

  const core: CoreReference[] = CORE.filter((c) => c.when(client.client_category)).map((c) => ({
    key: c.key,
    label: c.label,
    value: row[c.column] ? String(row[c.column]) : null,
    secret: c.secret ?? false,
    source: 'Client record'
  }))

  const aor = db
    .prepare("SELECT accounts_office_ref FROM payroll_schemes WHERE client_ref = ? AND accounts_office_ref IS NOT NULL AND accounts_office_ref != '' ORDER BY id LIMIT 1")
    .get(client.ref) as { accounts_office_ref: string } | undefined
  core.push({ key: 'accounts_office_ref', label: 'Accounts Office reference', value: aor?.accounts_office_ref ?? null, secret: false, source: 'Payroll register' })

  const letter = db
    .prepare("SELECT letter_code FROM pension_schemes WHERE client_ref = ? AND letter_code IS NOT NULL AND letter_code != '' ORDER BY id LIMIT 1")
    .get(client.ref) as { letter_code: string } | undefined
  core.push({ key: 'tpr_letter_code', label: 'Pensions Regulator letter code', value: letter?.letter_code ?? null, secret: false, source: 'Pension register' })

  if (client.client_category === null || COMPANY_LIKE.has(client.client_category)) {
    const codes = db
      .prepare(
        `SELECT COUNT(*) AS people, SUM(CASE WHEN ch_personal_code IS NOT NULL AND ch_personal_code != '' THEN 1 ELSE 0 END) AS coded
         FROM client_contacts WHERE client_ref = ? AND contact_type IN ('director', 'psc', 'member', 'designated_member')`
      )
      .get(client.ref) as { people: number; coded: number | null }
    core.push({
      key: 'personal_codes',
      label: 'Companies House personal codes',
      value: codes.people ? `${codes.coded ?? 0} of ${codes.people} people` : null,
      secret: false,
      source: 'Contacts'
    })
  }

  const derived: ClientReferenceSheet['derived'] = []
  const sa = selfAssessmentPaymentReference(row.utr)
  if (sa) derived.push({ label: 'Self Assessment payment reference', value: sa, note: 'The UTR followed by K, for every Self Assessment payment.' })

  const identifiers = (db
    .prepare('SELECT * FROM client_identifiers WHERE client_ref = ? ORDER BY status, kind, value')
    .all(client.ref) as IdentifierRow[]).map(toIdentifier)
  const authorisations = (db
    .prepare('SELECT * FROM agent_authorisations WHERE client_ref = ? ORDER BY service')
    .all(client.ref) as AuthorisationRow[]).map((r) => toAuthorisation(r, today))

  return {
    client: { ref: client.ref, name: client.client_name, category: client.client_category },
    core,
    derived,
    identifiers,
    authorisations,
    canEdit: true, // clientForActor has already refused anyone who may not work on this client
    canReveal: canManage(actor)
  }
}

// ── Reverse lookup: whose reference is this? ────────────────────────────────

const CORE_SEARCH: ReadonlyArray<{ column: string; kind: string; normalise: (v: string) => string | null }> = [
  { column: 'utr', kind: 'Self Assessment UTR', normalise: (v) => (checkUtr(v).ok ? (checkUtr(v) as { value: string }).value : null) },
  { column: 'ct_ref', kind: 'Corporation Tax UTR', normalise: (v) => (checkUtr(v).ok ? (checkUtr(v) as { value: string }).value : null) },
  { column: 'partnership_utr', kind: 'Partnership UTR', normalise: (v) => (checkUtr(v).ok ? (checkUtr(v) as { value: string }).value : null) },
  { column: 'vat_no', kind: 'VAT number', normalise: (v) => (checkVatNumber(v).ok ? (checkVatNumber(v) as { value: string }).value : null) },
  { column: 'reg_no', kind: 'Company number', normalise: (v) => (checkCompanyNumber(v).ok ? (checkCompanyNumber(v) as { value: string }).value : null) },
  { column: 'nino', kind: 'National Insurance number', normalise: (v) => (checkNino(v).ok ? (checkNino(v) as { value: string }).value : null) },
  { column: 'paye_ref', kind: 'Employer PAYE reference', normalise: (v) => v.replace(/\s+/g, '').toUpperCase() }
]

const squash = (sqlColumn: string): string => `REPLACE(REPLACE(UPPER(${sqlColumn}), ' ', ''), '-', '')`

/**
 * Finds the client a reference belongs to — the core columns (compared after
 * tidying, so "GB 123 4567 82" finds 123456782) and every client identifier.
 */
export function findReferences(db: Database, query: string, actor: Actor): ReferenceMatch[] {
  const raw = (query ?? '').trim()
  if (raw.length < 4) return []
  const scoped = actor.role === 'staff' ? 1 : 0
  const matches: ReferenceMatch[] = []

  for (const spec of CORE_SEARCH) {
    const wanted = spec.normalise(raw)
    if (!wanted) continue
    const column = spec.column === 'vat_no' ? `REPLACE(${squash('vat_no')}, 'GB', '')` : squash(spec.column)
    const rows = db
      .prepare(`SELECT ref, client_name, ${spec.column} AS value FROM clients WHERE ${column} = ? AND (? = 0 OR assigned_to = ?) LIMIT 20`)
      .all(wanted.replace(/\s+/g, ''), scoped, actor.name) as Array<{ ref: string; client_name: string; value: string }>
    for (const r of rows) matches.push({ clientRef: r.ref, clientName: r.client_name, kind: spec.kind, value: r.value })
  }

  const compact = raw.replace(/[\s-]+/g, '').toUpperCase()
  const rows = db
    .prepare(
      `SELECT i.client_ref, c.client_name, i.kind, i.value FROM client_identifiers i JOIN clients c ON c.ref = i.client_ref
       WHERE ${squash('i.value')} = ? AND (? = 0 OR c.assigned_to = ?) LIMIT 20`
    )
    .all(compact, scoped, actor.name) as Array<{ client_ref: string; client_name: string; kind: string; value: string }>
  for (const r of rows) {
    matches.push({ clientRef: r.client_ref, clientName: r.client_name, kind: referenceKind(r.kind)?.label ?? r.kind, value: r.value })
  }
  return matches
}
