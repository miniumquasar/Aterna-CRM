import { describe, expect, it } from 'vitest'
import { AUDIT_HEAD_KEY, GENESIS_HASH, SYSTEM_ACTOR, changedFields, entryHash, recordChange, verifyAuditChain } from '@main/access/audit'
import { actorFor, addClient, createTestDb } from '../helpers/db'

function entries(db: ReturnType<typeof createTestDb>['db']): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM audit_log ORDER BY id').all() as Array<Record<string, unknown>>
}

describe('the audit log', () => {
  it('records who did what, before and after, chained from the genesis hash', () => {
    const { db } = createTestDb()
    const clientId = addClient(db)
    recordChange(db, actorFor('manager'), { action: 'clients.update', entity: 'client', entityId: clientId, clientId, before: { name: 'Old' }, after: { name: 'New' } })
    recordChange(db, SYSTEM_ACTOR, { action: 'clients.companiesHouseUpdate', entity: 'client', entityId: clientId, clientId, summary: 'Status changed' })
    const [a, b] = entries(db)
    expect(a).toMatchObject({ id: 1, actor_kind: 'user', actor_id: 2, actor_name: 'Morgan Manager', action: 'clients.update', entity_id: String(clientId), client_id: clientId, prev_hash: GENESIS_HASH })
    expect(JSON.parse(a.before_json as string)).toEqual({ name: 'Old' })
    expect(b).toMatchObject({ id: 2, actor_kind: 'system', actor_id: null, actor_name: 'AETERNA CRM', prev_hash: a.hash })
    expect(verifyAuditChain(db)).toEqual({ ok: true, entries: 2 })
  })

  it('never records secrets, and records sealed values only as a fingerprint', () => {
    const { db } = createTestDb()
    recordChange(db, actorFor('partner'), {
      action: 'users.update',
      entity: 'user',
      after: {
        password: 'hunter2hunter2',
        password_hash: 'scrypt$…',
        nino_enc: 'v1:abcdef',
        name: 'Pat',
        nino: 'QQ123456C',
        chAuthCode: 'ABC123',
        recovery_words: 'apple pear',
        vault: { backupCodes: ['1111'] }
      }
    })
    const after = JSON.parse(entries(db)[0].after_json as string)
    expect(after.password).toBe('[not recorded]')
    expect(after.password_hash).toBe('[not recorded]')
    expect(after.nino_enc).toMatch(/^\[sealed [0-9a-f]{8}\]$/)
    expect(after.name).toBe('Pat')
    expect(after.nino).toBe('[not recorded]')
    expect(after.chAuthCode).toBe('[not recorded]')
    expect(after.recovery_words).toBe('[not recorded]')
    expect(after.vault.backupCodes).toBe('[not recorded]')
    expect(entries(db)[0].after_json).not.toMatch(/QQ123456C|ABC123|apple|1111|hunter2/)
  })

  it('names an entry changed outside the app', () => {
    const { db } = createTestDb()
    for (let i = 0; i < 4; i++) recordChange(db, actorFor('staff'), { action: 'tasks.update', entity: 'task', entityId: i, after: { n: i } })
    expect(verifyAuditChain(db).ok).toBe(true)
    // Another tool, going around the app’s triggers:
    db.exec('DROP TRIGGER audit_log_append_only_update')
    db.prepare("UPDATE audit_log SET after_json = '{\"n\":99}' WHERE id = 3").run()
    expect(verifyAuditChain(db)).toMatchObject({ ok: false, firstBadId: 3, reason: 'changed' })
  })

  it('notices entries removed outside the app', () => {
    const { db } = createTestDb()
    for (let i = 0; i < 4; i++) recordChange(db, actorFor('staff'), { action: 'tasks.update', entity: 'task', entityId: i })
    db.exec('DROP TRIGGER audit_log_append_only_delete')
    db.prepare('DELETE FROM audit_log WHERE id = 2').run()
    expect(verifyAuditChain(db)).toMatchObject({ ok: false, firstBadId: 3, reason: 'missing_before' })
  })

  it('notices an entry rewritten with a fresh hash of its own', () => {
    const { db } = createTestDb()
    for (let i = 0; i < 3; i++) recordChange(db, actorFor('staff'), { action: 'tasks.update', entity: 'task', entityId: i })
    db.exec('DROP TRIGGER audit_log_append_only_update')
    db.prepare("UPDATE audit_log SET prev_hash = ? WHERE id = 2").run('f'.repeat(64))
    expect(verifyAuditChain(db)).toMatchObject({ ok: false, firstBadId: 2, reason: 'reordered' })
  })

  it('joins the caller’s transaction, so a failed write leaves no entry', () => {
    const { db } = createTestDb()
    expect(() =>
      db.transaction(() => {
        recordChange(db, actorFor('partner'), { action: 'clients.create', entity: 'client' })
        throw new Error('the write failed')
      })()
    ).toThrow('the write failed')
    expect(entries(db)).toHaveLength(0)
  })

  it('lists the fields that changed', () => {
    expect(changedFields({ a: 1, b: 'x', c: null }, { a: 1, b: 'y', d: 2 })).toEqual({ b: { before: 'x', after: 'y' }, d: { before: null, after: 2 } })
  })

  it('notices the newest entries removed outside the app, even after the app writes again', () => {
    const { db } = createTestDb()
    for (let i = 0; i < 4; i++) recordChange(db, actorFor('staff'), { action: 'tasks.update', entity: 'task', entityId: i })
    db.exec('DROP TRIGGER audit_log_append_only_delete')
    db.prepare('DELETE FROM audit_log WHERE id >= 3').run()
    expect(verifyAuditChain(db)).toMatchObject({ ok: false, firstBadId: 3, reason: 'missing_at_end', message: expect.stringMatching(/Entries 3 to 4/) })
    recordChange(db, actorFor('staff'), { action: 'tasks.update', entity: 'task', entityId: 9 })
    expect(entries(db).map((e) => e.id)).toEqual([1, 2, 5])
    expect(verifyAuditChain(db)).toMatchObject({ ok: false, firstBadId: 5, reason: 'missing_before' })
  })

  it('notices an entry added after the newest, hashed to fit', () => {
    const { db } = createTestDb()
    for (let i = 0; i < 2; i++) recordChange(db, actorFor('staff'), { action: 'tasks.update', entity: 'task', entityId: i })
    const last = entries(db)[1]
    const forged = {
      id: 3,
      created_at: '2026-10-20T10:00:00.000Z',
      actor_kind: 'user',
      actor_id: 1,
      actor_name: 'Pat Partner',
      action: 'invoices.delete',
      entity: 'invoice',
      entity_id: '7',
      client_id: null,
      summary: null,
      before_json: null,
      after_json: null,
      prev_hash: last.hash as string
    }
    db.prepare(
      `INSERT INTO audit_log (id, created_at, actor_kind, actor_id, actor_name, action, entity, entity_id, client_id, summary, before_json, after_json, prev_hash, hash)
       VALUES (@id, @created_at, @actor_kind, @actor_id, @actor_name, @action, @entity, @entity_id, @client_id, @summary, @before_json, @after_json, @prev_hash, @hash)`
    ).run({ ...forged, hash: entryHash(forged) })
    expect(verifyAuditChain(db)).toMatchObject({ ok: false, firstBadId: 3, reason: 'added_outside' })
  })

  it('notices the newest entry rewritten with a fresh hash of its own', () => {
    const { db } = createTestDb()
    for (let i = 0; i < 3; i++) recordChange(db, actorFor('staff'), { action: 'tasks.update', entity: 'task', entityId: i })
    const last = entries(db)[2]
    db.exec('DROP TRIGGER audit_log_append_only_update')
    const rewritten = { ...last, summary: 'nothing to see' } as Parameters<typeof entryHash>[0] & { hash?: unknown }
    delete rewritten.hash
    db.prepare('UPDATE audit_log SET summary = ?, hash = ? WHERE id = 3').run('nothing to see', entryHash(rewritten))
    expect(verifyAuditChain(db)).toMatchObject({ ok: false, firstBadId: 3, reason: 'changed' })
  })

  it('keeps the head in step with the newest entry, in the writer’s transaction', () => {
    const { db } = createTestDb()
    recordChange(db, actorFor('staff'), { action: 'tasks.update', entity: 'task' })
    const head = (): unknown => JSON.parse((db.prepare('SELECT value FROM app_meta WHERE key = ?').get(AUDIT_HEAD_KEY) as { value: string }).value)
    expect(head()).toEqual({ id: 1, hash: entries(db)[0].hash })
    expect(() =>
      db.transaction(() => {
        recordChange(db, actorFor('staff'), { action: 'tasks.update', entity: 'task' })
        throw new Error('the write failed')
      })()
    ).toThrow()
    expect(head()).toEqual({ id: 1, hash: entries(db)[0].hash })
    expect(verifyAuditChain(db)).toEqual({ ok: true, entries: 1 })
  })
})

