/**
 * Opening the practice database without ever losing it.
 *
 * Rules
 *  1. A database that no known key can read is never moved, renamed or
 *     replaced. The app reports it as locked and leaves the file untouched.
 *  2. A database still on the public development key (or unencrypted) is
 *     moved to a random per-install key — with a safety copy first, a
 *     verified reopen after, and the original restored if anything fails.
 *  3. Only a database that opens but fails its integrity check is set
 *     aside, with its WAL and SHM files renamed as a matching set so that
 *     SQLite can still recover them.
 *
 * Cipher facts this module depends on (proven in tests/db/open-database.test.ts):
 *  - The app has always run `PRAGMA key` before `PRAGMA cipher='sqlcipher'`.
 *    The key therefore binds to the library default, ChaCha20-Poly1305;
 *    the later cipher pragma only changes what a *rekey* would use.
 *    Existing databases open only in that order, so it is kept exactly.
 *  - Rekeying in WAL mode, or under the sqlcipher setting, reports success
 *    but leaves a file neither key can read. Rekeying must checkpoint,
 *    switch to DELETE journal mode and select chacha20 first.
 */

import { copyFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs'
import Database, { type Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import { generateDatabaseKey, type DatabaseKeyStore } from './database-key'

export const DEV_ONLY_KEY = 'dev-only-change-me'

export type KeySource = 'env' | 'key-file' | 'pending' | 'legacy' | 'dev-only' | 'plaintext' | 'new'

export interface KeyCandidate {
  source: KeySource
  /** null = no encryption */
  key: string | null
}

export type OpenResult =
  | {
      status: 'ready'
      db: DatabaseType
      source: KeySource
      /** True when the file was moved from the development key (or plaintext) to its own key. */
      rekeyed: boolean
      /** Where a damaged database was set aside, if that happened. */
      setAside: string | null
      notice: string | null
    }
  | { status: 'locked'; reason: string }

const quote = (key: string): string => `'${key.replace(/'/g, "''")}'`

/** Opens exactly as the app always has — key first, then cipher. Throws if the file cannot be read. */
export function openWithKey(path: string, key: string | null): DatabaseType {
  const db = new Database(path)
  try {
    if (key !== null) {
      db.pragma(`key=${quote(key)}`)
      db.pragma(`cipher='sqlcipher'`)
    }
    db.prepare('SELECT count(*) AS n FROM sqlite_master').get() // forces page 1 to decrypt
    return db
  } catch (err) {
    db.close()
    throw err
  }
}

/** Re-encrypts in place so that openWithKey(path, newKey) works. */
export function rekeyDatabase(db: DatabaseType, newKey: string): void {
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.pragma('journal_mode = DELETE')
  db.pragma(`cipher='chacha20'`)
  db.pragma(`rekey=${quote(newKey)}`)
  db.pragma('journal_mode = WAL')
}

const tableCount = (db: DatabaseType): number =>
  (db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get() as { n: number }).n

/** Moves a database and its WAL/SHM side files aside as a matching set. */
export function setAside(path: string, label: string): string {
  const target = `${path}.${label}-${new Date().toISOString().replace(/[:.]/g, '-')}`
  renameSync(path, target)
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(path + suffix)) renameSync(path + suffix, target + suffix)
  }
  return target
}

export interface OpenOptions {
  path: string
  keyStore: DatabaseKeyStore
  /** AETERNA_DB_KEY, if set — the user manages the key and it is never changed automatically. */
  envKey?: string
  /** Key unwrapped from the pre-v5 store, if any. */
  legacyKey?: string
  log?: (message: string) => void
  /** Injection points for tests. */
  rekey?: typeof rekeyDatabase
  integrityCheck?: (db: DatabaseType) => string
}

export function openPracticeDatabase(o: OpenOptions): OpenResult {
  const log = o.log ?? ((m: string) => console.warn(`[Ledger] ${m}`))
  const rekey = o.rekey ?? rekeyDatabase
  const integrity = o.integrityCheck ?? ((db: DatabaseType) => String(db.pragma('integrity_check', { simple: true })))
  const stored = o.keyStore.read()
  const safetyCopy = `${o.path}.pre-rekey`

  // ── New installation: the key exists before the database does ───────────────
  const exists = existsSync(o.path) && statSync(o.path).size > 0
  if (!exists) {
    let key = o.envKey ?? stored?.key ?? null
    if (!key) {
      key = generateDatabaseKey()
      o.keyStore.write({ key, origin: 'generated' })
    }
    return { status: 'ready', db: openWithKey(o.path, key), source: o.envKey ? 'env' : 'new', rekeyed: false, setAside: null, notice: null }
  }

  // ── Existing database: try every key it could be using ──────────────────────
  const candidates: KeyCandidate[] = []
  const add = (source: KeySource, key: string | null | undefined): void => {
    if (key === undefined || candidates.some((c) => c.key === key)) return
    candidates.push({ source, key })
  }
  add('env', o.envKey)
  add('key-file', stored?.key ?? undefined)
  add('pending', stored?.pendingKey ?? undefined)
  add('legacy', o.legacyKey)
  add('dev-only', DEV_ONLY_KEY)
  add('plaintext', null)

  const tryAll = (path: string): { db: DatabaseType; c: KeyCandidate } | null => {
    for (const c of candidates) {
      try {
        return { db: openWithKey(path, c.key), c }
      } catch {
        /* not this key */
      }
    }
    return null
  }

  let opened = tryAll(o.path)
  let notice: string | null = null
  if (!opened && existsSync(safetyCopy)) {
    // An interrupted key change: the safety copy taken just before it is intact.
    const probe = tryAll(safetyCopy)
    if (probe) {
      probe.db.close()
      const failed = setAside(o.path, 'interrupted-rekey')
      copyFileSync(safetyCopy, o.path)
      notice = `An interrupted key change was undone; the unreadable file was kept at ${failed}.`
      log(notice)
      opened = tryAll(o.path)
    }
  }
  if (!opened) {
    return {
      status: 'locked',
      reason: 'None of the known keys can open the practice database. The file has not been changed. ' +
        'Restore database-key.json (from the backup vault or a copy of the app data folder), or set AETERNA_DB_KEY, then restart.'
    }
  }

  let { db, c } = opened
  let source = c.source

  // ── Damaged database: set aside as a matching set, start a fresh one ────────
  const check = integrity(db)
  if (check !== 'ok') {
    db.close()
    const where = setAside(o.path, 'damaged')
    log(`Integrity check failed (${check.slice(0, 200)}); database set aside at ${where}`)
    const fresh = openWithKey(o.path, c.key ?? stored?.key ?? generateDatabaseKey())
    return {
      status: 'ready', db: fresh, source, rekeyed: false, setAside: where,
      notice: `The practice database was damaged and has been set aside at ${where}. A new, empty database was started — restore your latest backup.`
    }
  }

  // ── Bring the key file in line with the key that worked ─────────────────────
  if (o.envKey) {
    if (source !== 'env') log(`AETERNA_DB_KEY does not open this database; it opened with the ${source} key instead`)
    return { status: 'ready', db, source, rekeyed: false, setAside: null, notice }
  }
  if (source === 'pending' || source === 'legacy') {
    // A finished key change whose record was not yet updated, or a pre-v5 key: adopt it, no re-encryption needed.
    o.keyStore.write({ key: c.key as string, origin: source === 'legacy' ? 'adopted' : 'generated' })
    return { status: 'ready', db, source, rekeyed: false, setAside: null, notice }
  }
  if (source === 'key-file') return { status: 'ready', db, source, rekeyed: false, setAside: null, notice }

  // ── Development key or plaintext: move to this installation's own key ───────
  const newKey = generateDatabaseKey()
  const before = tableCount(db)
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(o.path, safetyCopy)
    o.keyStore.write({ key: stored?.key ?? null, pendingKey: newKey, origin: 'generated' })
    rekey(db, newKey)
    db.close()
    const check2 = openWithKey(o.path, newKey)
    if (integrity(check2) !== 'ok' || tableCount(check2) !== before) {
      check2.close()
      throw new Error('verification after the key change failed')
    }
    o.keyStore.write({ key: newKey, origin: 'generated' })
    rmSync(safetyCopy, { force: true })
    log(`Database moved from the ${source} key to this installation's own key`)
    return { status: 'ready', db: check2, source: 'key-file', rekeyed: true, setAside: null, notice }
  } catch (err) {
    log(`Key change failed (${(err as Error).message}); restoring the original`)
    try {
      db.close()
    } catch {
      /* already closed */
    }
    if (existsSync(safetyCopy)) {
      for (const suffix of ['-wal', '-shm']) rmSync(o.path + suffix, { force: true })
      copyFileSync(safetyCopy, o.path)
      rmSync(safetyCopy, { force: true })
    }
    o.keyStore.write({ key: stored?.key ?? null, origin: 'generated' })
    const back = tryAll(o.path)
    if (!back) return { status: 'locked', reason: 'The database could not be reopened after a failed key change. The safety copy was restored; restart the app.' }
    db = back.db
    source = back.c.source
    return { status: 'ready', db, source, rekeyed: false, setAside: null, notice: 'Moving the database to its own key failed; it will be retried at the next start.' }
  }
}
