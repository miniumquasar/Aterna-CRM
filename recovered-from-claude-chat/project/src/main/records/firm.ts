/**
 * The firm's own details (firm_data: one row): name, address, contact details
 * and registration number. They appear on reports, the recovery sheet and
 * emails.
 *
 * Saved from Settings by a partner or manager, or by the setup wizard before
 * anyone can sign in (a new installation). Every save is recorded with the
 * values it replaced.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { FirmData } from '../../shared/types'
import { auditChanges, writeAudit, type Row } from '../access/audit'
import { requireManager, UserFacingError, type Actor } from '../access/policy'
import { textOrNull } from './common'

export function firmDetails(db: Database): FirmData | null {
  return (db.prepare('SELECT * FROM firm_data ORDER BY id ASC LIMIT 1').get() as FirmData | undefined) ?? null
}

/** The firm's name, or null when none has been saved. */
export function firmName(db: Database): string | null {
  return firmDetails(db)?.name?.trim() || null
}

/**
 * Saves the firm's details. `actor` is the person signed in; null only while a
 * new installation is being set up and nobody can sign in yet (the caller
 * checks that).
 */
export function saveFirm(db: Database, actor: Actor | null, input: unknown): FirmData {
  if (actor) requireManager(actor, 'change the firm’s details')
  const data = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const name = textOrNull(data.name, 'The firm’s name', 200)
  if (!name) throw new UserFacingError('Enter the firm’s name.')
  const email = textOrNull(data.email, 'The email address', 200)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserFacingError('The email address doesn’t look right.')
  const existing = firmDetails(db)
  // Fields a form leaves out keep what was there (the setup wizard asks for fewer than Settings).
  const keep = (key: string, label: string, max: number): string | null =>
    key in data ? textOrNull(data[key], label, max) : ((existing as unknown as Row | null)?.[key] as string | null) ?? null
  const values = [
    name,
    keep('registration_number', 'The registration number', 40),
    keep('address_line1', 'The address', 200),
    keep('address_line2', 'The address', 200),
    keep('city', 'The town or city', 100),
    keep('postcode', 'The postcode', 20),
    keep('country', 'The country', 100),
    'email' in data ? email : (existing?.email ?? null),
    keep('phone', 'The phone number', 40),
    keep('time_zone', 'The time zone', 60) ?? 'Europe/London',
    keep('locale', 'The locale', 20) ?? 'en-GB',
    keep('logo_path', 'The logo', 500),
    data.is_active === false ? 0 : 1
  ]
  return db.transaction((): FirmData => {
    if (existing) {
      db.prepare(`UPDATE firm_data SET
          name = ?, registration_number = ?, address_line1 = ?, address_line2 = ?, city = ?, postcode = ?, country = ?,
          email = ?, phone = ?, time_zone = ?, locale = ?, logo_path = ?, is_active = ?, updated_at = datetime('now')
        WHERE id = ?`).run(...values, existing.id)
    } else {
      db.prepare(`INSERT INTO firm_data (name, registration_number, address_line1, address_line2, city, postcode, country,
          email, phone, time_zone, locale, logo_path, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...values)
    }
    const after = firmDetails(db)!
    const diff = existing ? auditChanges('firm_data', existing as unknown as Row, after as unknown as Row, ['name']) : { before: null, after: after as unknown as Row }
    if (diff) {
      const action = !existing ? (actor ? 'Added the firm’s details' : 'Added the firm’s details while setting up') : 'Changed the firm’s details'
      writeAudit(db, actor, action, 'firm_data', after.id, diff.before, diff.after)
    }
    return after
  })()
}
