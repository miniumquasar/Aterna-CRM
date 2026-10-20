/**
 * Opening the practice database without ever losing it.
 *
 *  - The database is encrypted with SQLCipher 4 settings (cipher 'sqlcipher',
 *    legacy 4) and this installation's key, used as a raw 256-bit key.
 *  - A database that can't be opened (wrong key, missing key, not a database)
 *    is NEVER renamed, emptied or replaced. Opening stops with a plain
 *    explanation and the file is left exactly as it was: it is first probed
 *    read-only, so nothing is written until the key is known to be right.
 *  - Only a database that opens but fails `quick_check` is set aside, with its
 *    -wal and -shm files as a matching set, and a new one started; a notice
 *    says where the old one went.
 *
 * Services never import the handle: they take `db` as a parameter (handlers
 * get it from their context), so tests can pass an in-memory database.
 */
import { existsSync, renameSync, statSync } from 'node:fs'
import Database from 'better-sqlite3-multiple-ciphers'
import { PlainError } from '../app/plain-error'
import { nullLogger, type Logger } from '../app/logger'
import { isDatabaseKey } from './key-file'

export type Db = Database.Database

export class DatabaseOpenError extends PlainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DatabaseOpenError'
  }
}

/** Applies the cipher settings and key. Must run before anything reads the file. */
export function applyKey(db: Db, keyHex: string): void {
  if (!isDatabaseKey(keyHex)) throw new DatabaseOpenError('The database key isn’t in the expected form (64 hexadecimal characters).')
  db.pragma("cipher = 'sqlcipher'")
  db.pragma('legacy = 4')
  db.pragma(`key = "x'${keyHex}'"`)
}

/** The connection settings every handle uses. */
export function applyConnectionPragmas(db: Db, options: { wal?: boolean } = {}): void {
  if (options.wal !== false) db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')
}

function readable(db: Db): void {
  db.prepare('SELECT count(*) AS n FROM sqlite_master').get()
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-')
}

/** Renames a database and its -wal and -shm files aside, as a set. Returns the new main file path. */
export function setAside(file: string, label: string, now: Date = new Date()): string {
  const target = `${file}.${label}-${stamp(now)}`
  renameSync(file, target)
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(file + suffix)) renameSync(file + suffix, target + suffix)
  }
  return target
}

export interface OpenOptions {
  file: string
  key: string
  log?: Logger
  now?: () => Date
  /** For tests: replaces `PRAGMA quick_check`. */
  quickCheck?: (db: Db) => string
}

export interface OpenedDatabase {
  db: Db
  /** True when the file didn't exist (or was empty) and was created now. */
  created: boolean
  /** Where a damaged database was moved, when that happened. */
  setAsideAt: string | null
  /** Plain sentences for the person, from this open. */
  notices: string[]
}

function cannotOpen(file: string, cause: unknown): DatabaseOpenError {
  return new DatabaseOpenError(
    `The practice database (${file}) can’t be opened with this computer’s database key. ` +
      'The file has not been changed. If database-key.json was replaced or copied from another computer, put the right one back, ' +
      'or unlock the database with its recovery sheet. Then start AETERNA CRM again.',
    { cause }
  )
}

function openReadWrite(file: string, key: string): Db {
  const db = new Database(file)
  try {
    applyKey(db, key)
    readable(db)
    return db
  } catch (err) {
    db.close()
    throw err
  }
}

export function openDatabase(o: OpenOptions): OpenedDatabase {
  const log = o.log ?? nullLogger
  const now = o.now ?? (() => new Date())
  const quickCheck = o.quickCheck ?? ((db: Db) => String(db.pragma('quick_check', { simple: true })))
  const existed = existsSync(o.file) && statSync(o.file).size > 0

  const notices: string[] = []
  let setAsideAt: string | null = null

  if (existed) {
    // Probe read-only first: a wrong key must not lead to any write at all,
    // and a read-only connection never checkpoints or deletes the -wal file,
    // so a damaged database is set aside exactly as it was found.
    let probe: Db | null = null
    let check: string
    try {
      probe = new Database(o.file, { readonly: true, fileMustExist: true })
      applyKey(probe, o.key)
      readable(probe)
    } catch (cause) {
      probe?.close()
      log.error('The database could not be opened with the key file’s key; it has been left as it was.', cause)
      throw cannotOpen(o.file, cause)
    }
    try {
      check = quickCheck(probe)
    } catch (err) {
      check = err instanceof Error ? err.message : String(err)
    } finally {
      probe.close()
    }
    if (check !== 'ok') {
      setAsideAt = setAside(o.file, 'damaged', now())
      log.error(`The database failed its integrity check (${check.slice(0, 300)}); it was set aside at ${setAsideAt}.`)
      notices.push(
        `The practice database was damaged, so it was set aside at ${setAsideAt} and a new, empty database was started. ` +
          'Restore your latest backup from Settings → Backups.'
      )
    }
  }

  let db: Db
  try {
    db = openReadWrite(o.file, o.key)
  } catch (cause) {
    throw existed && !setAsideAt ? cannotOpen(o.file, cause) : new DatabaseOpenError(`A new practice database couldn’t be created at ${o.file}.`, { cause })
  }

  applyConnectionPragmas(db)
  return { db, created: !existed || setAsideAt !== null, setAsideAt, notices }
}

/** An unencrypted in-memory database with the app's connection settings, for tests. */
export function openMemoryDatabase(): Db {
  const db = new Database(':memory:')
  applyConnectionPragmas(db, { wal: false })
  return db
}

let current: Db | null = null

export function setDb(db: Db | null): void {
  current = db
}

/** The open practice database. Throws before start-up step 3 has opened it. */
export function getDb(): Db {
  if (!current) throw new Error('The practice database is not open (start-up step 3).')
  return current
}

export function closeDb(): void {
  if (current?.open) current.close()
  current = null
}
