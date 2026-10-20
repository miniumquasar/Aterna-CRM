import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { Actor } from '../../src/main/access/policy'
import { freshDb } from '../import/helpers'

export const partner: Actor = { id: 1, name: 'Partner P', role: 'partner' }
export const manager: Actor = { id: 2, name: 'Manager M', role: 'manager' }
export const staffA: Actor = { id: 3, name: 'Staff A', role: 'staff' }
export const staffB: Actor = { id: 4, name: 'Staff B', role: 'staff' }

/** Today on this PC, shifted by some days, as YYYY-MM-DD. */
export const local = (offsetDays = 0): string => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Four people who sign in, and three clients: C1 with Staff A, C2 with Staff B,
 * C3 with nobody. Made-up data only.
 */
export function practice(): Database {
  const db = freshDb()
  const user = db.prepare("INSERT INTO users (id, username, name, role, active, password_hash) VALUES (?, ?, ?, ?, 1, 'x')")
  for (const a of [partner, manager, staffA, staffB]) user.run(a.id, a.name.toLowerCase().replace(/\s+/g, '.'), a.name, a.role)
  db.exec(`INSERT INTO clients (ref, client_name, client_category, status, assigned_to, nino, auth_code) VALUES
    ('C1', 'Alpha Ltd', 'company', 'Active', 'Staff A', 'AB123456C', 'A1B2C3'),
    ('C2', 'Beta Ltd', 'company', 'Active', 'Staff B', NULL, NULL),
    ('C3', 'Gamma Ltd', 'individual', 'Active', NULL, NULL, NULL)`)
  return db
}

export const auditOf = (db: Database, action: string): Array<{ user_name: string; record_id: string; old: unknown; new: unknown }> =>
  (db.prepare('SELECT user_name, record_id, old_value, new_value FROM audit_log WHERE action = ? ORDER BY id').all(action) as Array<{
    user_name: string; record_id: string; old_value: string | null; new_value: string | null
  }>).map((r) => ({ user_name: r.user_name, record_id: r.record_id, old: r.old_value ? JSON.parse(r.old_value) : null, new: r.new_value ? JSON.parse(r.new_value) : null }))
