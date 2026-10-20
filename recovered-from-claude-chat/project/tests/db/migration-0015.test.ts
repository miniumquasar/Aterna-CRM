import type { Database } from 'better-sqlite3-multiple-ciphers'
import { describe, expect, it } from 'vitest'
import { applyMigrations } from '../../src/main/db/migrate'
import { MIGRATIONS } from '../../src/main/db/migrations'
import { baseDb, freshDb } from '../import/helpers'

/** A database as the previous version left it (every migration up to 0014), with data in the old shapes. */
function before0015(): Database {
  const db = baseDb()
  applyMigrations(db, MIGRATIONS.filter((m) => m.id < '0015'))
  db.exec(`INSERT INTO clients (ref, client_name, annual_fee, nino) VALUES
    ('C1', 'Alpha Ltd', 1200, NULL),
    ('C2', 'Beta Ltd', '1,250.50', 'AB123456C'),
    ('C3', 'Gamma Ltd', '£95.5', 'JK123456A'),
    ('C4', 'Delta Ltd', 'n/a', NULL),
    ('C5', 'Epsilon Ltd', 12.345, NULL),
    ('C6', 'Zeta Ltd', NULL, NULL)`)
  db.exec("INSERT INTO client_services (client_ref, service_type, fee) VALUES ('C1', 'accounts', 150.75), ('C1', 'payroll', NULL)")
  db.prepare('INSERT INTO payments (client_ref, amount, vat_amount, status) VALUES (?, ?, ?, ?)').run('C1', 1800, 360, 'pending')
  db.prepare('INSERT INTO payments (client_ref, amount, vat_amount, status) VALUES (?, ?, ?, ?)').run('C2', 0.1 + 0.2, null, 'pending')
  db.exec("INSERT INTO payment_receipts (client_ref, receipt_date, amount) VALUES ('C1', '2026-01-02', 100.5), ('C1', '2026-01-03', -20)")
  db.exec("INSERT INTO partnership_members (client_ref, name, capital) VALUES ('C1', 'Partner One', -500.25)")
  // the older logins list
  const login = db.prepare('INSERT INTO logins (client_ref, platform, username, account_id, url, two_fa, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  login.run('C1', 'HMRC Government Gateway', 'GW123', null, 'www.gov.uk/sign-in', 0, 'Active', 'From the workbook')
  login.run('C1', 'Xero', 'x@example.com', 'ACC-1', 'https://login.xero.com', 1, 'Locked', null)
  login.run('C2', 'VAT online', 'GW999', null, null, 0, 'Active', null)
  login.run('C1', '', null, 'ACC-ONLY', null, 0, 'Active', null)
  // already in stored logins: the Xero login merges into it
  db.exec("INSERT INTO credential_vault (owner, client_ref, kind, platform, login_id, notes) VALUES ('client', 'C1', 'other', 'xero', 'X@EXAMPLE.COM', 'Kept by hand')")
  // C2 has permission on record, C1 does not
  db.exec("INSERT INTO credential_consents (client_ref, given_on, method) VALUES ('C2', '2026-01-01', 'signed_agreement')")
  // an import linked the first login to its workbook row
  db.exec(`INSERT INTO import_batches (batch_uid, adapter_id, adapter_version, source_system, file_name, file_sha256, file_size, plan_fingerprint, status)
    VALUES ('u', 'a', '1', 'wb', 'f.xlsx', 'h', 1, 'fp', 'committed')`)
  db.exec(`INSERT INTO external_ids (source_system, entity_table, external_key, entity_id, snapshot_json)
    VALUES ('wb', 'logins', 'CRED-1', 1, '{"client_ref":"C1","platform":"HMRC Government Gateway","username":"GW123","status":"Unverified","notes":"From the workbook"}')`)
  // the second NINO copy: C1 has none on the record, C2's differs, C3's is the same
  db.exec(`INSERT INTO personal_info (client_ref, ni_encrypted, notes) VALUES ('C1', 'jk 12 34 56 c', NULL), ('C2', 'AB123456D', 'Seen passport'), ('C3', 'JK 123456 A', NULL)`)
  // two accounts with one name (case and spaces aside): each would see the other's clients
  db.exec(`INSERT INTO users (username, name, role, active) VALUES ('sam.one', 'Sam Staff', 'staff', 1), ('sam.two', ' sam staff ', 'staff', 0), ('pat', 'Pat', 'partner', 1)`)
  return db
}

const cols = (db: Database, table: string): string[] => (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name)
const issues = (db: Database): Record<string, string> =>
  Object.fromEntries((db.prepare("SELECT issue_key, severity FROM data_issues WHERE source = 'migration 0015' ORDER BY issue_key").all() as Array<{ issue_key: string; severity: string }>)
    .map((r) => [r.issue_key, r.severity]))

describe('migration 0015 — access and integrity', () => {
  it('moves money to whole pence, never guessing, and lists what it could not read or had to round', () => {
    const db = before0015()
    expect(applyMigrations(db)).toEqual(['0015_access_integrity', '0016_email_backups'])
    const fees = db.prepare('SELECT ref, annual_fee_pence AS p, typeof(annual_fee_pence) AS t FROM clients ORDER BY ref').all()
    expect(fees).toEqual([
      { ref: 'C1', p: 120000, t: 'integer' },
      { ref: 'C2', p: 125050, t: 'integer' },
      { ref: 'C3', p: 9550, t: 'integer' },
      { ref: 'C4', p: null, t: 'null' },
      { ref: 'C5', p: 1235, t: 'integer' },
      { ref: 'C6', p: null, t: 'null' }
    ])
    expect(db.prepare('SELECT fee_pence FROM client_services ORDER BY id').all()).toEqual([{ fee_pence: 15075 }, { fee_pence: null }])
    expect(db.prepare('SELECT amount_pence, vat_pence FROM payments ORDER BY id').all()).toEqual([
      { amount_pence: 180000, vat_pence: 36000 },
      { amount_pence: 30, vat_pence: null }
    ])
    expect(db.prepare('SELECT amount_pence FROM payment_receipts ORDER BY id').all()).toEqual([{ amount_pence: 10050 }, { amount_pence: -2000 }])
    expect(db.prepare('SELECT capital_pence FROM partnership_members').get()).toEqual({ capital_pence: -50025 })
    for (const [t, gone] of [['clients', 'annual_fee'], ['client_services', 'fee'], ['payments', 'amount'], ['payments', 'vat_amount'], ['payment_receipts', 'amount'], ['partnership_members', 'capital']]) {
      expect(cols(db, t), `${t}.${gone}`).not.toContain(gone)
    }
    const found = issues(db)
    expect(found['MIG0015:money:clients:annual_fee:4']).toBe('medium') // 'n/a'
    expect(found['MIG0015:rounded:clients:annual_fee:5']).toBe('low') // 12.345
    expect(Object.keys(found).filter((k) => k.includes(':money:') || k.includes(':rounded:'))).toHaveLength(2)
    const unread = db.prepare("SELECT description FROM data_issues WHERE issue_key = 'MIG0015:money:clients:annual_fee:4'").get() as { description: string }
    expect(unread.description).toContain('“n/a”') // the original text is kept for the practice to re-enter
    // from now on only whole pence can be stored
    expect(() => db.prepare("UPDATE clients SET annual_fee_pence = 12.5 WHERE ref = 'C1'").run()).toThrow(/CHECK constraint failed/)
  })

  it('moves the older logins into stored logins, flagged and linked, and lists sign-ins with no permission', () => {
    const db = before0015()
    applyMigrations(db)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'logins'").get()).toBeUndefined()
    const vault = db.prepare('SELECT client_ref, kind, platform, login_id, url, notes FROM credential_vault ORDER BY id').all() as Array<Record<string, string | null>>
    expect(vault.map((v) => [v.client_ref, v.kind, v.platform, v.login_id])).toEqual([
      ['C1', 'other', 'xero', 'X@EXAMPLE.COM'], // existing entry: the Xero login merged into it
      ['C1', 'government_sign_in', 'HMRC Government Gateway', 'GW123'],
      ['C2', 'government_sign_in', 'VAT online', 'GW999'],
      ['C1', 'other', 'Unknown platform', 'ACC-ONLY']
    ])
    expect(vault[0].notes).toContain('Kept by hand')
    expect(vault[0].notes).toContain('Account ID: ACC-1')
    expect(vault[0].notes).toContain('2-step verification: on')
    expect(vault[0].notes).toContain('Status: Locked')
    expect(vault[1].url).toBeNull() // not an https address: kept in the notes instead
    expect(vault[1].notes).toContain('Web address as recorded: www.gov.uk/sign-in')
    expect(db.prepare('SELECT COUNT(*) AS n FROM credential_secrets').get()).toEqual({ n: 0 }) // no password ever existed: each is flagged "No password"
    // C1 has government sign-ins and no permission on record; C2 has permission
    expect(issues(db)).toMatchObject({ 'MIG0015:sign-in-permission:C1': 'medium' })
    expect(issues(db)['MIG0015:sign-in-permission:C2']).toBeUndefined()
    // the import's link now points at the stored login, so a re-import finds it
    const link = db.prepare("SELECT entity_table, entity_id, snapshot_json FROM external_ids WHERE external_key = 'CRED-1'").get() as { entity_table: string; entity_id: number; snapshot_json: string }
    expect(link.entity_table).toBe('credential_vault')
    expect(db.prepare('SELECT login_id FROM credential_vault WHERE id = ?').get(link.entity_id)).toEqual({ login_id: 'GW123' })
    expect(JSON.parse(link.snapshot_json)).toMatchObject({ owner: 'client', login_id: 'GW123', kind: 'government_sign_in' })
    expect(db.prepare("SELECT COUNT(*) AS n FROM external_ids WHERE entity_table = 'logins'").get()).toEqual({ n: 0 })
  })

  it('keeps the NINO once, on the client record, and never drops a differing copy', () => {
    const db = before0015()
    applyMigrations(db)
    expect(cols(db, 'personal_info')).not.toContain('ni_encrypted')
    expect(db.prepare("SELECT ref, nino FROM clients WHERE ref IN ('C1', 'C2', 'C3') ORDER BY ref").all()).toEqual([
      { ref: 'C1', nino: 'JK123456C' }, // moved onto the empty client record
      { ref: 'C2', nino: 'AB123456C' }, // the client record wins
      { ref: 'C3', nino: 'JK123456A' } // the same number twice: one copy goes
    ])
    expect(issues(db)).toMatchObject({ 'MIG0015:nino:C2': 'medium' })
    expect(issues(db)['MIG0015:nino:C3']).toBeUndefined()
    // the differing copy is kept with the client's identity details, which go with the client…
    expect((db.prepare("SELECT notes FROM personal_info WHERE client_ref = 'C2'").get() as { notes: string }).notes)
      .toBe('Seen passport\nSecond National Insurance number found when the app was upgraded: AB123456D. The client record has •••••••6C.')
    // …and never in full in the audit log, which can't be changed or cleared, nor in the issue list
    const kept = db.prepare("SELECT old_value FROM audit_log WHERE action LIKE 'Kept a second National Insurance number%'").all() as Array<{ old_value: string }>
    expect(kept.map((k) => JSON.parse(k.old_value))).toEqual([{ ni_encrypted: '•••••••6D' }])
    const everything = JSON.stringify([db.prepare('SELECT * FROM audit_log').all(), db.prepare('SELECT * FROM data_issues').all()])
    for (const nino of ['AB123456D', 'JK123456C', 'JK 12 34 56']) expect(everything).not.toContain(nino)
  })

  it('lists accounts that share a name, since work is assigned by name', () => {
    const db = before0015()
    applyMigrations(db)
    const shared = db.prepare("SELECT description FROM data_issues WHERE issue_type = 'migration:shared-name'").all() as Array<{ description: string }>
    expect(shared).toHaveLength(1)
    expect(shared[0].description).toMatch(/^2 accounts share the name “.am Staff”/)
  })

  it('makes the audit log append-only, records the upgrade, and is idempotent', () => {
    const db = before0015()
    applyMigrations(db)
    const summary = db.prepare("SELECT new_value FROM audit_log WHERE record_id = '0015_access_integrity'").get() as { new_value: string }
    expect(JSON.parse(summary.new_value)).toMatchObject({ logins_added: 3, logins_merged: 1, nino_copies_handled: 3, shared_names_listed: 1 })
    expect(() => db.prepare("UPDATE audit_log SET action = 'x'").run()).toThrow(/append-only/)
    expect(() => db.prepare('DELETE FROM audit_log').run()).toThrow(/append-only/)
    db.prepare("INSERT INTO audit_log (user_name, action) VALUES ('t', 'still allowed')").run()
    expect(db.pragma('foreign_key_check')).toEqual([])
    expect(applyMigrations(db)).toEqual([])
  })

  it('on a new installation, everything is in its final shape from the start', () => {
    const db = freshDb()
    expect(cols(db, 'clients')).toContain('annual_fee_pence')
    expect(cols(db, 'ai_conversations')).toEqual(expect.arrayContaining(['user_id', 'user_name']))
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'logins'").get()).toBeUndefined()
    expect(db.prepare("SELECT COUNT(*) AS n FROM data_issues").get()).toEqual({ n: 0 })
  })
})
