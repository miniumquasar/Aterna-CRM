/**
 * Seals on the audit log (records/audit-seal.ts, migration 0020): a SHA-256
 * chain over every entry, sealed from time to time, so an entry changed or
 * removed outside the app — the triggers dropped, the file edited with another
 * tool — shows when the log is checked, and where.
 */
import { describe, expect, it } from 'vitest'
import { writeAudit } from '../../src/main/access/audit'
import { chainStep, checkAuditLog, entryText, fingerprintOf, GENESIS, sealAuditLog } from '../../src/main/records/audit-seal'
import { startAuditSealer } from '../../src/main/services/audit-sealer'
import { partner, practice } from './helpers'

const add = (db: ReturnType<typeof practice>, n: number, from = 0): void => {
  for (let i = 0; i < n; i++) writeAudit(db, partner, `Action ${from + i}`, 'clients', from + i, { a: i }, { a: i + 1 })
}
const entries = (db: ReturnType<typeof practice>): number => (db.prepare('SELECT COUNT(*) AS n FROM audit_log').get() as { n: number }).n
const lastId = (db: ReturnType<typeof practice>): number => (db.prepare('SELECT MAX(id) AS id FROM audit_log').get() as { id: number }).id

describe('sealing the audit log', () => {
  it('says the log isn’t sealed until it is, then seals only what is new', () => {
    const db = practice()
    add(db, 3)
    const before = checkAuditLog(db)
    expect(before).toMatchObject({ state: 'unsealed', seals: 0, entries: entries(db), unsealed: entries(db), fingerprint: null, problem: null })

    const first = sealAuditLog(db)
    expect(first).toEqual({ sealed: true, through: lastId(db), entries: entries(db) })
    expect(sealAuditLog(db)).toEqual({ sealed: false, through: lastId(db), entries: entries(db) })

    add(db, 2, 10)
    expect(checkAuditLog(db)).toMatchObject({ state: 'intact', seals: 1, unsealed: 2 })
    expect(sealAuditLog(db)).toMatchObject({ sealed: true, through: lastId(db), entries: entries(db) })
    const check = checkAuditLog(db)
    expect(check).toMatchObject({ state: 'intact', seals: 2, sealedThrough: lastId(db), unsealed: 0, problem: null })

    // The fingerprint is the start of the chain run over every entry from the first.
    let chain = GENESIS
    for (const r of db.prepare('SELECT id, timestamp, user_id, user_name, action, table_name, record_id, old_value, new_value FROM audit_log ORDER BY id').all() as Parameters<typeof entryText>[0][]) {
      chain = chainStep(chain, r)
    }
    expect(check.fingerprint).toBe(fingerprintOf(chain))
    expect(check.fingerprint).toMatch(/^[0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{4}$/)
  })

  it('covers every part of an entry: when, who, what, which record, before and after', () => {
    const base = { id: 1, timestamp: '2026-10-20 09:00:00', user_id: 1, user_name: 'Partner P', action: 'Changed a client', table_name: 'clients', record_id: '7', old_value: '{"a":1}', new_value: '{"a":2}' }
    const reference = chainStep(GENESIS, base)
    for (const [key, value] of Object.entries({ id: 2, timestamp: '2026-10-20 09:00:01', user_id: 2, user_name: 'Someone', action: 'Viewed', table_name: 'tasks', record_id: '8', old_value: null, new_value: '{"a":3}' })) {
      expect([key, chainStep(GENESIS, { ...base, [key]: value }) === reference]).toEqual([key, false])
    }
    // No two different entries read the same: the fields can't run into each other.
    expect(entryText({ ...base, action: 'a', table_name: 'bc' })).not.toBe(entryText({ ...base, action: 'ab', table_name: 'c' }))
  })

  it('shows an entry changed outside the app, and which sealed stretch it is in', () => {
    const db = practice()
    add(db, 3)
    sealAuditLog(db)
    const firstThrough = lastId(db)
    add(db, 3, 10)
    sealAuditLog(db)
    // Going around the app: the triggers that refuse changes are dropped, then an entry is rewritten.
    db.exec('DROP TRIGGER trg_audit_log_no_update')
    const target = firstThrough + 2
    db.prepare("UPDATE audit_log SET action = 'Nothing to see' WHERE id = ?").run(target)
    const check = checkAuditLog(db)
    expect(check.state).toBe('changed')
    expect(check.problem).toMatchObject({ fromId: firstThrough + 1, toId: lastId(db), missing: 0 })
    // Sealing again doesn't hide it: a new seal carries on from the old seal, not from the changed entries.
    add(db, 1, 20)
    sealAuditLog(db)
    expect(checkAuditLog(db).state).toBe('changed')
  })

  it('shows entries removed, and how many', () => {
    const db = practice()
    add(db, 5)
    sealAuditLog(db)
    db.exec('DROP TRIGGER trg_audit_log_no_delete')
    const ids = (db.prepare('SELECT id FROM audit_log ORDER BY id').all() as Array<{ id: number }>).map((r) => r.id)
    db.prepare('DELETE FROM audit_log WHERE id IN (?, ?)').run(ids[1], ids[3])
    const check = checkAuditLog(db)
    expect(check.state).toBe('changed')
    expect(check.problem).toMatchObject({ fromId: 1, toId: ids[ids.length - 1], missing: 2 })
    expect(check.entries).toBe(ids.length - 2)
  })

  it('shows the newest sealed entries removed, too', () => {
    const db = practice()
    add(db, 4)
    sealAuditLog(db)
    db.exec('DROP TRIGGER trg_audit_log_no_delete')
    db.prepare('DELETE FROM audit_log WHERE id = ?').run(lastId(db))
    expect(checkAuditLog(db)).toMatchObject({ state: 'changed', problem: { missing: 1 } })
  })

  it('keeps the seals append-only, like the log', () => {
    const db = practice()
    add(db, 1)
    sealAuditLog(db)
    expect(() => db.prepare("UPDATE audit_seals SET chain = 'x'").run()).toThrow('audit_seals is append-only')
    expect(() => db.prepare('DELETE FROM audit_seals').run()).toThrow('audit_seals is append-only')
  })

  it('checks a long log quickly', () => {
    const db = practice()
    const insert = db.prepare("INSERT INTO audit_log (user_id, user_name, action, table_name, record_id, old_value, new_value) VALUES (1, 'Partner P', 'Changed a client', 'clients', ?, ?, ?)")
    db.transaction(() => {
      for (let i = 0; i < 20_000; i++) insert.run(String(i), JSON.stringify({ status: 'Active', note: 'x'.repeat(200) }), JSON.stringify({ status: 'Former client', note: 'y'.repeat(200) }))
    })()
    let t = performance.now()
    sealAuditLog(db)
    const sealMs = performance.now() - t
    t = performance.now()
    expect(checkAuditLog(db).state).toBe('intact')
    const checkMs = performance.now() - t
    expect(sealMs).toBeLessThan(3_000)
    expect(checkMs).toBeLessThan(3_000)
  })
})

describe('the sealer', () => {
  it('seals a minute after start, every hour, and once more when stopped', async () => {
    const db = practice()
    add(db, 2)
    const stop = startAuditSealer({ db: () => db, firstAfterMs: 20, everyMs: 50 })
    await new Promise((r) => setTimeout(r, 40))
    expect((db.prepare('SELECT COUNT(*) AS n FROM audit_seals').get() as { n: number }).n).toBe(1)
    add(db, 1, 5)
    await new Promise((r) => setTimeout(r, 70))
    expect((db.prepare('SELECT COUNT(*) AS n FROM audit_seals').get() as { n: number }).n).toBe(2)
    add(db, 1, 9)
    stop()
    stop() // twice is harmless
    expect((db.prepare('SELECT COUNT(*) AS n FROM audit_seals').get() as { n: number }).n).toBe(3)
    expect(checkAuditLog(db)).toMatchObject({ state: 'intact', unsealed: 0 })
  })

  it('reports a seal that fails and keeps going', async () => {
    const problems: string[] = []
    const stop = startAuditSealer({
      db: () => {
        throw new Error('locked')
      },
      firstAfterMs: 5,
      everyMs: 1_000,
      log: (message) => problems.push(message)
    })
    await new Promise((r) => setTimeout(r, 30))
    stop()
    expect(problems).toEqual(['[audit] the audit log couldn’t be sealed', '[audit] the audit log couldn’t be sealed'])
  })
})
