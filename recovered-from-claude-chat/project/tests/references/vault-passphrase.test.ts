/**
 * Changing the vault passphrase (references/vault.ts): every stored secret and
 * postal authorisation code is opened with the current passphrase and sealed
 * again under the new one, in one transaction with the new key settings —
 * everything moves or nothing does, and the old passphrase stops working at
 * once. Made-up logins only.
 */
import { describe, expect, it } from 'vitest'
import { freshDb } from '../import/helpers'
import { CredentialVault } from '../../src/main/references/vault'
import { saveAuthorisation, type Actor } from '../../src/main/references/service'

const partner: Actor = { id: 1, name: 'Partner P', role: 'partner' }
const manager: Actor = { id: 2, name: 'Manager M', role: 'manager' }
const OLD = 'correct horse battery staple'
const NEW = 'violet lantern under the bridge'
const FAST = { N: 2 ** 12, r: 8, p: 1 }

function setup() {
  const db = freshDb()
  db.pragma('foreign_keys = ON')
  db.exec("INSERT INTO clients (ref, client_name, client_category, status, assigned_to) VALUES ('C1', 'Alpha Trading Ltd', 'company', 'Active', 'Staff A')")
  let clock = Date.parse('2026-10-05T09:00:00Z')
  const log: Array<{ action: string; id: string | number; oldValue?: unknown; newValue?: unknown }> = []
  const audit = (action: string, _t: string, id: string | number, oldValue?: unknown, newValue?: unknown): void => {
    log.push({ action, id, oldValue, newValue })
  }
  const vault = new CredentialVault(db, { now: () => clock, idleMinutes: 15, kdf: FAST })
  vault.setUp(OLD, partner, audit)
  const xero = vault.save({ owner: 'client', clientRef: 'C1', platform: 'Xero', loginId: 'alpha', secrets: [{ field: 'password', value: 'xero-secret' }, { field: 'pin', value: '4321' }] }, partner, audit)
  const dext = vault.save({ owner: 'practice', platform: 'Dext', loginId: 'firm', secrets: [{ field: 'password', value: 'dext-secret' }] }, partner, audit)
  const auth = saveAuthorisation(db, { clientRef: 'C1', service: 'corporation_tax', method: 'online_code', status: 'code_posted', requestedOn: '2026-09-28', expiresOn: '2026-10-28' }, partner, audit, '2026-10-05')
  vault.setAuthorisationCode(auth.id, 'AB12CD', partner, audit)
  const id = (entry: typeof xero, field: string): number => entry.secrets.find((s) => s.field === field)!.id
  return { db, log, audit, vault, xero, dext, auth, id, advance: (ms: number) => (clock += ms) }
}

describe('changing the vault passphrase', () => {
  it('seals every secret and code again under the new passphrase, and the old one stops working', () => {
    const { db, log, audit, vault, xero, dext, auth, id } = setup()
    vault.lock()
    const result = vault.changePassphrase(OLD, NEW, partner, audit)
    expect(result).toMatchObject({ setUp: true, unlocked: true, resealed: 4 })
    // Still open, under the new key: no need to unlock again.
    expect(vault.reveal(id(xero, 'password'), {}, partner, audit)).toBe('xero-secret')

    vault.lock()
    expect(() => vault.unlock(OLD, partner, audit)).toThrow('That passphrase isn’t right.')
    expect(vault.unlock(NEW, manager, audit).unlocked).toBe(true)
    expect(vault.reveal(id(xero, 'pin'), {}, manager, audit)).toBe('4321')
    expect(vault.reveal(id(dext, 'password'), {}, manager, audit)).toBe('dext-secret')
    expect(vault.revealAuthorisationCode(auth.id, manager, audit)).toBe('AB12CD')

    expect(db.prepare('SELECT version FROM vault_keys').all()).toEqual([{ version: 2 }])
    expect(db.prepare('SELECT DISTINCT key_version FROM credential_secrets').all()).toEqual([{ key_version: 2 }])
    expect(db.prepare('SELECT code_key_version FROM agent_authorisations WHERE code_ct IS NOT NULL').all()).toEqual([{ code_key_version: 2 }])
    expect(db.pragma('foreign_key_check')).toEqual([])
    expect(log.filter((l) => l.action === 'Vault passphrase changed')).toEqual([
      { action: 'Vault passphrase changed', id: 2, oldValue: { version: 1 }, newValue: { version: 2, secrets_resealed: 3, codes_resealed: 1 } }
    ])
    expect(JSON.stringify(log)).not.toMatch(/xero-secret|dext-secret|4321|AB12CD|horse|lantern/)

    // And again: each change is one more version, the old settings gone.
    vault.changePassphrase(NEW, 'a third passphrase, quite long', partner, audit)
    expect(db.prepare('SELECT version FROM vault_keys').all()).toEqual([{ version: 3 }])
    expect(vault.reveal(id(dext, 'password'), {}, partner, audit)).toBe('dext-secret')
  })

  it('is for a partner, with the current passphrase, and a new one long enough and different', () => {
    const { log, audit, vault, advance } = setup()
    expect(() => vault.changePassphrase(OLD, NEW, manager, audit)).toThrow('Only a partner can change the vault passphrase.')
    expect(() => vault.changePassphrase(OLD, 'too short', partner, audit)).toThrow('Use a new passphrase of at least 12 characters.')
    expect(() => vault.changePassphrase(OLD, OLD, partner, audit)).toThrow('Choose a passphrase different from the current one.')
    expect(() => vault.changePassphrase('not the passphrase', NEW, partner, audit)).toThrow('That passphrase isn’t right.')
    expect(log.filter((l) => l.action === 'Vault passphrase change failed')).toHaveLength(1)
    // Wrong passphrases here count towards the pause, as when unlocking.
    for (let i = 0; i < 4; i++) expect(() => vault.changePassphrase('still not it', NEW, partner, audit)).toThrow('That passphrase isn’t right.')
    expect(() => vault.changePassphrase(OLD, NEW, partner, audit)).toThrow(/Too many wrong passphrases/)
    advance(31_000)
    expect(vault.changePassphrase(OLD, NEW, partner, audit).resealed).toBe(4)

    const empty = new CredentialVault(freshDb(), { kdf: FAST })
    expect(() => empty.changePassphrase(OLD, NEW, partner, audit)).toThrow('The vault hasn’t been set up yet.')
  })

  it('changes nothing when a stored item can’t be opened, and names it', () => {
    const { db, audit, vault, xero, dext, id } = setup()
    // A ciphertext moved onto another secret no longer opens there.
    db.prepare(`UPDATE credential_secrets SET secret_ct = (SELECT secret_ct FROM credential_secrets WHERE id = ?),
      secret_iv = (SELECT secret_iv FROM credential_secrets WHERE id = ?), secret_tag = (SELECT secret_tag FROM credential_secrets WHERE id = ?) WHERE id = ?`)
      .run(id(xero, 'password'), id(xero, 'password'), id(xero, 'password'), id(dext, 'password'))
    const before = JSON.stringify([db.prepare('SELECT * FROM vault_keys').all(), db.prepare('SELECT * FROM credential_secrets ORDER BY id').all(), db.prepare('SELECT * FROM agent_authorisations').all()])
    expect(() => vault.changePassphrase(OLD, NEW, partner, audit)).toThrow(
      'Nothing was changed: one stored item can’t be opened with the current passphrase (the password for Dext). Remove or re-enter it, then change the passphrase.'
    )
    expect(JSON.stringify([db.prepare('SELECT * FROM vault_keys').all(), db.prepare('SELECT * FROM credential_secrets ORDER BY id').all(), db.prepare('SELECT * FROM agent_authorisations').all()])).toBe(before)
    vault.lock()
    expect(vault.unlock(OLD, partner, audit).unlocked).toBe(true)
    expect(vault.reveal(id(xero, 'password'), {}, partner, audit)).toBe('xero-secret')
  })
})
