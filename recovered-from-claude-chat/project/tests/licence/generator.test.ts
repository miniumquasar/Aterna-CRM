import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LicenceService } from '../../src/main/licence/service'
import { appendKey, appendRevocation, nextSerial, readRegister, revocations } from '../../tools/licence-generator/register'
import { createVault, openVault } from '../../tools/licence-generator/vault'
import { codeOf, memorySink } from './helpers'

const ROOT = resolve(__dirname, '../..')

describe('vendor tool', () => {
  it('vault opens with the right passphrase only, and detects an edited header', () => {
    const v = createVault(0, 'correct horse battery staple')
    expect(openVault(v, 'correct horse battery staple').asymmetricKeyType).toBe('ed25519')
    expect(() => openVault(v, 'not the passphrase')).toThrow(/Wrong passphrase/)
    expect(() => openVault({ ...v, keyId: 1 }, 'correct horse battery staple')).toThrow(/Wrong passphrase|altered/)
  }, 30_000)

  it('register hash chain detects an edited line, and keeps older lines readable', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'reg-')), 'register.jsonl')
    // a line written by the first version of the tool, hashed the way it hashed lines
    const old = { seq: 1, keyId: 0, serial: 1, type: 'term', term: '12 months', issuedOn: '2026-10-02', machineCode: null, customer: 'Old Firm Ltd',
      reference: null, key: 'K', createdAt: '2026-10-02T10:00:00Z', prevHash: '0'.repeat(64) }
    const fields = ['seq', 'keyId', 'serial', 'type', 'term', 'issuedOn', 'machineCode', 'customer', 'reference', 'key', 'createdAt', 'prevHash'] as const
    const oldHash = createHash('sha256').update(JSON.stringify(fields.map((f) => old[f]))).digest('hex')
    writeFileSync(p, `${JSON.stringify({ ...old, hash: oldHash })}\n`)
    for (let i = 2; i <= 4; i += 1) {
      appendKey(p, {
        keyId: 0, serial: i, type: 'term', term: { unit: 'months', amount: 12 }, issuedOn: '2026-10-02', startsOn: '2026-10-02', validUntil: '2027-10-01',
        machineCode: null, firm: 'Test Firm Ltd', account: '0:1', replaces: null, reference: null, key: `KEY-${i}`, createdAt: '2026-10-02T10:00:00Z'
      })
    }
    appendRevocation(p, { keyId: 0, serial: 2, reason: 'refund', createdAt: '2026-10-03T10:00:00Z' })
    expect(readRegister(p).map((r) => r.seq)).toEqual([1, 2, 3, 4, 5])
    expect(nextSerial(readRegister(p), 0)).toBe(5)
    expect([...revocations(readRegister(p))]).toEqual([['0:2', 'refund']])
    writeFileSync(p, readFileSync(p, 'utf8').replace('"serial":3', '"serial":9'))
    expect(() => readRegister(p)).toThrow(/line 3/)
  })

  it('init → issue → renew → replace → revoke → trust file, and the app accepts the keys and honours the withdrawals', () => {
    const home = mkdtempSync(join(tmpdir(), 'lic-'))
    const env = { ...process.env, LICENCE_HOME: home, LICENCE_PASSPHRASE: 'integration test passphrase' }
    const run = (...args: string[]): string =>
      execFileSync(process.execPath, [join(ROOT, 'node_modules/tsx/dist/cli.mjs'), join(ROOT, 'tools/licence-generator/cli.ts'), ...args], { env, encoding: 'utf8' })
    const keyIn = (out: string): string => /\n([0-9A-Z]{8}(?:-[0-9A-Z]{1,8})+)\n/.exec(out)![1]

    run('init')
    const first = run('issue', '--firm', '  Test   Firm Ltd ', '--term', '1y', '--issued', '2026-10-02', '--reference', 'INV-1')
    expect(first).toMatch(/Licence 000001 for Test Firm Ltd · 12 months · covers 2 October 2026 – 1 October 2027 · any computer/)
    expect(first).toMatch(/Use the same key on every PC in your firm/)
    const k1 = keyIn(first)
    expect(run('verify', k1)).toMatch(/Valid licence 000001 for Test Firm Ltd · 12 months · covers 2 October 2026 – 1 October 2027/)
    expect(() => run('issue', '--firm', 'test firm ltd', '--issued', '2026-11-01')).toThrow(/already has licence 000001.*renew --serial 1/s)

    // renewing early: the new year starts the day after the current one ends
    const k2 = keyIn(run('renew', '--serial', '1', '--issued', '2027-08-01', '--reference', 'INV-2'))
    expect(run('verify', k2)).toMatch(/covers 2 October 2027 – 1 October 2028/)
    // the firm changes its name: same dates, new name, the old key withdrawn
    const replaced = run('replace', '--serial', '2', '--firm', 'Renamed Firm LLP', '--issued', '2027-09-01')
    expect(replaced).toMatch(/Licence 000003 for Renamed Firm LLP · 12 months · covers 2 October 2027 – 1 October 2028/)
    expect(replaced).toMatch(/Replaces licence 000002/)
    const k3 = keyIn(replaced)
    run('revoke', '--serial', '1', '--reason', 'refund requested')
    expect(run('show', '--serial', '3')).toContain(k3)
    expect(run('show', '--serial', '2')).toMatch(/WITHDRAWN: replaced by 000003/)
    const list = run('list')
    expect(list).toMatch(/000001 .* \[withdrawn: refund requested\]/)
    expect(list).toMatch(/000002 .* \[withdrawn: replaced by 000003\]/)
    expect(list).toMatch(/5 register line\(s\) · integrity verified/)

    const trustPath = join(home, 'public-keys.ts')
    run('trust-file', '--write', trustPath)
    const trust = readFileSync(trustPath, 'utf8')
    const publicKey = /\n {2}0: '([A-Za-z0-9_-]{43})',\n/.exec(trust)![1]
    expect(trust).toContain("'0:1', // refund requested")
    expect(trust).toContain("'0:2', // replaced by 000003")

    // the app, built with that trust file
    const at = (date: string, revoked = new Set<string>()) =>
      new LicenceService({ sinks: [memorySink('m')], machineId: 'pc-1', trustedKeys: { 0: publicKey }, revoked, now: () => new Date(`${date}T10:00:00`), log: () => undefined })
    const before = at('2027-09-02')
    before.activate(k1)
    before.activate(k2)
    expect(before.activate(k3)).toMatchObject({ licensedTo: 'Renamed Firm LLP', newValidUntil: '2028-10-01' })
    const withdrawn = at('2027-09-02', new Set(['0:1', '0:2']))
    expect(codeOf(() => withdrawn.activate(k2))).toBe('revoked')
    expect(withdrawn.activate(k3).status).toMatchObject({ state: 'trial', pendingFrom: '2027-10-02', licensedTo: 'Renamed Firm LLP' })
  }, 120_000)
})

