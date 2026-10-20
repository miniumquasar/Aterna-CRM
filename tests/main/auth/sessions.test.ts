/**
 * Sessions: idle sign-out (the practice's time, a person's own shorter one,
 * the grace the main process allows), activity reports, sessions ended when
 * access is turned off, the idle background check, and password re-entry
 * proofs bound to the session.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_IDLE_MINUTES, IDLE_GRACE_SECONDS, REAUTH_MINUTES, REAUTH_REQUIRED_FIELD } from '@shared/contracts/auth'
import { requireRecentReauth } from '@main/auth'
import { endIdleSessions, trackWindowSession } from '@main/auth/sessions'
import { UserFacingError } from '@main/ipc/errors'
import { TEST_PASSWORD, minutes, practice, useCheapHashes } from './helpers'

useCheapHashes()

const grace = IDLE_GRACE_SECONDS * 1000

describe('idle sign-out', () => {
  it('ends a session after 30 minutes without use (plus the grace), and records why', async () => {
    const p = practice()
    await p.signIn('staff')
    p.clock.advance(minutes(DEFAULT_IDLE_MINUTES) + grace - 1000)
    expect(await p.ipc.ok('auth.status', undefined)).toMatchObject({ signedIn: true })
    p.clock.advance(2000)
    expect(await p.ipc.call('auth.session', undefined)).toMatchObject({ ok: false, error: { code: 'unauthenticated' } })
    expect(await p.ipc.ok('auth.status', undefined)).toMatchObject({ signedIn: false })
    expect(p.db.prepare('SELECT end_reason FROM sessions').get()).toEqual({ end_reason: 'idle' })
  })

  it('counts input reported by the window, not background reads', async () => {
    const p = practice()
    await p.signIn('staff')
    p.clock.advance(minutes(20))
    // A screen refreshing on its own doesn't keep the session open…
    await p.ipc.ok('auth.session', undefined)
    p.clock.advance(minutes(9))
    // …but the person using the app does.
    const info = await p.ipc.ok('auth.activity', undefined)
    expect(info).toMatchObject({ idleMinutes: 30, lastActiveAt: p.clock.now.toISOString() })
    p.clock.advance(minutes(30))
    expect(await p.ipc.ok('auth.status', undefined)).toMatchObject({ signedIn: true })
  })

  it('uses the practice’s setting, and a person’s own shorter choice', async () => {
    const p = practice()
    await p.signIn('partner')
    expect(await p.ipc.ok('people.setIdlePolicy', { minutes: 15 })).toMatchObject({ idle: { practiceMinutes: 15 } })
    expect(await p.ipc.ok('auth.session', undefined)).toMatchObject({ idleMinutes: 15 })
    expect(await p.ipc.ok('account.setIdle', { minutes: 5 })).toMatchObject({ idle: { practiceMinutes: 15, ownMinutes: 5, effectiveMinutes: 5 } })
    expect(await p.ipc.call('account.setIdle', { minutes: 30 })).toMatchObject({ ok: false, error: { field: 'minutes', message: expect.stringMatching(/after 15 minutes at most/) } })
    expect(await p.ipc.call('account.setIdle', { minutes: 7 })).toMatchObject({ ok: false, error: { field: 'minutes' } })
    p.clock.advance(minutes(5) + grace + 1000)
    expect(await p.ipc.ok('auth.status', undefined)).toMatchObject({ signedIn: false })
    // Choosing the practice's own time stores no choice of one's own.
    await p.signIn('partner')
    expect(await p.ipc.ok('account.setIdle', { minutes: 15 })).toMatchObject({ idle: { ownMinutes: null, effectiveMinutes: 15 } })
  })

  it('ends the session at once when the person’s access is turned off', async () => {
    const p = practice()
    const staffWindow = p.window()
    await p.signIn('partner')
    await p.signIn('staff', staffWindow)
    await p.ipc.ok('people.setAccess', { id: 3, active: false })
    expect(await staffWindow.ok('auth.status', undefined)).toMatchObject({ signedIn: false })
    expect(p.db.prepare('SELECT end_reason FROM sessions WHERE user_id = 3').get()).toEqual({ end_reason: 'access_removed' })
  })

  it('records an idle sign-out from the window as idle, and an ordinary one as signed out', async () => {
    const p = practice()
    await p.signIn('staff')
    await p.ipc.ok('auth.signOut', { reason: 'idle' })
    await p.signIn('staff')
    await p.ipc.ok('auth.signOut', undefined)
    expect(p.db.prepare('SELECT end_reason FROM sessions ORDER BY rowid').all()).toEqual([{ end_reason: 'idle' }, { end_reason: 'signed_out' }])
  })

  it('has a background check that ends idle sessions and says when the window’s was one', async () => {
    const p = practice()
    await p.signIn('staff')
    const id = (p.db.prepare('SELECT id FROM sessions').get() as { id: string }).id
    expect(endIdleSessions(p.db, p.clock.now)).toEqual({ ended: [], windowSessionEnded: false })
    trackWindowSession(id)
    const later = new Date(p.clock.now.getTime() + minutes(31) + grace)
    expect(endIdleSessions(p.db, later)).toEqual({ ended: [id], windowSessionEnded: true })
    expect(p.db.prepare('SELECT end_reason FROM sessions').get()).toEqual({ end_reason: 'idle' })
  })
})

describe('password re-entry', () => {
  const ctxFor = (p: ReturnType<typeof practice>) => ({
    session: { id: (p.db.prepare('SELECT id FROM sessions WHERE ended_at IS NULL').get() as { id: string } | undefined)?.id ?? null },
    now: () => p.clock.now
  })

  it('is open for five minutes after signing in or confirming the password, on that session only', async () => {
    const p = practice()
    await p.signIn('partner')
    expect(() => requireRecentReauth(ctxFor(p), 'print the recovery sheet')).not.toThrow()
    p.clock.advance(minutes(REAUTH_MINUTES) + 1)
    let refusal: unknown
    try {
      requireRecentReauth(ctxFor(p), 'print the recovery sheet')
    } catch (err) {
      refusal = err
    }
    expect(refusal).toBeInstanceOf(UserFacingError)
    expect(refusal).toMatchObject({ code: 'forbidden', field: REAUTH_REQUIRED_FIELD, message: 'For your security, enter your password again to print the recovery sheet.' })
    expect(await p.ipc.ok('auth.session', undefined)).toMatchObject({ reauthUntil: null })

    const { until } = await p.ipc.ok('auth.reauth', { password: TEST_PASSWORD })
    expect(until).toBe(new Date(p.clock.now.getTime() + minutes(REAUTH_MINUTES)).toISOString())
    expect(await p.ipc.ok('auth.session', undefined)).toMatchObject({ reauthUntil: until })
    expect(() => requireRecentReauth(ctxFor(p))).not.toThrow()
    // Signing out ends it.
    const session = ctxFor(p)
    await p.ipc.ok('auth.signOut', undefined)
    expect(() => requireRecentReauth(session)).toThrow(UserFacingError)
  })

  it('counts wrong passwords towards the lock, and the one that locks signs the person out', async () => {
    const p = practice()
    p.db.prepare("UPDATE users SET role = 'partner' WHERE id = 2").run()
    await p.signIn('partner')
    const messages: string[] = []
    for (let i = 0; i < 4; i++) {
      const r = await p.ipc.call('auth.reauth', { password: 'not my password' })
      if (r.ok) throw new Error('expected a refusal')
      expect(r.error).toMatchObject({ code: 'invalid', field: 'password' })
      messages.push(r.error.message)
    }
    expect(messages[0]).toBe('That password isn’t right. Check it and try again.')
    expect(messages[3]).toBe('That password isn’t right. One more wrong password will lock the account.')
    const last = await p.ipc.call('auth.reauth', { password: 'not my password' })
    expect(last).toMatchObject({ ok: false, error: { code: 'locked', message: expect.stringMatching(/you have been signed out and the account is locked\. Ask a partner/) } })
    expect(p.ipc.events).toContainEqual({ event: 'session.ended', payload: { reason: 'locked' } })
    expect(await p.ipc.ok('auth.status', undefined)).toMatchObject({ signedIn: false })
    expect(await p.ipc.call('auth.signIn', { username: 'pat.partner', password: TEST_PASSWORD })).toMatchObject({ ok: false, error: { code: 'locked' } })
    const detail = p.db.prepare("SELECT detail FROM sign_in_events WHERE outcome = 'wrong_password' ORDER BY id DESC LIMIT 1").get()
    expect(detail).toEqual({ detail: 'Wrong password when asked for it again; locked after 5 wrong passwords in a row' })
  })

  it('protects resetting someone else’s password', async () => {
    const p = practice()
    await p.signIn('partner')
    p.clock.advance(minutes(REAUTH_MINUTES + 1))
    await p.ipc.ok('auth.activity', undefined)
    expect(await p.ipc.call('people.resetPassword', { id: 3, temporaryPassword: 'a temporary one' })).toMatchObject({
      ok: false,
      error: { code: 'forbidden', field: REAUTH_REQUIRED_FIELD }
    })
    await p.ipc.ok('auth.reauth', { password: TEST_PASSWORD })
    expect(await p.ipc.ok('people.resetPassword', { id: 3, temporaryPassword: 'a temporary one' })).toMatchObject({ mustChangePassword: true })
  })
})
