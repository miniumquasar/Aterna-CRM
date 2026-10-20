/**
 * Sealing sensitive values (NINO, Companies House authentication code, ID
 * document numbers) before they are stored, in `*_enc` columns.
 *
 *   key      HKDF-SHA256 from the database key (so a backup restored with its
 *            key reads them back), salt and info fixed for version 1
 *   cipher   AES-256-GCM, a fresh 12-byte nonce per value
 *   stored   'v1:' + base64(nonce ‖ tag ‖ ciphertext)
 *
 * An optional `context` (e.g. 'clients.nino') is bound in as associated
 * data, so a value copied into another column won't open there.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { isDatabaseKey } from '../db/key-file'

const VERSION = 'v1'
const PREFIX = `${VERSION}:`
const SALT = Buffer.from('aeterna-crm/field-crypto', 'utf8')
const INFO = Buffer.from('v1 aes-256-gcm', 'utf8')
const NONCE_BYTES = 12
const TAG_BYTES = 16

export interface FieldCrypto {
  encrypt(plain: string, context?: string): string
  decrypt(stored: string, context?: string): string
}

export class FieldCryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FieldCryptoError'
  }
}

export function isEncryptedValue(value: unknown): value is string {
  return typeof value === 'string' && /^v\d+:/.test(value)
}

export function createFieldCrypto(databaseKeyHex: string): FieldCrypto {
  if (!isDatabaseKey(databaseKeyHex)) throw new FieldCryptoError('The field key can only be made from a 64-character database key.')
  const key = Buffer.from(hkdfSync('sha256', Buffer.from(databaseKeyHex, 'hex'), SALT, INFO, 32))

  return {
    encrypt(plain, context) {
      if (typeof plain !== 'string') throw new FieldCryptoError('Only text can be sealed.')
      const nonce = randomBytes(NONCE_BYTES)
      const cipher = createCipheriv('aes-256-gcm', key, nonce)
      if (context) cipher.setAAD(Buffer.from(context, 'utf8'))
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
      return PREFIX + Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64')
    },
    decrypt(stored, context) {
      if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) {
        throw new FieldCryptoError('A stored value isn’t in a sealed form this version can read.')
      }
      const raw = Buffer.from(stored.slice(PREFIX.length), 'base64')
      if (raw.length < NONCE_BYTES + TAG_BYTES) throw new FieldCryptoError('A stored value is too short to be a sealed value.')
      const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, NONCE_BYTES))
      decipher.setAuthTag(raw.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES))
      if (context) decipher.setAAD(Buffer.from(context, 'utf8'))
      try {
        return Buffer.concat([decipher.update(raw.subarray(NONCE_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8')
      } catch {
        throw new FieldCryptoError('A stored value couldn’t be opened with this database’s key. It may have been copied from another database or changed outside the app.')
      }
    }
  }
}

let active: FieldCrypto | null = null

/** Start-up (step 3) and test helpers call this with the database key. */
export function initFieldCrypto(databaseKeyHex: string): void {
  active = createFieldCrypto(databaseKeyHex)
}

export function fieldCrypto(): FieldCrypto {
  if (!active) throw new FieldCryptoError('Sealing isn’t ready: the database key hasn’t been loaded.')
  return active
}

/** Seals a value for an `*_enc` column; empty input stays null. */
export function encryptField(plain: string | null | undefined, context?: string): string | null {
  if (plain === null || plain === undefined || plain === '') return null
  return fieldCrypto().encrypt(plain, context)
}

/** Opens a value from an `*_enc` column; null stays null. */
export function decryptField(stored: string | null | undefined, context?: string): string | null {
  if (stored === null || stored === undefined || stored === '') return null
  return fieldCrypto().decrypt(stored, context)
}
