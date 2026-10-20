/**
 * Signing in: the same answer for unknown names and wrong passwords, the
 * lock after repeated wrong passwords (with its warnings), a lock that lifts
 * by itself only when no other partner could lift it, access turned off,
 * and temporary passwords. Made-up people only.
 */
import { describe, expect, it } from 'vitest'
import { LOCK_AFTER_FAILURES, SELF_UNLOCK_MINUTES } from '@shared/contracts/auth'
import { hashPassword } from '@main/auth/passwords'
import { TEST_PASSWORD, minutes, practice, useCheapHashes } from './helpers'

useCheapHashes()

const events = (p: ReturnType<typeof practice>): Array<{ outcome: string; detail: string | null }> =>
  p.db.prepare('SELECT outcome, detail FROM sign_in_events ORDER BY id').all() as Array<{ outcome: string; detail: string | null }>

describe('signing in', () => {
  it('warns as the lock nears, then locks the account after five wrong passwords in a row', async () => {
    const p = practice()
    const tries: string[] = []
    for (let i = 1; i <= LOCK_AFTER_FAILURES; i++) {
      const r = await p.ipc.call('auth.signIn', { username: 'sam.staff', password: `wrong password ${i}` })
      if (r.ok) throw new Error('expected a refusal')
      tries.push(`${r.error.code}: ${r.error.message}`)
    }
    expect(tries[0]).toBe('invalid: That username and password don’t match. Check them and try again.')
    expect(tries[1]).toBe(tries[0])
    expect(tries[2]).toMatch(/^invalid: .*2 more wrong passwords will lock the account\.$/)
    expect(tries[3]).toMatch(/One more wrong password will lock the account\.$/)
    expect(tries[4]).toMatch(/^locked: That was the fifth wrong password in a row, so the account is now locked\. Ask a partner to unlock it in Settings → People\.$/)
    expect(events(p).at(-1)).toEqual({ outcome: 'wrong_password', detail: 'Locked after 5 wrong passwords in a row' })

    // Locked: refused whatever the password, so a guess can't be tested.
    expect(await p.ipc.call('auth.signIn', { username: 'sam.staff', password: TEST_PASSWORD })).toMatchObject({ ok: false, error: { code: 'locked', message: expect.stringMatching(/locked after too many wrong passwords/) } })
    expect(await p.ipc.call('auth.signIn', { username: 'sam.staff', password: 'another guess!' })).toMatchObject({ ok: false, error: { code: 'locked' } })
    expect(events(p).slice(-2)).toEqual([
      { outcome: 'locked', detail: 'The right password, but the account is locked' },
      { outcome: 'locked', detail: null }
    ])
    expect(p.db.prepare('SELECT count(*) AS n FROM sessions').get()).toEqual({ n: 0 })
  })

  it('starts the count again after a good password', async () => {
    const p = practice()
    for (let i = 0; i < 4; i++) await p.ipc.call('auth.signIn', { username: 'sam.staff', password: 'not it at all' })
    await p.signIn('staff')
    expect(p.db.prepare('SELECT failed_sign_ins FROM users WHERE id = 3').get()).toEqual({ failed_sign_ins: 0 })
    await p.ipc.ok('auth.signOut', undefined)
    expect(await p.ipc.call('auth.signIn', { username: 'sam.staff', password: 'not it at all' })).toMatchObject({ ok: false, error: { code: 'invalid', message: 'That username and password don’t match. Check them and try again.' } })
  })

  it('gives unknown names the same answer, and from the third a hint about the username', async () => {
    const p = practice()
    const first = await p.ipc.call('auth.signIn', { username: 'nobody.here', password: 'some password' })
    expect(first).toMatchObject({ ok: false, error: { code: 'invalid', message: 'That username and password don’t match. Check them and try again.' } })
    await p.ipc.call('auth.signIn', { username: 'nobody.here', password: 'some password' })
    const third = await p.ipc.call('auth.signIn', { username: 'NOBODY.HERE', password: 'some password' })
    expect(third).toMatchObject({ ok: false, error: { message: expect.stringMatching(/a partner can see it in Settings → People/) } })
    // An hour later the hint has gone.
    p.clock.advance(minutes(61))
    expect(await p.ipc.call('auth.signIn', { username: 'nobody.here', password: 'some password' })).toEqual(first)
  })

  it('asks for both fields, naming the empty one', async () => {
    const p = practice()
    expect(await p.ipc.call('auth.signIn', { username: '  ', password: 'x' })).toMatchObject({ ok: false, error: { code: 'invalid', field: 'username' } })
    expect(await p.ipc.call('auth.signIn', { username: 'sam.staff', password: '' })).toMatchObject({ ok: false, error: { code: 'invalid', field: 'password' } })
  })

  it('lets the only partner’s lock lift by itself after 15 minutes, and says when', async () => {
    const p = practice()
    p.db.prepare("UPDATE users SET role = 'manager' WHERE id = 2").run()
    for (let i = 0; i < LOCK_AFTER_FAILURES - 1; i++) await p.ipc.call('auth.signIn', { username: 'pat.partner', password: 'not it at all' })
    const locking = await p.ipc.call('auth.signIn', { username: 'pat.partner', password: 'not it at all' })
    // 09:00 UTC on 20 Oct 2026 is 10:00 in London; the lock lifts at 10:15.
    expect(locking).toMatchObject({ ok: false, error: { code: 'locked', message: expect.stringMatching(/As no other partner can unlock it, it unlocks by itself at 10:15\.$/) } })
    p.clock.advance(minutes(SELF_UNLOCK_MINUTES - 1))
    expect(await p.ipc.call('auth.signIn', { username: 'pat.partner', password: TEST_PASSWORD })).toMatchObject({ ok: false, error: { code: 'locked', message: expect.stringMatching(/at 10:15/) } })
    p.clock.advance(minutes(1))
    expect(await p.ipc.ok('auth.signIn', { username: 'pat.partner', password: TEST_PASSWORD })).toMatchObject({ signedIn: true })
    expect(events(p).at(-1)).toEqual({ outcome: 'success', detail: 'The lock had lifted by itself' })
    expect(p.db.prepare('SELECT locked_at, failed_sign_ins FROM users WHERE id = 1').get()).toEqual({ locked_at: null, failed_sign_ins: 0 })
  })

  it('keeps a lock in place while another partner could lift it', async () => {
    const p = practice()
    p.db.prepare("UPDATE users SET role = 'partner' WHERE id = 2").run()
    for (let i = 0; i < LOCK_AFTER_FAILURES; i++) await p.ipc.call('auth.signIn', { username: 'pat.partner', password: 'not it at all' })
    p.clock.advance(minutes(60))
    expect(await p.ipc.call('auth.signIn', { username: 'pat.partner', password: TEST_PASSWORD })).toMatchObject({ ok: false, error: { code: 'locked', message: expect.stringMatching(/Ask a partner to unlock it/) } })
  })

  it('refuses a person whose access is off, but only with the right password', async () => {
    const p = practice()
    p.db.prepare('UPDATE users SET active = 0 WHERE id = 3').run()
    expect(await p.ipc.call('auth.signIn', { username: 'sam.staff', password: 'not it at all' })).toMatchObject({ ok: false, error: { code: 'invalid' } })
    expect(await p.ipc.call('auth.signIn', { username: 'sam.staff', password: TEST_PASSWORD })).toMatchObject({
      ok: false,
      error: { code: 'forbidden', message: 'Your access to AETERNA CRM is turned off. Ask a partner if you need it back.' }
    })
    expect(events(p).map((e) => e.outcome)).toEqual(['wrong_password', 'access_off'])
  })

  it('replaces a temporary password before anything else, with no session until then', async () => {
    const p = practice()
    p.db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = 3').run(hashPassword('temporary pass 1'))
    const answer = await p.ipc.ok('auth.signIn', { username: 'sam.staff', password: 'temporary pass 1' })
    expect(answer).toMatchObject({ signedIn: false, passwordChange: { username: 'sam.staff', name: 'Sam Staff' } })
    expect(p.db.prepare('SELECT count(*) AS n FROM sessions').get()).toEqual({ n: 0 })
    expect(await p.ipc.call('auth.session', undefined)).toMatchObject({ ok: false, error: { code: 'unauthenticated' } })

    const change = (newPassword: string, currentPassword = 'temporary pass 1') => p.ipc.call('auth.completePasswordChange', { username: 'sam.staff', currentPassword, newPassword })
    expect(await change('temporary pass 1')).toMatchObject({ ok: false, error: { field: 'newPassword', message: expect.stringMatching(/not the temporary one/) } })
    expect(await change('sam.staff')).toMatchObject({ ok: false, error: { field: 'newPassword' } })
    expect(await change('my own new password', 'wrong temporary')).toMatchObject({ ok: false, error: { code: 'invalid' } })
    const before = p.ipc.auditCount()
    expect(await p.ipc.ok('auth.completePasswordChange', { username: 'sam.staff', currentPassword: 'temporary pass 1', newPassword: 'my own new password' })).toMatchObject({
      signedIn: true,
      actor: { id: 3 }
    })
    expect(p.ipc.auditCount()).toBe(before + 1)
    expect(p.db.prepare('SELECT must_change_password FROM users WHERE id = 3').get()).toEqual({ must_change_password: 0 })
    expect(events(p).at(-1)).toEqual({ outcome: 'success', detail: 'Chose a new password in place of a temporary one' })
    // Signing in as usual afterwards.
    await p.ipc.ok('auth.signOut', undefined)
    expect(await p.ipc.ok('auth.signIn', { username: 'sam.staff', password: 'my own new password' })).toMatchObject({ signedIn: true })
    expect(await p.ipc.call('auth.completePasswordChange', { username: 'sam.staff', currentPassword: 'my own new password', newPassword: 'another new one' })).toMatchObject({
      ok: false,
      error: { code: 'conflict' }
    })
  })

  it('ends the window’s earlier session when someone else signs in on it', async () => {
    const p = practice()
    await p.signIn('staff')
    await p.signIn('manager')
    expect(p.db.prepare('SELECT user_id, end_reason FROM sessions ORDER BY rowid').all()).toEqual([
      { user_id: 3, end_reason: 'signed_out' },
      { user_id: 2, end_reason: null }
    ])
    expect(await p.ipc.ok('auth.status', undefined)).toMatchObject({ actor: { id: 2 } })
  })
})
