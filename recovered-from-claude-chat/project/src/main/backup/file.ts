/**
 * The backup file.
 *
 *   AETBAK02 (8 bytes) · header length (4 bytes, big-endian) · header (JSON)
 *   · the database (exactly as it is on disk: already encrypted with the key)
 *   · the list of stored documents (encrypted, see crypto.ts)
 *
 * The header can be read without the key — when a backup was made, by which
 * version, how many clients and documents, and the fingerprint of the key it
 * needs (the one printed on the recovery sheet) — and is authenticated with
 * the key, so a changed header is refused once the key is given. The two parts
 * carry SHA-256 checksums in the header.
 *
 * The documents themselves are not in this file: they are kept once each, in
 * the "documents" folder beside it (store.ts), shared by every backup there.
 */
import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import { BackupCryptoError, canonicalJson, headerMac, macMatches, openBuffer, readChunk, sealBuffer, type BackupKeys } from './crypto'

export const BACKUP_EXTENSION = 'aeterna-backup'
export const MAGIC = Buffer.from('AETBAK02', 'ascii')
const PREFIX = MAGIC.length + 4
const MAX_HEADER = 64 * 1024

export type BackupKind = 'manual' | 'scheduled'

export interface BackupHeader {
  format: 'aeterna-crm-backup'
  version: 2
  createdAt: string
  appVersion: string
  /** The newest schema change in the database ("0016_email_backups"). */
  migration: string | null
  /** The first 8 hex digits of SHA-256 of the key, as on the recovery sheet ("ABCD-1234"). */
  keyFingerprint: string
  kind: BackupKind
  counts: { clients: number; documents: number; users: number }
  documents: { stored: number; bytes: number; missing: number }
  database: { bytes: number; sha256: string }
  index: { bytes: number; sha256: string }
  mac: string
}

export interface IndexEntry {
  id: number
  /** Where the file sits inside the documents folder, with forward slashes ("CL0001/letter.pdf"). */
  rel: string | null
  size?: number
  sha256?: string
  blob?: string
  /** Why the file isn't in the backup. */
  missing?: 'not-found' | 'outside' | 'unreadable' | 'changed'
}

export interface BackupIndex {
  version: 1
  /** The documents folder when the backup was made. */
  documentsRoot: string
  entries: IndexEntry[]
}

export class BackupFileError extends Error {}

const hashOf = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

/** The fields the MAC covers: everything in the header except the MAC. */
const macFields = (h: BackupHeader): Omit<BackupHeader, 'mac'> => {
  const { mac: _mac, ...rest } = h
  return rest
}

export function sealIndex(keys: BackupKeys, index: BackupIndex): Buffer {
  return sealBuffer(keys, 'index', Buffer.from(JSON.stringify(index), 'utf8'))
}

/**
 * Writes header, database and document list to `target` (which must not exist).
 * The database copy is hashed first, then copied, and hashed again on the way.
 */
export async function writeBackupFile(
  target: string,
  keys: BackupKeys,
  fields: Omit<BackupHeader, 'mac' | 'database' | 'index' | 'format' | 'version'>,
  databaseCopy: string,
  sealedIndex: Buffer
): Promise<BackupHeader> {
  const db = await open(databaseCopy, 'r')
  let out: Awaited<ReturnType<typeof open>> | null = null
  try {
    const size = (await db.stat()).size
    const first = createHash('sha256')
    for (let pos = 0; pos < size; ) {
      const chunk = await readChunk(db)
      if (chunk.length === 0) break
      first.update(chunk)
      pos += chunk.length
    }
    const dbSha = first.digest('hex')
    const unsigned = {
      format: 'aeterna-crm-backup' as const,
      version: 2 as const,
      ...fields,
      database: { bytes: size, sha256: dbSha },
      index: { bytes: sealedIndex.length, sha256: hashOf(sealedIndex) }
    }
    const header: BackupHeader = { ...unsigned, mac: headerMac(keys, unsigned) }
    const json = Buffer.from(canonicalJson(header), 'utf8')
    const len = Buffer.alloc(4)
    len.writeUInt32BE(json.length)

    out = await open(target, 'wx', 0o600)
    await out.write(Buffer.concat([MAGIC, len, json]))
    const second = createHash('sha256')
    let copied = 0
    for (let pos = 0; ; ) {
      const { bytesRead, buffer } = await db.read(Buffer.allocUnsafe(1024 * 1024), 0, 1024 * 1024, pos)
      if (bytesRead === 0) break
      const piece = buffer.subarray(0, bytesRead)
      second.update(piece)
      await out.write(piece)
      pos += bytesRead
      copied += bytesRead
    }
    if (copied !== size || second.digest('hex') !== dbSha) throw new BackupFileError('The database copy changed while it was being written into the backup.')
    await out.write(sealedIndex)
    await out.sync()
    return header
  } finally {
    await db.close()
    await out?.close()
  }
}

/** Reads and checks the header. Needs no key; the MAC is checked by verifyHeader. */
export async function readBackupHeader(path: string): Promise<{ header: BackupHeader; dataStart: number; fileSize: number }> {
  const fh = await open(path, 'r')
  try {
    const fileSize = (await fh.stat()).size
    const prefix = await readChunk(fh, PREFIX)
    if (prefix.length < PREFIX || !prefix.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new BackupFileError('This isn’t an AETERNA CRM backup file.')
    }
    const length = prefix.readUInt32BE(MAGIC.length)
    if (length <= 2 || length > MAX_HEADER) throw new BackupFileError('The backup file’s header is damaged.')
    const raw = await readChunk(fh, length)
    let header: BackupHeader
    try {
      header = JSON.parse(raw.toString('utf8')) as BackupHeader
    } catch {
      throw new BackupFileError('The backup file’s header is damaged.')
    }
    if (header?.format !== 'aeterna-crm-backup') throw new BackupFileError('This isn’t an AETERNA CRM backup file.')
    if (header.version !== 2) throw new BackupFileError('This backup was made by a newer version of AETERNA CRM. Install the latest version, then restore it.')
    const dataStart = PREFIX + length
    const dbBytes = Number(header.database?.bytes)
    const indexBytes = Number(header.index?.bytes)
    if (!Number.isSafeInteger(dbBytes) || !Number.isSafeInteger(indexBytes) || dbBytes <= 0 || indexBytes <= 0) {
      throw new BackupFileError('The backup file’s header is damaged.')
    }
    if (dataStart + dbBytes + indexBytes !== fileSize) {
      throw new BackupFileError(
        dataStart + dbBytes + indexBytes > fileSize
          ? 'The backup file is incomplete: it is shorter than its header says. It may not have finished copying.'
          : 'The backup file has extra data after its end, so it isn’t trusted.'
      )
    }
    return { header, dataStart, fileSize }
  } finally {
    await fh.close()
  }
}

/** True when the header was made with this key and hasn't been changed. */
export const headerIsGenuine = (keys: BackupKeys, header: BackupHeader): boolean => macMatches(keys, macFields(header), header.mac)

/** Copies the database out of the backup, checking its checksum. */
export async function extractDatabase(path: string, header: BackupHeader, dataStart: number, target: string): Promise<void> {
  const src = await open(path, 'r')
  let out: Awaited<ReturnType<typeof open>> | null = null
  try {
    out = await open(target, 'w', 0o600)
    const hash = createHash('sha256')
    let pos = dataStart
    const end = dataStart + header.database.bytes
    while (pos < end) {
      const want = Math.min(1024 * 1024, end - pos)
      const { bytesRead, buffer } = await src.read(Buffer.allocUnsafe(want), 0, want, pos)
      if (bytesRead === 0) throw new BackupFileError('The backup file is cut short.')
      const piece = buffer.subarray(0, bytesRead)
      hash.update(piece)
      await out.write(piece)
      pos += bytesRead
    }
    await out.sync()
    if (hash.digest('hex') !== header.database.sha256) throw new BackupFileError('The database in this backup is damaged (its checksum doesn’t match).')
  } finally {
    await src.close()
    await out?.close()
  }
}

/** The list of documents in the backup (needs the key). */
export async function readIndex(path: string, keys: BackupKeys, header: BackupHeader, dataStart: number): Promise<BackupIndex> {
  const fh = await open(path, 'r')
  try {
    const at = dataStart + header.database.bytes
    const { bytesRead, buffer } = await fh.read(Buffer.allocUnsafe(header.index.bytes), 0, header.index.bytes, at)
    const sealed = buffer.subarray(0, bytesRead)
    if (bytesRead !== header.index.bytes || hashOf(sealed) !== header.index.sha256) {
      throw new BackupFileError('The list of documents in this backup is damaged (its checksum doesn’t match).')
    }
    let index: BackupIndex
    try {
      index = JSON.parse(openBuffer(keys, 'index', sealed).toString('utf8')) as BackupIndex
    } catch (err) {
      if (err instanceof BackupCryptoError) throw new BackupFileError('The list of documents in this backup can’t be opened with this key.')
      throw new BackupFileError('The list of documents in this backup is damaged.')
    }
    if (index?.version !== 1 || !Array.isArray(index.entries)) throw new BackupFileError('The list of documents in this backup is damaged.')
    return index
  } finally {
    await fh.close()
  }
}

/** First bytes of a plain SQLite file; an encrypted database never starts with them. */
const SQLITE_PLAIN = Buffer.from('SQLite format 3\0', 'ascii')

/** What kind of file this is: a backup file, an older backup (a database copy), or neither. */
export async function backupFileKind(path: string): Promise<'backup' | 'database' | 'unknown'> {
  const fh = await open(path, 'r')
  try {
    const head = await readChunk(fh, 16)
    if (head.subarray(0, MAGIC.length).equals(MAGIC)) return 'backup'
    if (head.equals(SQLITE_PLAIN)) return 'unknown'
    // Older backups are copies of the encrypted database: random-looking bytes, named *.db.
    return path.toLowerCase().endsWith('.db') ? 'database' : 'unknown'
  } finally {
    await fh.close()
  }
}
