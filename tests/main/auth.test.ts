import { describe, expect, it } from 'vitest'
import { hashPassword, passwordProblem, verifyPassword } from '@main/auth/passwords'
import { TEST_PASSWORD, TEST_SCRYPT_COST, createTestDb } from '../helpers/db'
import { createTestIpc } from '../helpers/ipc'

describe('passwords', () => {
  it('hash with scrypt and verify in constant time', () => {
    const stored = hashPassword('a long passphrase', TEST_SCRYPT_COST)
    expect(stored).toMatch(/^scrypt\$1024\$8\$1\$/)
    expect(verifyPassword('a long passphrase', stored)).toBe(true)
    expect(verifyPassword('a long passphrasf', stored)).toBe(false)
    expect(verifyPassword('anything', 'not a hash')).toBe(false)
    expect(hashPassword('same', TEST_SCRYPT_COST)).not.toBe(hashPassword('same', TEST_SCRYPT_COST))
  })

  it('say plainly what is wrong with a new password', () => {
    expect(passwordProblem('short')).toMatch(/at least 10/)
    expect(passwordProblem(' padded password ')).toMatch(/space/)
    expect(passwordProblem('long enough now')).toBeNull()
  })
})

describe('first run and signing in', () => {
  it('creates the first partner and the firm, signed in, only once', async () => {
    const { db } = createTestDb({ seedUsers: false, firmName: null })
    const ipc = createTestIpc(db)
    expect(await ipc.ok('auth.status', undefined)).toMatchObject({ setupNeeded: true, setupComplete: false, signedIn: false, firmName: null })
    const status = await ipc.ok('setup.createFirstPartner', { firmName: 'Dynamic Accountants', name: 'Arif Rahman', username: 'arif', password: 'correct horse battery' })
    expect(status).toMatchObject({ setupNeeded: false, setupComplete: false, signedIn: true, actor: { username: 'arif', role: 'partner' }, firmName: 'Dynamic Accountants' })
    expect(ipc.auditCount()).toBe(2)
    const again = await ipc.call('setup.createFirstPartner', { firmName: 'Other', name: 'Mallory', username: 'mallory', password: 'correct horse battery' })
    expect(again).toMatchObject({ ok: false, error: { code: 'conflict' } })
    expect(await ipc.ok('setup.finish', undefined)).toMatchObject({ setupComplete: true })
  })

  it('checks the first partner’s details', async () => {
    const { db } = createTestDb({ seedUsers: false, firmName: null })
    const ipc = createTestIpc(db)
    expect(await ipc.call('setup.createFirstPartner', { firmName: '', name: 'A', username: 'abc', password: 'correct horse battery' })).toMatchObject({ ok: false, error: { code: 'invalid', field: 'firmName' } })
    expect(await ipc.call('setup.createFirstPartner', { firmName: 'F', name: 'A', username: 'a b', password: 'correct horse battery' })).toMatchObject({ ok: false, error: { field: 'username' } })
    expect(await ipc.call('setup.createFirstPartner', { firmName: 'F', name: 'A', username: 'abc', password: 'short' })).toMatchObject({ ok: false, error: { field: 'password' } })
  })

  it('signs in with the right password only, the same answer for unknown names', async () => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db)
    const wrong = await ipc.call('auth.signIn', { username: 'sam.staff', password: 'wrong password' })
    const unknown = await ipc.call('auth.signIn', { username: 'nobody', password: 'wrong password' })
    expect(wrong).toMatchObject({ ok: false, error: { code: 'invalid' } })
    expect(unknown).toEqual(wrong)
    const status = await ipc.ok('auth.signIn', { username: 'SAM.STAFF', password: TEST_PASSWORD })
    expect(status).toMatchObject({ signedIn: true, actor: { id: 3, role: 'staff' } })
    const outcomes = (db.prepare('SELECT outcome FROM sign_in_events ORDER BY id').all() as Array<{ outcome: string }>).map((r) => r.outcome)
    expect(outcomes).toEqual(['wrong_password', 'unknown_user', 'success'])
    expect(await ipc.ok('auth.signOut', undefined)).toMatchObject({ signedIn: false })
    expect(await ipc.ok('auth.status', undefined)).toMatchObject({ signedIn: false })
    const ended = db.prepare('SELECT end_reason FROM sessions').all()
    expect(ended).toEqual([{ end_reason: 'signed_out' }])
  })

  it('refuses a person whose access is off', async () => {
    const { db, users } = createTestDb()
    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(users.manager.id)
    const ipc = createTestIpc(db)
    expect(await ipc.call('auth.signIn', { username: users.manager.username, password: TEST_PASSWORD })).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })

  it('lets only a partner finish setup', async () => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db)
    ipc.signInAs('manager')
    expect(await ipc.call('setup.finish', undefined)).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })
})

describe('appearance', () => {
  it('is saved per OS user, normalised, and refuses unknown choices', async () => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db)
    expect(await ipc.ok('appearance.get', undefined)).toEqual({ mode: 'auto', palette: 'burgundy', effects: 'full', reduceMotion: false, reduceTransparency: false })
    expect(await ipc.ok('appearance.set', { mode: 'night', palette: 'sapphire' })).toMatchObject({ mode: 'night', palette: 'sapphire', effects: 'full' })
    expect(await ipc.ok('appearance.get', undefined)).toMatchObject({ mode: 'night', palette: 'sapphire' })
    expect(await ipc.call('appearance.set', { palette: 'neon' as never })).toMatchObject({ ok: false, error: { code: 'invalid', field: 'palette' } })
  })
})

describe('system', () => {
  it('answers ping and describes itself', async () => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db)
    expect(await ipc.ok('system.ping', undefined)).toMatchObject({ pong: true })
    expect(await ipc.ok('system.info', undefined)).toMatchObject({ productName: 'AETERNA CRM', licenceHolder: null })
  })
})
