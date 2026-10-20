/**
 * The firm's details (Settings → Firm details and the wizard's first step)
 * and the first-run wizard: saved before anyone can sign in, references
 * kept with a note and a data issue, resuming where it stopped, other
 * domains' steps reported through probes, and finishing.
 */
import { describe, expect, it } from 'vitest'
import { registerSetupProbe } from '@main/auth'
import { setRuntimeInfo } from '@main/app/runtime'
import { practice, useCheapHashes } from './helpers'

useCheapHashes()

const issues = (p: ReturnType<typeof practice>): Array<{ dedupe_key: string; status: string }> =>
  p.db.prepare("SELECT dedupe_key, status FROM data_issues WHERE entity = 'firm' ORDER BY dedupe_key").all() as Array<{ dedupe_key: string; status: string }>

describe('the firm’s details', () => {
  it('are read by everyone and changed by partners and managers, keeping fields a form leaves out', async () => {
    const p = practice()
    await p.signIn('staff')
    expect(await p.ipc.ok('firm.get', undefined)).toMatchObject({ details: { name: 'Test Practice LLP', country: 'United Kingdom' }, canEdit: false })
    expect(await p.ipc.call('firm.update', { name: 'Other' })).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    await p.signIn('manager')
    const saved = await p.ipc.ok('firm.update', { name: 'Test Practice LLP', postcode: 'ab1 2cd', phone: '020 7946 0000', companyNumber: 'oc 123456' })
    expect(saved.details).toMatchObject({ postcode: 'AB1 2CD', companyNumber: 'OC123456', phone: '020 7946 0000' })
    const again = await p.ipc.ok('firm.update', { name: 'Test Practice LLP', town: 'Leeds' })
    expect(again.details).toMatchObject({ postcode: 'AB1 2CD', town: 'Leeds' })
    const audit = p.db.prepare("SELECT summary, before_json, after_json FROM audit_log WHERE action = 'firm.update' ORDER BY id DESC LIMIT 1").get() as {
      summary: string
      before_json: string
      after_json: string
    }
    expect(audit.summary).toBe('Changed the firm’s details')
    expect(JSON.parse(audit.before_json)).toEqual({ town: null })
    expect(JSON.parse(audit.after_json)).toEqual({ town: 'Leeds' })
  })

  it('keep a reference that fails its check, with a note and a data issue that resolves itself', async () => {
    const p = practice()
    await p.signIn('partner')
    const saved = await p.ipc.ok('firm.update', { name: 'Test Practice LLP', vatNumber: 'GB 999 9999 74', utr: '1234567802' })
    expect(saved.details).toMatchObject({ vatNumber: 'GB999999974', utr: '1234567802' })
    expect(saved.warnings).toEqual({ vatNumber: 'Those 9 digits don’t pass the VAT number check. Look for a mistyped digit.' })
    expect(issues(p)).toEqual([{ dedupe_key: 'firm:vatNumber', status: 'open' }])
    const fixed = await p.ipc.ok('firm.update', { name: 'Test Practice LLP', vatNumber: 'GB999999973' })
    expect(fixed.warnings).toEqual({})
    expect(issues(p)).toEqual([{ dedupe_key: 'firm:vatNumber', status: 'resolved' }])
    expect(await p.ipc.call('firm.update', { name: 'Test Practice LLP', email: 'not an email' })).toMatchObject({ ok: false, error: { field: 'email' } })
    expect(await p.ipc.call('firm.update', { name: '  ' })).toMatchObject({ ok: false, error: { field: 'name' } })
  })
})

describe('the first-run wizard', () => {
  it('saves the firm before anyone can sign in, then carries on at the partner', async () => {
    const p = practice({ seedUsers: false, firmName: null })
    expect(await p.ipc.ok('setup.status', undefined)).toMatchObject({ firstRun: true, complete: false, firm: null, resumeAt: 'firm' })
    const status = await p.ipc.ok('setup.saveFirm', { name: 'Dynamic Accountants Ltd', postcode: 'ab1 2cd', email: 'office@example.test' })
    expect(status).toMatchObject({ resumeAt: 'partner', firm: { name: 'Dynamic Accountants Ltd', postcode: 'AB1 2CD' } })
    const entry = p.db.prepare("SELECT actor_kind, summary FROM audit_log WHERE action = 'firm.update'").get()
    expect(entry).toEqual({ actor_kind: 'system', summary: 'Added the firm’s details while setting up' })
    // The partner step needs no firm name now it is saved.
    const signedIn = await p.ipc.ok('setup.createFirstPartner', { name: 'Arif Rahman', username: 'arif', password: 'a long partner password' })
    expect(signedIn).toMatchObject({ signedIn: true, setupNeeded: false, firmName: 'Dynamic Accountants Ltd' })
    expect(await p.ipc.call('setup.saveFirm', { name: 'Changed' })).toMatchObject({ ok: false, error: { code: 'conflict' } })
    expect(await p.ipc.ok('setup.status', undefined)).toMatchObject({ firstRun: false, resumeAt: 'recovery' })
  })

  it('resumes at the step it was showing, and reads other domains’ steps from their probes', async () => {
    const p = practice({ seedUsers: false, firmName: null })
    await p.ipc.ok('setup.createFirstPartner', { firmName: 'Dynamic Accountants Ltd', name: 'Arif Rahman', username: 'arif', password: 'a long partner password' })
    let licensed = false
    registerSetupProbe('licence', () => licensed)
    registerSetupProbe('recovery', () => null)
    await p.ipc.ok('setup.progress', { at: 'vault' })
    await p.ipc.ok('setup.progress', { at: 'licence' })
    const status = await p.ipc.ok('setup.progress', { at: 'import' })
    expect(status.resumeAt).toBe('import')
    expect(Object.fromEntries(status.steps.map((s) => [s.id, s.state]))).toEqual({
      firm: 'done',
      partner: 'done',
      recovery: 'done',
      vault: 'passed',
      licence: 'skipped',
      import: 'todo',
      done: 'todo'
    })
    licensed = true
    expect((await p.ipc.ok('setup.status', undefined)).steps.find((s) => s.id === 'licence')?.state).toBe('done')
    // Going back is remembered too.
    expect(await p.ipc.ok('setup.progress', { at: 'vault' })).toMatchObject({ resumeAt: 'vault' })
    expect(await p.ipc.call('setup.progress', { at: 'partner' })).toMatchObject({ ok: false, error: { field: 'at' } })
  })

  it('is a partner’s once someone can sign in, and records what was left for later on finishing', async () => {
    const p = practice()
    expect(await p.ipc.call('setup.status', undefined)).toMatchObject({ ok: false, error: { code: 'unauthenticated' } })
    await p.signIn('manager')
    expect(await p.ipc.call('setup.status', undefined)).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    await p.signIn('partner')
    await p.ipc.ok('setup.progress', { at: 'done' })
    registerSetupProbe('vault', () => false)
    expect(await p.ipc.ok('setup.finish', undefined)).toMatchObject({ setupComplete: true })
    const after = JSON.parse((p.db.prepare("SELECT after_json FROM audit_log WHERE action = 'setup.finish'").get() as { after_json: string }).after_json)
    expect(after.steps).toEqual({ firm: 'done', partner: 'done', recovery: 'gone through', vault: 'left for later', licence: 'gone through', import: 'gone through' })
    expect(await p.ipc.ok('setup.status', undefined)).toMatchObject({ complete: true })
  })

  it('offers the first partner to the sign-in screen in development only', async () => {
    const p = practice()
    expect(await p.ipc.ok('dev.firstUser', undefined)).toEqual({ username: 'pat.partner', name: 'Pat Partner' })
    setRuntimeInfo({ packaged: true })
    expect(await p.ipc.call('dev.firstUser', undefined)).toMatchObject({ ok: false, error: { code: 'not_found' } })
  })
})
