/**
 * Encryption for backups, on Node's built-in crypto (no OS keychain).
 *
 *   keys       derived with HKDF-SHA256 from the database key — the key on the
 *              recovery sheet — so a backup and that sheet are all a new PC needs:
 *                header   authenticates the backup file's header
 *                names    names stored documents without revealing their content
 *                content  one key per encrypted stream, from a random 16-byte salt
 *   streams    a document or the backup's document list is encrypted as
 *                salt (16) · chunk 0 · chunk 1 · …
 *              each chunk is up to 1 MiB of AES-256-GCM ciphertext and its 16-byte
 *              tag. The nonce is the chunk's number; the chunk's number, its
 *              purpose and whether it is the last are authenticated with it, so a
 *              chunk moved, removed, added or cut off is refused.
 *
 * Large documents are streamed a chunk at a time, never read whole.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { open, type FileHandle } from 'node:fs/promises'

export const CHUNK = 1024 * 1024
const SALT_BYTES = 16
const TAG_BYTES = 16

/** What an encrypted stream holds; part of what each chunk is authenticated against. */
export type Purpose = 'document' | 'index'

export class BackupCryptoError extends Error {}

export interface BackupKeys {
  header: Buffer
  names: Buffer
  content: (salt: Buffer) => Buffer
}

const derive = (databaseKey: string, salt: Buffer | string, info: string): Buffer =>
  Buffer.from(hkdfSync('sha256', Buffer.from(databaseKey, 'utf8'), typeof salt === 'string' ? Buffer.from(salt) : salt, Buffer.from(info), 32))

export function backupKeys(databaseKey: string): BackupKeys {
  if (!databaseKey) throw new BackupCryptoError('Backups need the database to be open with its key.')
  return {
    header: derive(databaseKey, 'aeterna-crm', 'backup-header-v1'),
    names: derive(databaseKey, 'aeterna-crm', 'backup-document-names-v1'),
    content: (salt) => derive(databaseKey, salt, 'backup-content-v1')
  }
}

/** A stored document's name in the backup folder: keyed, so it says nothing about the content. */
export const blobName = (keys: BackupKeys, sha256: string): string => createHmac('sha256', keys.names).update(sha256).digest('hex')

const nonce = (index: number): Buffer => {
  const n = Buffer.alloc(12)
  n.writeBigUInt64BE(BigInt(index), 4)
  return n
}

const aad = (purpose: Purpose, index: number, final: boolean): Buffer => {
  const b = Buffer.alloc(9)
  b.writeBigUInt64BE(BigInt(index), 0)
  b[8] = final ? 1 : 0
  return Buffer.concat([Buffer.from(`aeterna-backup:${purpose}:`), b])
}

function seal(key: Buffer, purpose: Purpose, index: number, final: boolean, plain: Buffer): Buffer {
  const cipher = createCipheriv('aes-256-gcm', key, nonce(index))
  cipher.setAAD(aad(purpose, index, final))
  return Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()])
}

function unseal(key: Buffer, purpose: Purpose, index: number, final: boolean, sealed: Buffer): Buffer {
  if (sealed.length < TAG_BYTES) throw new BackupCryptoError('The encrypted data is cut short.')
  const decipher = createDecipheriv('aes-256-gcm', key, nonce(index))
  decipher.setAAD(aad(purpose, index, final))
  decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES))
  try {
    return Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - TAG_BYTES)), decipher.final()])
  } catch {
    throw new BackupCryptoError('The encrypted data was changed or damaged, or this isn’t the key it was made with.')
  }
}

/** Encrypts a small buffer (the document list) in the stream format. */
export function sealBuffer(keys: BackupKeys, purpose: Purpose, plain: Buffer): Buffer {
  const salt = randomBytes(SALT_BYTES)
  const key = keys.content(salt)
  const parts: Buffer[] = [salt]
  const count = Math.max(1, Math.ceil(plain.length / CHUNK))
  for (let i = 0; i < count; i++) parts.push(seal(key, purpose, i, i === count - 1, plain.subarray(i * CHUNK, (i + 1) * CHUNK)))
  return Buffer.concat(parts)
}

export function openBuffer(keys: BackupKeys, purpose: Purpose, data: Buffer): Buffer {
  if (data.length < SALT_BYTES + TAG_BYTES) throw new BackupCryptoError('The encrypted data is cut short.')
  const key = keys.content(data.subarray(0, SALT_BYTES))
  const out: Buffer[] = []
  let offset = SALT_BYTES
  for (let i = 0; offset < data.length; i++) {
    const len = Math.min(CHUNK + TAG_BYTES, data.length - offset)
    out.push(unseal(key, purpose, i, offset + len === data.length, data.subarray(offset, offset + len)))
    offset += len
  }
  return Buffer.concat(out)
}

/** Reads until `size` bytes or the end of the file. */
export async function readChunk(fh: FileHandle, size = CHUNK): Promise<Buffer> {
  const buf = Buffer.allocUnsafe(size)
  let filled = 0
  while (filled < size) {
    const { bytesRead } = await fh.read(buf, filled, size - filled, null)
    if (bytesRead === 0) break
    filled += bytesRead
  }
  return filled === size ? buf : buf.subarray(0, filled)
}

/** SHA-256 of a file, streamed. */
export async function hashFile(path: string, onBytes?: (n: number) => void): Promise<{ sha256: string; bytes: number }> {
  const fh = await open(path, 'r')
  const hash = createHash('sha256')
  let bytes = 0
  try {
    for (;;) {
      const chunk = await readChunk(fh)
      if (chunk.length === 0) break
      hash.update(chunk)
      bytes += chunk.length
      onBytes?.(chunk.length)
      if (chunk.length < CHUNK) break
    }
  } finally {
    await fh.close()
  }
  return { sha256: hash.digest('hex'), bytes }
}

/**
 * Encrypts a file into `target` (which must not exist yet). Returns the SHA-256
 * and size of what was read, so the caller can check the file didn't change.
 */
export async function encryptFile(keys: BackupKeys, purpose: Purpose, source: string, target: string, onBytes?: (n: number) => void): Promise<{ sha256: string; bytes: number }> {
  const src = await open(source, 'r')
  let out: FileHandle | null = null
  const hash = createHash('sha256')
  let bytes = 0
  try {
    out = await open(target, 'wx', 0o600)
    const salt = randomBytes(SALT_BYTES)
    const key = keys.content(salt)
    await out.write(salt)
    let current = await readChunk(src)
    for (let i = 0; ; i++) {
      // Look one chunk ahead: the last chunk is marked as the last.
      const next = current.length === CHUNK ? await readChunk(src) : Buffer.alloc(0)
      const final = next.length === 0
      hash.update(current)
      bytes += current.length
      await out.write(seal(key, purpose, i, final, current))
      onBytes?.(current.length)
      if (final) break
      current = next
    }
    await out.sync()
  } finally {
    await src.close()
    await out?.close()
  }
  return { sha256: hash.digest('hex'), bytes }
}

/**
 * Decrypts an encrypted file chunk by chunk, handing each piece of plain text to
 * `sink` (write it somewhere, or only hash it). Returns the SHA-256 and size.
 */
export async function decryptFile(
  keys: BackupKeys,
  purpose: Purpose,
  source: string,
  sink: ((plain: Buffer) => Promise<void> | void) | null,
  onBytes?: (n: number) => void
): Promise<{ sha256: string; bytes: number }> {
  const fh = await open(source, 'r')
  const hash = createHash('sha256')
  let bytes = 0
  try {
    const size = (await fh.stat()).size
    if (size < SALT_BYTES + TAG_BYTES) throw new BackupCryptoError('The encrypted file is cut short.')
    const salt = await readChunk(fh, SALT_BYTES)
    const key = keys.content(salt)
    let remaining = size - SALT_BYTES
    for (let i = 0; remaining > 0; i++) {
      const len = Math.min(CHUNK + TAG_BYTES, remaining)
      const sealed = await readChunk(fh, len)
      if (sealed.length !== len) throw new BackupCryptoError('The encrypted file is cut short.')
      remaining -= len
      const plain = unseal(key, purpose, i, remaining === 0, sealed)
      hash.update(plain)
      bytes += plain.length
      if (sink) await sink(plain)
      onBytes?.(plain.length)
    }
  } finally {
    await fh.close()
  }
  return { sha256: hash.digest('hex'), bytes }
}

/** JSON with object keys sorted, so the same header always gives the same bytes. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export const headerMac = (keys: BackupKeys, fields: object): string => createHmac('sha256', keys.header).update(canonicalJson(fields)).digest('hex')

export function macMatches(keys: BackupKeys, fields: object, mac: string): boolean {
  const expected = Buffer.from(headerMac(keys, fields), 'hex')
  const given = Buffer.from(String(mac ?? ''), 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}
