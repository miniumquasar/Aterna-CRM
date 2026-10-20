/**
 * Settings → People: partners only; roles, access, unlock, temporary
 * passwords, removal (refused while clients or past work are under the
 * person, with other domains' checks added through the hook), the practice's
 * idle sign-out, and the directory for pickers. Every change is audited.
 */
import { describe, expect, it } from 'vitest'
import { registerPersonLinkCheck } from '@main/auth'
import { verifyPassword } from '@main/auth/passwords'
import { addClient } from '../../helpers/db'
import { TEST_PASSWORD, practice, useCheapHashes } from './helpers'

useCheapHashes()

const lastAudit = (p: ReturnType<typeof practice>): { action: string; summary: string; before_json: string | null; after_json: string | null } =>
  p.db.prepare('SELECT action, summary, before_json, after_json FROM audit_log ORDER BY id DESC LIMIT 1').get() as never

describe('people', () => {
  it('lists everyone for a partner, and nobody else', async () => {
    const p = practice()
    addClient(p.db, { assignedTo: 3 })
    p.db.prepare('UPDATE clients SET partner_id = 1').run()
    const managerWindow = p.window()
    await p.signIn('partner')
    await p.signIn('manager', managerWindow)
    const overview = await p.ipc.ok('people.list', undefined)
    expect(overview.people.map((x) => [x.name, x.role, x.isYou, x.signedIn])).toEqual([
      ['Morgan Manager', 'manager', false, true],
      ['Pat Partner', 'partner', true, true],
      ['Sam Staff', 'staff', false, false]
    ])
    expect(overview.people.find((x) => x.id === 3)?.clients).toEqual({ assigned: 1, responsible: 0 })
    expect(overview.people.find((x) => x.id === 1)?.clients).toEqual({ assigned: 0, responsible: 1 })
    expect(overview).toMatchObject({ invites: [], idle: { practiceMinutes: 30 }, lockAfter: 5 })
    expect(await managerWindow.call('people.list', undefined)).toMatchObject({ ok: false, error: { code: 'forbidden', message: 'Only a partner can manage people.' } })
    expect(await managerWindow.ok('people.directory', undefined)).toEqual([
      { id: 2, name: 'Morgan Manager', role: 'manager' },
      { id: 1, name: 'Pat Partner', role: 'partner' },
      { id: 3, name: 'Sam Staff', role: 'staff' }
    ])
  })

  it('changes a role, refusing your own', async () => {
    const p = practice()
    await p.signIn('partner')
    expect(await p.ipc.ok('people.setRole', { id: 3, role: 'manager' })).toMatchObject({ role: 'manager' })
    expect(lastAudit(p)).toMatchObject({ action: 'people.setRole', summary: 'Made Sam Staff a manager (was staff)' })
    expect(await p.ipc.call('people.setRole', { id: 1, role: 'staff' })).toMatchObject({ ok: false, error: { code: 'forbidden', message: 'You can’t change your own role. Another partner can.' } })
    expect(await p.ipc.call('people.setRole', { id: 3, role: 'owner' as never })).toMatchObject({ ok: false, error: { field: 'role' } })
    // No change, no entry.
    const n = p.ipc.auditCount()
    await p.ipc.ok('people.setRole', { id: 3, role: 'manager' })
    expect(p.ipc.auditCount()).toBe(n)
  })

  it('turns access off and on, and unlocks', async () => {
    const p = practice()
    await p.signIn('partner')
    expect(await p.ipc.ok('people.setAccess', { id: 2, active: false })).toMatchObject({ active: false })
    expect(lastAudit(p).summary).toBe('Turned off Morgan Manager’s access')
    expect(await p.ipc.call('people.setAccess', { id: 1, active: false })).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(await p.ipc.ok('people.setAccess', { id: 2, active: true })).toMatchObject({ active: true })
    expect(lastAudit(p).summary).toBe('Turned Morgan Manager’s access back on')

    p.db.prepare('UPDATE users SET locked_at = ?, failed_sign_ins = 5 WHERE id = 3').run(p.clock.now.toISOString())
    expect((await p.ipc.ok('people.list', undefined)).people.find((x) => x.id === 3)).toMatchObject({ locked: true, failedSignIns: 5, selfUnlocksAt: null })
    expect(await p.ipc.ok('people.unlock', { id: 3 })).toMatchObject({ locked: false, failedSignIns: 0 })
    expect(lastAudit(p).summary).toBe('Unlocked Sam Staff’s account')
  })

  it('sets a temporary password that must be replaced, ending the person’s sessions', async () => {
    const p = practice()
    const staffWindow = p.window()
    await p.signIn('partner')
    await p.signIn('staff', staffWindow)
    expect(await p.ipc.call('people.resetPassword', { id: 3, temporaryPassword: 'short' })).toMatchObject({ ok: false, error: { field: 'temporaryPassword' } })
    expect(await p.ipc.call('people.resetPassword', { id: 1, temporaryPassword: 'a temporary one' })).toMatchObject({ ok: false, error: { message: 'Change your own password in Settings → Your sign-in.' } })
    expect(await p.ipc.ok('people.resetPassword', { id: 3, temporaryPassword: 'a temporary one' })).toMatchObject({ mustChangePassword: true, signedIn: false })
    const audit = lastAudit(p)
    expect(audit.summary).toBe('Set a temporary password for Sam Staff')
    expect(audit.after_json).not.toMatch(/a temporary one/)
    expect(await staffWindow.ok('auth.status', undefined)).toMatchObject({ signedIn: false })
    const stored = p.db.prepare('SELECT password_hash FROM users WHERE id = 3').get() as { password_hash: string }
    expect(verifyPassword('a temporary one', stored.password_hash)).toBe(true)
    expect(await staffWindow.ok('auth.signIn', { username: 'sam.staff', password: 'a temporary one' })).toMatchObject({ passwordChange: { username: 'sam.staff' } })
  })

  it('edits a name and email', async () => {
    const p = practice()
    await p.signIn('partner')
    expect(await p.ipc.ok('people.update', { id: 3, name: 'Samantha Staff', email: 'sam@example.test' })).toMatchObject({ name: 'Samantha Staff', email: 'sam@example.test' })
    expect(JSON.parse(lastAudit(p).before_json ?? '{}')).toEqual({ name: 'Sam Staff', email: null })
    expect(await p.ipc.call('people.update', { id: 3, name: 'Sam', email: 'not an email' })).toMatchObject({ ok: false, error: { field: 'email' } })
  })

  it('refuses to remove someone with clients under them, naming what, and removes them once there are none', async () => {
    const p = practice()
    await p.signIn('partner')
    const client = addClient(p.db, { assignedTo: 3 })
    p.db.prepare('INSERT INTO clients (code, name, partner_id) VALUES (?, ?, ?)').run('ZZ0001', 'Other Ltd', 3)
    const check = await p.ipc.ok('people.removalCheck', { id: 3 })
    expect(check).toMatchObject({ canRemove: false, links: [{ label: '1 client they look after', count: 1 }, { label: '1 client they are the responsible partner for', count: 1 }] })
    expect(check.reason).toMatch(/Turn their access off instead/)
    expect(await p.ipc.call('people.remove', { id: 3 })).toMatchObject({ ok: false, error: { code: 'conflict' } })

    // Another domain's records count too, through the hook.
    registerPersonLinkCheck({ id: 'work.tasks', count: () => 4, describe: (n) => `${n} tasks` })
    p.db.prepare('UPDATE clients SET assigned_to = NULL, partner_id = NULL').run()
    expect(await p.ipc.ok('people.removalCheck', { id: 3 })).toMatchObject({ canRemove: false, links: [{ label: '4 tasks', count: 4 }] })
    registerPersonLinkCheck({ id: 'work.tasks', count: () => 0, describe: (n) => `${n} tasks` })

    expect(await p.ipc.ok('people.removalCheck', { id: 3 })).toEqual({ canRemove: true, links: [], reason: null })
    const after = await p.ipc.ok('people.remove', { id: 3 })
    expect(after.people.map((x) => x.id)).toEqual([2, 1])
    expect(lastAudit(p)).toMatchObject({ action: 'people.remove', summary: 'Removed Sam Staff from the practice' })
    expect(client).toBeGreaterThan(0)
    expect(await p.ipc.call('people.remove', { id: 1 })).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })

  it('turns a foreign key that still refuses into the same plain answer', async () => {
    const p = practice()
    await p.signIn('partner')
    p.db.exec('CREATE TABLE test_work (id INTEGER PRIMARY KEY, done_by INTEGER NOT NULL REFERENCES users(id))')
    p.db.prepare('INSERT INTO test_work (done_by) VALUES (3)').run()
    expect(await p.ipc.call('people.remove', { id: 3 })).toMatchObject({ ok: false, error: { code: 'conflict', message: expect.stringMatching(/still has records in the practice/) } })
    expect(p.db.prepare('SELECT count(*) AS n FROM users WHERE id = 3').get()).toEqual({ n: 1 })
  })

  it('keeps a partner who can sign in', async () => {
    const p = practice()
    p.db.prepare("UPDATE users SET role = 'partner' WHERE id = 2").run()
    await p.signIn('partner')
    // Pat can change Morgan, because Pat remains.
    expect(await p.ipc.ok('people.setRole', { id: 2, role: 'manager' })).toMatchObject({ role: 'manager' })
    expect(await p.ipc.ok('people.list', undefined)).toMatchObject({ people: expect.arrayContaining([expect.objectContaining({ id: 1, role: 'partner' })]) })
  })

  it('sets the practice’s idle sign-out from the choices', async () => {
    const p = practice()
    await p.signIn('partner')
    expect(await p.ipc.call('people.setIdlePolicy', { minutes: 45 })).toMatchObject({ ok: false, error: { field: 'minutes' } })
    expect(await p.ipc.ok('people.setIdlePolicy', { minutes: 60 })).toMatchObject({ idle: { practiceMinutes: 60 } })
    expect(lastAudit(p).summary).toBe('Set sign-out after 1 hour without use')
  })

  it('still lets a partner sign in after all of that', async () => {
    const p = practice()
    expect(await p.ipc.ok('auth.signIn', { username: 'pat.partner', password: TEST_PASSWORD })).toMatchObject({ signedIn: true })
  })
})
