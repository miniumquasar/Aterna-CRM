/**
 * Opening the practice database without ever losing it.
 *
 *  - The database is encrypted with SQLCipher 4 settings (cipher 'sqlcipher',
 *    legacy 4) and this installation's key, used as a raw 256-bit key.
 *  - A database that can't be opened (wrong key, missing key, not a database)
 *    is NEVER renamed, emptied or replaced. Opening stops with a plain
 *    explanation and the file is left exactly as it was: it is first probed
 *    read-only, so nothing is written until the key is known to be right.
 *  - Only a database that opens but fails `quick_check` (it reports damage, or
 *    the check itself stops on SQLITE_CORRUPT / SQLITE_NOTADB) is set aside,
 *    with its -wal and -shm files as a matching set, and a new one started; a
 *    notice says where the old one went. A check that can't run for any other
 *    reason (the file is locked or busy, a read error) stops start-up with
 *    nothing changed: a healthy database is never moved because it was busy.
 *  - A -wal file with no database beside it is never joined to a new, empty
 *    database (SQLite would replay it into the new file): start-up stops.
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

/**
 * Why a database couldn't be opened:
 *   wrong_key       it isn't readable with this key (wrong key, or not a database at all)
 *   busy            another program has it locked, or the check couldn't run just now
 *   orphaned_log    a -wal file is there without its database
 *   set_aside_failed  it failed its integrity check but couldn't be moved aside
 *   invalid_key     the key given isn't 64 hexadecimal characters
 *   create_failed   a new database couldn't be made
 */
export type DatabaseOpenProblem = 'wrong_key' | 'busy' | 'orphaned_log' | 'set_aside_failed' | 'invalid_key' | 'create_failed'

export class DatabaseOpenError extends PlainError {
  readonly reason: DatabaseOpenProblem

  constructor(reason: DatabaseOpenProblem, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DatabaseOpenError'
    this.reason = reason
  }
}

/** Applies the cipher settings and key. Must run before anything reads the file. */
export function applyKey(db: Db, keyHex: string): void {
  if (!isDatabaseKey(keyHex)) throw new DatabaseOpenError('invalid_key', 'The database key isn’t in the expected form (64 hexadecimal characters).')
  db.pragma("cipher = 'sqlcipher'")
  db.pragma('legacy = 4')
  db.pragma(`key = "x'${keyHex}'"`)
}

/** How long a connection waits for another's lock before giving up. */
export const BUSY_TIMEOUT_MS = 5000

/** The connection settings every handle uses. busy_timeout comes first, so switching to WAL waits for a lock rather than failing. */
export function applyConnectionPragmas(db: Db, options: { wal?: boolean } = {}): void {
  db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`)
  if (options.wal !== false) db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
}

/** True when `file` exists and holds at least one byte. */
export function nonEmptyFile(file: string): boolean {
  try {
    return statSync(file).size > 0
  } catch {
    return false
  }
}

/** True when the database, or its write-ahead log, is on disk: either means there is data to keep. */
export function databaseFilesPresent(file: string): boolean {
  return nonEmptyFile(file) || nonEmptyFile(`${file}-wal`)
}

/** Another connection or program holds the file just now. */
export function isBusyError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' && (code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED'))
}

/** SQLite's own word that the file is damaged, as opposed to busy, locked or unreadable just now. */
export function isDamageError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' && (code.startsWith('SQLITE_CORRUPT') || code === 'SQLITE_NOTADB')
}

function readable(db: Db): void {
  db.prepare('SELECT count(*) AS n FROM sqlite_master').get()
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-')
}

/**
 * Renames a database and its -wal and -shm files aside, as a set, and
 * returns the new main file path. Nothing already there is overwritten. If
 * any rename fails, those already made are undone, so the files stay a
 * matching set in one place or the other, and a DatabaseOpenError says so.
 */
export function setAside(file: string, label: string, now: Date = new Date()): string {
  const base = `${file}.${label}-${stamp(now)}`
  let target = base
  for (let n = 2; ['', '-wal', '-shm'].some((s) => existsSync(target + s)); n++) target = `${base}-${n}`
  const moved: Array<readonly [string, string]> = []
  try {
    for (const suffix of ['', '-wal', '-shm']) {
      const from = file + suffix
      if (suffix && !existsSync(from)) continue
      renameSync(from, target + suffix)
      moved.push([from, target + suffix])
    }
  } catch (cause) {
    for (const [from, to] of moved.reverse()) {
      try {
        renameSync(to, from)
      } catch {
        // Start-up stops below; the orphaned -wal guard keeps a half-moved set from being reused.
      }
    }
    throw new DatabaseOpenError(
      'set_aside_failed',
      `The practice database (${file}) failed its integrity check, but it couldn’t be moved aside (another program may have it open), ` +
        'so it has been left where it is. Close any program using the data folder and start AETERNA CRM again.',
      { cause }
    )
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
    'wrong_key',
    `The practice database (${file}) can’t be opened with this computer’s database key. ` +
      'The file has not been changed. If database-key.json was replaced or copied from another computer, put the right one back, ' +
      'or unlock the database with its recovery sheet. Then start AETERNA CRM again.',
    { cause }
  )
}

function orphanedLog(file: string): DatabaseOpenError {
  return new DatabaseOpenError(
    'orphaned_log',
    `The practice database’s journal (${file}-wal) is in the data folder without the database itself, so a new database ` +
      'can’t safely be started beside it. Nothing has been changed. Put the database file back from a copy of the data folder ' +
      'or a backup, then start AETERNA CRM again.'
  )
}

function checkFailed(file: string, cause: unknown): DatabaseOpenError {
  return new DatabaseOpenError(
    'busy',
    `The practice database (${file}) couldn’t be checked just now (it may be busy or locked by another program). ` +
      'The file has not been changed. Close any program using the data folder and start AETERNA CRM again.',
    { cause }
  )
}

function openReadWrite(file: string, key: string): Db {
  const db = new Database(file)
  try {
    applyKey(db, key)
    db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`)
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
  const existed = nonEmptyFile(o.file)
  if (!existed && nonEmptyFile(`${o.file}-wal`)) {
    log.error(`A -wal file was found without its database at ${o.file}; nothing was changed.`)
    throw orphanedLog(o.file)
  }

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
      probe.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`)
      readable(probe)
    } catch (cause) {
      probe?.close()
      if (isBusyError(cause)) {
        log.error('The database was busy or locked when start-up tried to read it; it has been left as it was.', cause)
        throw checkFailed(o.file, cause)
      }
      log.error('The database could not be opened with the key file’s key; it has been left as it was.', cause)
      throw cannotOpen(o.file, cause)
    }
    try {
      check = quickCheck(probe)
    } catch (err) {
      if (!isDamageError(err)) {
        probe.close()
        log.error('The database’s integrity check couldn’t run; it has been left as it was.', err)
        throw checkFailed(o.file, err)
      }
      check = err instanceof Error ? err.message : String(err)
    }
    probe.close()
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
    if (existed && !setAsideAt) throw isBusyError(cause) ? checkFailed(o.file, cause) : cannotOpen(o.file, cause)
    throw new DatabaseOpenError('create_failed', `A new practice database couldn’t be created at ${o.file}.`, { cause })
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
