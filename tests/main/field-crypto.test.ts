import { describe, expect, it } from 'vitest'
import { createFieldCrypto, decryptField, encryptField, isEncryptedValue } from '@main/security/field-crypto'
import { TEST_DB_KEY, createTestDb } from '../helpers/db'

const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)

describe('field sealing', () => {
  it('seals and opens a value, with a fresh nonce each time', () => {
    const c = createFieldCrypto(KEY_A)
    const one = c.encrypt('AB123456C')
    const two = c.encrypt('AB123456C')
    expect(one).toMatch(/^v1:[A-Za-z0-9+/=]+$/)
    expect(one).not.toBe(two)
    expect(c.decrypt(one)).toBe('AB123456C')
    expect(c.decrypt(two)).toBe('AB123456C')
    expect(isEncryptedValue(one)).toBe(true)
    expect(isEncryptedValue('AB123456C')).toBe(false)
  })

  it('won’t open under another database’s key', () => {
    const sealed = createFieldCrypto(KEY_A).encrypt('secret')
    expect(() => createFieldCrypto(KEY_B).decrypt(sealed)).toThrow(/couldn’t be opened/)
  })

  it('binds the context, so a value moved to another column won’t open', () => {
    const c = createFieldCrypto(KEY_A)
    const sealed = c.encrypt('1234-5678', 'clients.ch_auth_code')
    expect(c.decrypt(sealed, 'clients.ch_auth_code')).toBe('1234-5678')
    expect(() => c.decrypt(sealed, 'clients.nino')).toThrow()
  })

  it('notices tampering', () => {
    const c = createFieldCrypto(KEY_A)
    const sealed = c.encrypt('value')
    const raw = Buffer.from(sealed.slice(3), 'base64')
    raw[raw.length - 1] ^= 1
    expect(() => c.decrypt(`v1:${raw.toString('base64')}`)).toThrow()
    expect(() => c.decrypt('plain text')).toThrow(/sealed form/)
  })

  it('keeps empty values empty, and handles any text', () => {
    createTestDb()
    expect(encryptField(null)).toBeNull()
    expect(encryptField('')).toBeNull()
    expect(decryptField(null)).toBeNull()
    const text = 'Ünïcödé — ✓ 🇬🇧'
    expect(decryptField(encryptField(text))).toBe(text)
    expect(TEST_DB_KEY).toHaveLength(64)
  })

  it('refuses a key that isn’t a database key', () => {
    expect(() => createFieldCrypto('short')).toThrow()
  })
})
