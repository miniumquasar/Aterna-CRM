import { describe, expect, it } from 'vitest'
import { addClient, createTestDb } from '../helpers/db'

describe('the core schema', () => {
  it('refuses values the CHECK constraints rule out', () => {
    const { db } = createTestDb()
    expect(() => db.prepare("INSERT INTO clients (code, name, type) VALUES ('X1', 'A', 'spaceship')").run()).toThrow(/CHECK/)
    expect(() => db.prepare("INSERT INTO clients (code, name, incorporation_date) VALUES ('X2', 'A', '2026-02-30')").run()).toThrow(/CHECK/)
    expect(() => db.prepare("INSERT INTO clients (code, name, fee_pence) VALUES ('X3', 'A', -1)").run()).toThrow(/CHECK/)
    expect(() => db.prepare("INSERT INTO clients (code, name, year_end_month) VALUES ('X4', 'A', 3)").run()).toThrow(/CHECK/)
    expect(() => db.prepare("INSERT INTO clients (code, name, year_end_month, year_end_day) VALUES ('X5', 'A', 2, 30)").run()).toThrow(/CHECK/)
    expect(() => db.prepare("INSERT INTO clients (code, name, nino_enc) VALUES ('X6', 'A', 'AB123456C')").run()).toThrow(/CHECK/)
    expect(() => db.prepare("INSERT INTO clients (code, name, fee_pence) VALUES ('X7', 'A', '12.50')").run()).toThrow()
  })

  it('keeps client codes unique regardless of case, and never empty', () => {
    const { db } = createTestDb()
    addClient(db, { code: 'CL0001' })
    expect(() => addClient(db, { code: 'cl0001' })).toThrow(/UNIQUE/)
    expect(() => addClient(db, { code: '  ' })).toThrow(/CHECK/)
  })

  it('allows one primary contact per client', () => {
    const { db } = createTestDb()
    const id = addClient(db)
    db.prepare('INSERT INTO client_contacts (client_id, name, is_primary) VALUES (?, ?, 1)').run(id, 'First')
    expect(() => db.prepare('INSERT INTO client_contacts (client_id, name, is_primary) VALUES (?, ?, 1)').run(id, 'Second')).toThrow(/UNIQUE/)
  })

  it('refuses removing a person who still has clients', () => {
    const { db, users } = createTestDb()
    addClient(db, { assignedTo: users.staff.id })
    expect(() => db.prepare('DELETE FROM users WHERE id = ?').run(users.staff.id)).toThrow(/FOREIGN KEY/)
  })

  it('keeps the audit log append-only', () => {
    const { db } = createTestDb()
    db.prepare(
      "INSERT INTO audit_log (actor_kind, actor_name, action, entity, prev_hash, hash, created_at) VALUES ('system', 'x', 'a.b', 'e', ?, ?, 'now')"
    ).run('0'.repeat(64), '1'.repeat(64))
    expect(() => db.prepare("UPDATE audit_log SET action = 'c.d'").run()).toThrow(/only be added to/)
    expect(() => db.prepare('DELETE FROM audit_log').run()).toThrow(/only be added to/)
  })

  it('records an install id', () => {
    const { db } = createTestDb()
    const row = db.prepare("SELECT value FROM app_meta WHERE key = 'install_id'").get() as { value: string }
    expect(row.value).toMatch(/^[0-9a-f]{32}$/)
  })
})
