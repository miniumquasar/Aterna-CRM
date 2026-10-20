/**
 * First-run setup (src/main/setup/service.ts), the firm's details
 * (src/main/records/firm.ts), the vault passphrase check and sheet, and
 * migration 0017. Made-up data only.
 */
import { describe, expect, it } from 'vitest'
import { baseDb, freshDb } from '../import/helpers'
import { applyMigrations } from '../../src/main/db/migrate'
import { firmDetails, saveFirm } from '../../src/main/records/firm'
import { finishSetup, isFirstRun, markStep, setupStatus, type SetupProbe } from '../../src/main/setup/service'
import { CredentialVault } from '../../src/main/references/vault'
import { passphraseGroups, vaultSheetHtml } from '../../src/main/security/vault-sheet'
import type { Actor } from '../../src/main/access/policy'
import { auditOf } from '../records/helpers'

const partner: Actor = { id: 1, name: 'Partner P', role: 'partner' }
const manager: Actor = { id: 2, name: 'Manager M', role: 'manager' }

function probe(over: Partial<{ sheet: boolean | null; vault: boolean; licensed: boolean }> = {}): SetupProbe {
  const p = { sheet: false as boolean | null, vault: false, licensed: false, ...over }
  return { recoverySheetDone: () => p.sheet, vaultSetUp: () => p.vault, licensed: () => p.licensed }
}

const addPartner = (db: ReturnType<typeof freshDb>): void => {
  db.prepare("INSERT INTO users (id, username, name, role, active, password_hash) VALUES (1, 'partner.p', 'Partner P', 'partner', 1, 'x')").run()
}

const states = (s: ReturnType<typeof setupStatus>): Record<string, string> => Object.fromEntries(s.steps.map((x) => [x.key, x.state]))

describe('first-run setup', () => {
  it('starts with every step to do, the firm first', () => {
    const db = freshDb()
    const s = setupStatus(db, probe())
    expect(s).toMatchObject({ complete: false, firstRun: true, next: 'firm', firm: null })
    expect(states(s)).toEqual({ firm: 'todo', partner: 'todo', recovery: 'todo', vault: 'todo', licence: 'todo', import: 'todo' })
    expect(isFirstRun(db)).toBe(true)
  })

  it('saves the firm’s details before anyone can sign in, recorded as made while setting up', () => {
    const db = freshDb()
    expect(() => saveFirm(db, null, { name: '  ' })).toThrow('Enter the firm’s name.')
    expect(() => saveFirm(db, null, { name: 'Example Accountants Ltd', email: 'not an email' })).toThrow(/doesn’t look right/)
    saveFirm(db, null, { name: 'Example Accountants Ltd', postcode: 'AB1 2CD', email: 'office@example.test' })
    expect(firmDetails(db)).toMatchObject({ name: 'Example Accountants Ltd', postcode: 'AB1 2CD', email: 'office@example.test', time_zone: 'Europe/London', locale: 'en-GB' })
    expect(auditOf(db, 'Added the firm’s details while setting up')).toMatchObject([{ user_name: 'system' }])
    const s = setupStatus(db, probe())
    expect(s.next).toBe('partner')
    expect(s.firm).toMatchObject({ name: 'Example Accountants Ltd', postcode: 'AB1 2CD' })
  })

  it('keeps fields a shorter form leaves out, and records changes with what they replaced', () => {
    const db = freshDb()
    saveFirm(db, null, { name: 'Example Accountants Ltd', phone: '020 7946 0000', city: 'London' })
    addPartner(db)
    saveFirm(db, partner, { name: 'Example Accountants LLP', city: 'Leeds' })
    expect(firmDetails(db)).toMatchObject({ name: 'Example Accountants LLP', phone: '020 7946 0000', city: 'Leeds' })
    expect(auditOf(db, 'Changed the firm’s details')).toEqual([
      { user_name: 'Partner P', record_id: '1', old: { name: 'Example Accountants Ltd', city: 'London' }, new: { name: 'Example Accountants LLP', city: 'Leeds' } }
    ])
    expect(() => saveFirm(db, { id: 3, name: 'Staff S', role: 'staff' }, { name: 'X' })).toThrow(/Only partners and managers/)
    saveFirm(db, manager, { name: 'Example Accountants LLP', city: 'York' })
    expect(firmDetails(db)?.city).toBe('York')
  })

  it('reads each step from the records, so a restart carries on where it stopped', () => {
    const db = freshDb()
    saveFirm(db, null, { name: 'Example Accountants Ltd' })
    addPartner(db)
    expect(setupStatus(db, probe()).next).toBe('recovery')
    expect(setupStatus(db, probe({ sheet: true })).next).toBe('vault')
    expect(setupStatus(db, probe({ sheet: true, vault: true })).next).toBe('licence')
    expect(setupStatus(db, probe({ sheet: true, vault: true, licensed: true })).next).toBe('import')
    db.prepare("INSERT INTO clients (ref, client_name, client_category, status) VALUES ('C1', 'Alpha Ltd', 'company', 'Active')").run()
    const s = setupStatus(db, probe({ sheet: true, vault: true, licensed: true }))
    expect(s).toMatchObject({ next: null, complete: false, firstRun: false })
  })

  it('treats the recovery sheet as done where there is none to make, and says why', () => {
    const db = freshDb()
    const s = setupStatus(db, probe({ sheet: null }))
    expect(states(s).recovery).toBe('done')
    expect(s.notes.recovery).toMatch(/set outside the app/)
  })

  it('lets a partner leave steps for later and see the licence step, recorded in the audit log', () => {
    const db = freshDb()
    saveFirm(db, null, { name: 'Example Accountants Ltd' })
    addPartner(db)
    expect(() => markStep(db, manager, 'vault', 'skipped')).toThrow(/Only a partner/)
    expect(() => markStep(db, partner, 'firm', 'skipped')).toThrow(/isn’t a setup step/)
    expect(() => markStep(db, partner, 'vault', 'later')).toThrow(/done or left for later/)
    expect(() => markStep(db, partner, 'vault', 'done')).toThrow(/when its work is done/)
    markStep(db, partner, 'recovery', 'skipped')
    markStep(db, partner, 'vault', 'skipped')
    markStep(db, partner, 'licence', 'done')
    markStep(db, partner, 'licence', 'done') // no second entry
    expect(states(setupStatus(db, probe()))).toMatchObject({ recovery: 'skipped', vault: 'skipped', licence: 'done', import: 'todo' })
    expect(setupStatus(db, probe()).next).toBe('import')
    expect(auditOf(db, 'Left a setup step for later').map((a) => a.new)).toEqual([{ 'setup.recovery': 'skipped' }, { 'setup.vault': 'skipped' }])
    expect(auditOf(db, 'Finished a setup step')).toHaveLength(1)
    // Doing the work later counts, whatever was chosen in the wizard.
    expect(states(setupStatus(db, probe({ vault: true }))).vault).toBe('done')
  })

  it('finishes only with the firm and a partner, recording what was left for later', () => {
    const db = freshDb()
    addPartner(db)
    expect(() => finishSetup(db, partner, probe())).toThrow(/firm’s name/)
    saveFirm(db, partner, { name: 'Example Accountants Ltd' })
    expect(() => finishSetup(db, manager, probe())).toThrow(/Only a partner/)
    const done = finishSetup(db, partner, probe({ sheet: true }))
    expect(done.complete).toBe(true)
    expect(states(done)).toMatchObject({ recovery: 'done', vault: 'skipped', licence: 'skipped', import: 'skipped' })
    expect(auditOf(db, 'Finished setting up the practice')).toMatchObject([
      { user_name: 'Partner P', new: { steps: { firm: 'done', partner: 'done', recovery: 'done', vault: 'left for later', licence: 'left for later', import: 'left for later' } } }
    ])
    // Finishing again changes nothing.
    expect(finishSetup(db, partner, probe()).complete).toBe(true)
    expect(auditOf(db, 'Finished setting up the practice')).toHaveLength(1)
  })
})

describe('migration 0017', () => {
  it('marks a practice that already has people who sign in as set up', () => {
    const db = baseDb()
    db.prepare("INSERT INTO users (username, name, role, active, password_hash) VALUES ('a.b', 'A B', 'partner', 1, 'x')").run()
    expect(applyMigrations(db)).toContain('0017_setup')
    expect(setupStatus(db, probe()).complete).toBe(true)
  })

  it('leaves a new installation to the wizard', () => {
    const db = freshDb()
    expect(setupStatus(db, probe()).complete).toBe(false)
    expect(applyMigrations(db)).toEqual([])
  })
})

describe('vault passphrase sheet', () => {
  const FAST = { N: 2 ** 12, r: 8, p: 1 }
  const PASS = 'correct horse battery staple'

  it('checks the passphrase without unlocking, partners only, with the same pause after mistakes', () => {
    const db = freshDb()
    let clock = Date.parse('2026-10-12T09:00:00Z')
    const actions: string[] = []
    const audit = (action: string): void => {
      actions.push(action)
    }
    const vault = new CredentialVault(db, { now: () => clock, kdf: FAST })
    expect(() => vault.confirmPassphrase(PASS, partner, audit)).toThrow(/hasn’t been set up/)
    vault.setUp(PASS, partner, audit)
    vault.lock()
    expect(() => vault.confirmPassphrase(PASS, manager, audit)).toThrow(/Only a partner/)
    vault.confirmPassphrase(PASS, partner, audit)
    expect(vault.status(partner).unlocked).toBe(false)
    for (let i = 0; i < 5; i++) expect(() => vault.confirmPassphrase('wrong passphrase!', partner, audit)).toThrow('That passphrase isn’t right.')
    expect(() => vault.confirmPassphrase(PASS, partner, audit)).toThrow(/Too many wrong passphrases/)
    expect(() => vault.unlock(PASS, partner, audit)).toThrow(/Too many wrong passphrases/)
    clock += 61_000
    vault.confirmPassphrase(PASS, partner, audit)
    expect(actions.filter((a) => a === 'Vault passphrase check failed')).toHaveLength(5)
  })

  it('prints the passphrase in groups, escaped, with no scripts or network', () => {
    expect(passphraseGroups('abcdefghij')).toEqual(['abcd', 'efgh', 'ij'])
    const html = vaultSheetHtml({ passphrase: 'a<b> c&d 0O1l', firm: 'Example & Co', productName: 'AETERNA CRM', createdFor: 'Partner P', date: '12 October 2026' })
    expect(html).toContain("default-src 'none'")
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain('Example &amp; Co')
    expect(html).toContain('a&lt;b&gt;')
    expect(html).toContain('␣')
    expect(html).toMatch(/digit zero/)
    expect(html).toMatch(/small L/)
    expect(html).not.toContain('a<b>')
  })
})
