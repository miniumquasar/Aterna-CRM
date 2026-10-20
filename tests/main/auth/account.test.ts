/**
 * Settings → Your sign-in: your details and recent sign-ins, and changing
 * your own password (current one checked and counted towards the lock, a
 * new one that differs, other sessions ended).
 */
import { describe, expect, it } from 'vitest'
import { TEST_PASSWORD, practice, useCheapHashes } from './helpers'

useCheapHashes()

describe('your sign-in', () => {
  it('shows your details, your idle sign-out and your latest sign-ins', async () => {
    const p = practice()
    await p.ipc.call('auth.signIn', { username: 'sam.staff', password: 'a wrong one!' })
    await p.signIn('staff')
    const account = await p.ipc.ok('account.get', undefined)
    expect(account).toMatchObject({
      id: 3,
      username: 'sam.staff',
      name: 'Sam Staff',
      role: 'staff',
      lastSignInAt: p.clock.now.toISOString(),
      idle: { practiceMinutes: 30, ownMinutes: null, effectiveMinutes: 30 }
    })
    expect(account.recentSignIns.map((e) => e.outcome)).toEqual(['success', 'wrong_password'])
  })

  it('changes your password, checking the current one', async () => {
    const p = practice()
    const other = p.window()
    await p.signIn('staff', other)
    await p.signIn('staff')
    expect(await p.ipc.call('account.changePassword', { currentPassword: 'wrong one', newPassword: 'a brand new password' })).toMatchObject({
      ok: false,
      error: { code: 'invalid', field: 'currentPassword' }
    })
    expect(await p.ipc.call('account.changePassword', { currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD })).toMatchObject({
      ok: false,
      error: { field: 'newPassword', message: 'That is your current password. Choose a new one.' }
    })
    expect(await p.ipc.call('account.changePassword', { currentPassword: TEST_PASSWORD, newPassword: 'short' })).toMatchObject({ ok: false, error: { field: 'newPassword' } })
    const before = p.ipc.auditCount()
    const account = await p.ipc.ok('account.changePassword', { currentPassword: TEST_PASSWORD, newPassword: 'a brand new password' })
    expect(account.passwordChangedAt).toBe(p.clock.now.toISOString())
    expect(p.ipc.auditCount()).toBe(before + 1)
    // This window stays signed in, with protected actions open; the other window's session ended.
    expect(await p.ipc.ok('auth.session', undefined)).toMatchObject({ reauthUntil: expect.any(String) })
    expect(await other.ok('auth.status', undefined)).toMatchObject({ signedIn: false })
    await p.ipc.ok('auth.signOut', undefined)
    expect(await p.ipc.call('auth.signIn', { username: 'sam.staff', password: TEST_PASSWORD })).toMatchObject({ ok: false })
    expect(await p.ipc.ok('auth.signIn', { username: 'sam.staff', password: 'a brand new password' })).toMatchObject({ signedIn: true })
  })

  it('records the audit entry without the password', async () => {
    const p = practice()
    await p.signIn('manager')
    await p.ipc.ok('account.changePassword', { currentPassword: TEST_PASSWORD, newPassword: 'a brand new password' })
    const rows = JSON.stringify(p.db.prepare('SELECT * FROM audit_log').all())
    expect(rows).not.toContain('brand new')
    expect(rows).not.toContain(TEST_PASSWORD)
  })
})
