import { afterEach, describe, expect, it } from 'vitest'
import { clearHandlers, handle, dispatch } from '@main/ipc/registry'
import { UserFacingError } from '@main/ipc/errors'
import { createTestDb } from '../helpers/db'
import { createTestIpc } from '../helpers/ipc'

afterEach(() => clearHandlers())

describe('the IPC registry', () => {
  it('refuses a channel that isn’t in the contract', async () => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db)
    const r = await dispatch(ipc.deps, ipc.senderId, 'clients.dropEverything', {})
    expect(r).toEqual({ ok: false, error: { code: 'not_found', message: expect.any(String) } })
  })

  it('refuses a signed-in channel without a session, and runs it with one', async () => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db)
    const refused = await ipc.call('setup.finish', undefined)
    expect(refused).toMatchObject({ ok: false, error: { code: 'unauthenticated' } })
    ipc.signInAs('partner')
    const allowed = await ipc.call('setup.finish', undefined)
    expect(allowed).toMatchObject({ ok: true, data: { setupComplete: true } })
  })

  it('runs public channels signed out', async () => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db)
    expect(await ipc.call('system.ping', undefined)).toMatchObject({ ok: true, data: { pong: true } })
    expect(await ipc.call('auth.status', undefined)).toMatchObject({ ok: true, data: { signedIn: false, actor: null } })
  })

  it('binds the session to the window that signed in', async () => {
    const { db } = createTestDb()
    const a = createTestIpc(db)
    a.signInAs('manager')
    const b = createTestIpc(db, { register: false })
    expect(await b.call('auth.status', undefined)).toMatchObject({ ok: true, data: { signedIn: false } })
    // createTestIpc clears bindings, so sign in again on a and check b still has none.
    a.signInAs('manager')
    expect(await a.call('auth.status', undefined)).toMatchObject({ ok: true, data: { signedIn: true, actor: { role: 'manager' } } })
    expect(await b.call('auth.status', undefined)).toMatchObject({ ok: true, data: { signedIn: false } })
  })

  it('refuses writes when read-only, except those allowed', async () => {
    const { db } = createTestDb({ seedUsers: false, firmName: null })
    const ipc = createTestIpc(db, { readOnly: true })
    const write = await ipc.call('setup.createFirstPartner', { firmName: 'A', name: 'B', username: 'bee', password: 'long enough pw' })
    expect(write).toMatchObject({ ok: false, error: { code: 'read_only' } })
    expect(await ipc.call('appearance.set', { mode: 'night' })).toMatchObject({ ok: true, data: { mode: 'night' } })
    expect(await ipc.call('system.ping', undefined)).toMatchObject({ ok: true })
  })

  it('passes a person-facing error through, with its field', async () => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db)
    clearHandlers()
    handle('system.ping', () => {
      throw new UserFacingError('invalid', 'Enter a company number of 8 characters.', 'company_number')
    })
    expect(await ipc.call('system.ping', undefined)).toEqual({
      ok: false,
      error: { code: 'invalid', message: 'Enter a company number of 8 characters.', field: 'company_number' }
    })
  })

  it('hides an internal error’s detail from the page and logs it', async () => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db)
    clearHandlers()
    handle('system.ping', () => {
      db.prepare('SELECT * FROM secret_table_name').all()
      return { pong: true as const, at: '' }
    })
    const r = await ipc.call('system.ping', undefined)
    expect(r).toMatchObject({ ok: false, error: { code: 'internal' } })
    if (r.ok) throw new Error('expected a refusal')
    expect(r.error.message).not.toMatch(/secret_table_name|SQLITE|\n\s+at /)
    expect(ipc.log.lines.join('\n')).toMatch(/secret_table_name/)
  })

  it('says a channel without a handler isn’t available', async () => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db)
    clearHandlers()
    expect(await ipc.call('system.ping', undefined)).toMatchObject({ ok: false, error: { code: 'unavailable' } })
  })

  it('refuses a second handler for the same channel, and channels not in the contract', () => {
    clearHandlers()
    handle('system.ping', () => ({ pong: true as const, at: '' }))
    expect(() => handle('system.ping', () => ({ pong: true as const, at: '' }))).toThrow(/already has a handler/)
    expect(() => handle('nope.never' as never, () => undefined as never)).toThrow(/isn’t in the IPC contract/)
  })

  it('stops a session whose person’s access was turned off', async () => {
    const { db, users } = createTestDb()
    const ipc = createTestIpc(db)
    ipc.signInAs('staff')
    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(users.staff.id)
    expect(await ipc.call('setup.finish', undefined)).toMatchObject({ ok: false, error: { code: 'unauthenticated' } })
  })
})

describe('the audit check on writes', () => {
  it('notices a write that changes rows without an audit entry', async () => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db)
    ipc.signInAs('partner')
    clearHandlers()
    let n = 0
    handle('setup.finish', (_req, ctx) => {
      ctx.db.prepare('INSERT INTO settings ("group", key, value) VALUES (?, ?, ?)').run('t', `k${n++}`, '1')
      return { setupNeeded: false, setupComplete: true, signedIn: true, actor: ctx.actor, firmName: null }
    })
    await expect(ipc.call('setup.finish', undefined)).rejects.toThrow(/setup.finish changed stored data without an audit entry/)
    // In the app it is logged, and the call still succeeds.
    const lenient = createTestIpc(db, { register: false, allowUnaudited: true })
    lenient.signInAs('partner')
    const warned: string[] = []
    const r = await dispatch({ ...lenient.deps, onUnauditedWrite: undefined, log: { ...lenient.log, warn: (m: string) => void warned.push(m) } }, lenient.senderId, 'setup.finish', undefined)
    expect(r.ok).toBe(true)
    expect(warned.join('\n')).toMatch(/without an audit entry/)
  })

  it('is satisfied by a write that audits, or one that changes nothing', async () => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db)
    ipc.signInAs('partner')
    expect(await ipc.call('setup.finish', undefined)).toMatchObject({ ok: true })
    expect(ipc.auditCount()).toBe(1)
    expect(await ipc.call('setup.finish', undefined)).toMatchObject({ ok: true })
    expect(ipc.auditCount()).toBe(1)
  })

  it('leaves out the writes marked audited: false', async () => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db)
    expect(await ipc.call('appearance.set', { mode: 'day' })).toMatchObject({ ok: true })
    expect(await ipc.call('auth.signIn', { username: 'pat.partner', password: 'correct horse battery' })).toMatchObject({ ok: true })
    expect(ipc.auditCount()).toBe(0)
  })
})
