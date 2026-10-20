/**
 * Invitations: a partner invites someone with a role and an expiry; the code
 * is shown once and only its hash kept; the invited person accepts it on
 * this PC, once, before it expires or is cancelled; a new code replaces a
 * lost one; codes that don't match are limited per window.
 */
import { describe, expect, it } from 'vitest'
import { INVITE_ALPHABET, normaliseInviteCode } from '@shared/contracts/auth'
import { INVITE_ATTEMPT_LIMIT, hashInviteCode } from '@main/auth/invites'
import { minutes, practice, useCheapHashes } from './helpers'

useCheapHashes()

async function invited(p: ReturnType<typeof practice>, name = 'Jane Smith', role: 'staff' | 'manager' | 'partner' = 'staff', expiresInDays = 7) {
  const created = await p.ipc.ok('people.invite', { name, email: 'jane@example.test', role, expiresInDays })
  return created
}

describe('invitations', () => {
  it('makes a 12-character code from the safe letters, keeps only its hash, and lists the invitation', async () => {
    const p = practice()
    await p.signIn('partner')
    const { code, invite } = await invited(p)
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    for (const ch of code.replace(/-/g, '')) expect(INVITE_ALPHABET).toContain(ch)
    expect(invite).toMatchObject({ name: 'Jane Smith', role: 'staff', invitedBy: 'Pat Partner', expired: false, expiresAt: '2026-10-27T09:00:00.000Z' })
    const stored = p.db.prepare('SELECT token_hash FROM invites').get() as { token_hash: string }
    expect(stored.token_hash).toBe(hashInviteCode(normaliseInviteCode(code) as string))
    expect(JSON.stringify(p.db.prepare('SELECT * FROM audit_log').all())).not.toContain(code.replace(/-/g, ''))
    expect((await p.ipc.ok('people.list', undefined)).invites).toHaveLength(1)
    expect(await p.ipc.call('people.invite', { name: 'jane smith', role: 'staff', expiresInDays: 7 })).toMatchObject({ ok: false, error: { code: 'conflict', message: expect.stringMatching(/already waiting/) } })
    expect(await p.ipc.call('people.invite', { name: 'Ann', role: 'staff', expiresInDays: 5 })).toMatchObject({ ok: false, error: { field: 'expiresInDays' } })
  })

  it('is accepted once, on this PC, by the person it names', async () => {
    const p = practice()
    const newcomer = p.window()
    await p.signIn('partner')
    const { code } = await invited(p, 'Jane Smith', 'manager')
    const typed = code.toLowerCase().replace(/-/g, ' ')
    expect(await newcomer.ok('auth.checkInvite', { code: typed })).toEqual({
      name: 'Jane Smith',
      email: 'jane@example.test',
      role: 'manager',
      firmName: 'Test Practice LLP',
      invitedBy: 'Pat Partner',
      expiresAt: '2026-10-27T09:00:00.000Z',
      suggestedUsername: 'jane.smith'
    })
    expect(await newcomer.call('auth.acceptInvite', { code, name: 'Jane Smith', username: 'sam.staff', password: 'jane’s own password' })).toMatchObject({ ok: false, error: { code: 'conflict', field: 'username' } })
    expect(await newcomer.call('auth.acceptInvite', { code, name: 'Jane Smith', username: 'jane.smith', password: 'jane.smith' })).toMatchObject({ ok: false, error: { field: 'password' } })
    const status = await newcomer.ok('auth.acceptInvite', { code, name: 'Jane Smith', username: 'jane.smith', password: 'jane’s own password' })
    expect(status).toMatchObject({ signedIn: true, actor: { username: 'jane.smith', role: 'manager', name: 'Jane Smith' } })
    expect(p.db.prepare("SELECT email, created_by FROM users WHERE username = 'jane.smith'").get()).toEqual({ email: 'jane@example.test', created_by: 1 })
    expect(p.db.prepare("SELECT title, audience FROM notifications WHERE kind = 'people.joined'").get()).toEqual({ title: 'Jane Smith has joined the practice', audience: 'partners' })
    expect(p.db.prepare("SELECT outcome, detail FROM sign_in_events WHERE username = 'jane.smith'").get()).toEqual({ outcome: 'success', detail: 'First sign-in, from an invitation' })
    // Single use.
    const again = p.window()
    expect(await again.call('auth.checkInvite', { code })).toMatchObject({ ok: false, error: { code: 'conflict', message: expect.stringMatching(/already been used/) } })
    expect(await again.call('auth.acceptInvite', { code, name: 'Mallory', username: 'mallory', password: 'mallory’s password' })).toMatchObject({ ok: false, error: { code: 'conflict' } })
  })

  it('stops working once it expires, and a new code (with a new expiry) replaces the old', async () => {
    const p = practice()
    const visitor = p.window()
    await p.signIn('partner')
    const { code, invite } = await invited(p, 'Jane Smith', 'staff', 1)
    p.clock.advance(minutes(24 * 60) + 1)
    expect(await visitor.call('auth.checkInvite', { code })).toMatchObject({ ok: false, error: { code: 'conflict', message: 'That invitation expired on 21 Oct 2026. Ask the partner who invited you for a new code.' } })
    await p.signIn('partner')
    expect((await p.ipc.ok('people.list', undefined)).invites).toMatchObject([{ id: invite.id, expired: true }])
    const renewed = await p.ipc.ok('people.renewInvite', { id: invite.id, expiresInDays: 14 })
    expect(renewed.code).not.toBe(code)
    expect(renewed.invite).toMatchObject({ expired: false })
    expect(await visitor.call('auth.checkInvite', { code })).toMatchObject({ ok: false, error: { code: 'not_found' } })
    expect(await visitor.ok('auth.checkInvite', { code: renewed.code })).toMatchObject({ name: 'Jane Smith' })
  })

  it('can be cancelled', async () => {
    const p = practice()
    await p.signIn('partner')
    const { code, invite } = await invited(p)
    const overview = await p.ipc.ok('people.cancelInvite', { id: invite.id })
    expect(overview.invites).toEqual([])
    expect(await p.window().call('auth.checkInvite', { code })).toMatchObject({ ok: false, error: { code: 'conflict', message: 'That invitation was cancelled. Ask a partner for a new one.' } })
  })

  it('is for partners to make, and suggests a free username', async () => {
    const p = practice()
    await p.signIn('manager')
    expect(await p.ipc.call('people.invite', { name: 'X', role: 'staff', expiresInDays: 7 })).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    await p.signIn('partner')
    const { code } = await p.ipc.ok('people.invite', { name: 'Sam Staff', role: 'staff', expiresInDays: 7 })
    p.db.prepare("UPDATE users SET username = 'sam.staff' WHERE id = 3").run()
    expect(await p.window().ok('auth.checkInvite', { code })).toMatchObject({ suggestedUsername: 'sam.staff2' })
  })

  it('makes a window wait after too many codes that don’t match', async () => {
    const p = practice()
    const visitor = p.window()
    for (let i = 0; i < INVITE_ATTEMPT_LIMIT; i++) {
      expect(await visitor.call('auth.checkInvite', { code: 'ABCD-EFGH-JKMN' })).toMatchObject({ ok: false, error: { code: 'not_found' } })
    }
    expect(await visitor.call('auth.checkInvite', { code: 'ABCD-EFGH-JKMN' })).toMatchObject({ ok: false, error: { code: 'locked', message: expect.stringMatching(/Wait 10 minutes/) } })
    expect(await visitor.call('auth.checkInvite', { code: 'too short' })).toMatchObject({ ok: false, error: { code: 'locked' } })
    p.clock.advance(minutes(10))
    expect(await visitor.call('auth.checkInvite', { code: 'too short' })).toMatchObject({ ok: false, error: { code: 'invalid', field: 'code' } })
  })
})
