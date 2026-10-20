/**
 * The database key: 32 random bytes, as 64 hex characters, in
 * database-key.json beside the database. It is created once, on the first
 * run, and never replaced: a key file that exists is only ever read, and a
 * database that exists without its key file is never given a new one.
 *
 *   { "version": 1, "key": "<64 hex>", "createdAt": "2026-10-20T15:36:18.992Z" }
 */
import { randomBytes } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, linkSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'
import { PlainError } from '../app/plain-error'

export interface KeyFileContents {
  version: 1
  key: string
  createdAt: string
}

export class KeyFileError extends PlainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'KeyFileError'
  }
}

const HEX_KEY = /^[0-9a-f]{64}$/

export function isDatabaseKey(value: unknown): value is string {
  return typeof value === 'string' && HEX_KEY.test(value)
}

/** The key in the file, or null when there is no file. Throws a KeyFileError for a file that can't be used. */
export function readDatabaseKey(path: string): string | null {
  if (!existsSync(path)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (cause) {
    throw new KeyFileError(
      `The database key file (${path}) can’t be read. It has not been changed. ` +
        'Put back a good copy from a copy of the data folder, or unlock the database with its recovery sheet.',
      { cause }
    )
  }
  const key = (parsed as Partial<KeyFileContents> | null)?.key
  if (!isDatabaseKey(key)) {
    throw new KeyFileError(
      `The database key file (${path}) doesn’t hold a key in the expected form. It has not been changed. ` +
        'Put back a good copy from a copy of the data folder, or unlock the database with its recovery sheet.'
    )
  }
  return key
}

/**
 * Writes a new key file and returns its key. Refuses if a key file already
 * exists. The file is written in full under a temporary name, flushed to
 * disk, then linked into place, so a crash leaves either no key file or a
 * complete one, and an existing file is never overwritten.
 */
export function createDatabaseKey(path: string, now: Date = new Date()): string {
  if (existsSync(path)) {
    throw new KeyFileError(`A database key file already exists at ${path}; it has not been replaced.`)
  }
  const key = randomBytes(32).toString('hex')
  const contents: KeyFileContents = { version: 1, key, createdAt: now.toISOString() }
  const temp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  const fd = openSync(temp, 'wx', 0o600)
  try {
    writeSync(fd, `${JSON.stringify(contents, null, 2)}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    try {
      linkSync(temp, path) // fails if the target exists: never overwrites
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EEXIST') throw new KeyFileError(`A database key file appeared at ${path} while this one was being made; it has not been replaced.`)
      // File systems without hard links (FAT, some network drives): rename, after checking again.
      if (existsSync(path)) throw new KeyFileError(`A database key file already exists at ${path}; it has not been replaced.`)
      renameSync(temp, path)
    }
  } finally {
    rmSync(temp, { force: true })
  }
  return key
}

function nonEmpty(file: string): boolean {
  try {
    return statSync(file).size > 0
  } catch {
    return false
  }
}

export interface LoadedKey {
  key: string
  /** True when this run made the key (a new installation). */
  created: boolean
}

/**
 * The key for `databaseFile`: read from `keyFile`, or created when neither the
 * key file nor the database (nor its -wal file) exists yet. A database without
 * its key file stops start-up with an explanation; nothing is changed.
 */
export function loadOrCreateDatabaseKey(paths: { keyFile: string; databaseFile: string }): LoadedKey {
  const existing = readDatabaseKey(paths.keyFile)
  if (existing) return { key: existing, created: false }
  // The database, or only its write-ahead log: either holds the practice's data, which a new key would lock away.
  if (nonEmpty(paths.databaseFile) || nonEmpty(`${paths.databaseFile}-wal`)) {
    throw new KeyFileError(
      `The database key file is missing from ${dirname(paths.keyFile)}. The practice database is still there and has not been changed. ` +
        'Put database-key.json back from a copy of the data folder, or unlock the database with its recovery sheet.'
    )
  }
  return { key: createDatabaseKey(paths.keyFile), created: true }
}
