/**
 * Versioned schema migrations (v5 → registers).
 *
 * Why a second mechanism next to database.ts's `PRAGMA user_version` block:
 * the existing `migrate()` is one large CREATE-IF-NOT-EXISTS batch that
 * stops at user_version 6 and cannot express ordered, one-off changes.
 * From 0007 onwards every schema change is a numbered, immutable
 * `Migration` recorded in `schema_migrations` with a checksum.
 *
 * Guarantees
 *   1. Ordered      — applied strictly by id; ids must be unique.
 *   2. Atomic       — each migration runs in its own transaction.
 *   3. Immutable    — editing an applied migration is detected (checksum)
 *                     and refused; write a new migration instead.
 *   4. Idempotent   — re-running applies nothing new.
 *   5. Non-fatal    — `applyMigrationsSafely` never throws. database.ts's
 *                     openWithRecovery() rotates the DB aside on ANY
 *                     exception, so a migration error must not escape
 *                     into that path. Failures are reported via
 *                     `getMigrationStatus()` and the import IPC refuses
 *                     to run until the schema is current.
 */

import { createHash } from 'node:crypto'
import type { Database } from 'better-sqlite3-multiple-ciphers'
import { MIGRATIONS } from './migrations'

export interface ColumnAddition {
  table: string
  column: string
  /** Column definition after the name, e.g. `TEXT` or `INTEGER NOT NULL DEFAULT 0`. */
  definition: string
}

export interface Migration {
  /** Sortable unique id, e.g. `0007_practice_registers`. Never rename. */
  id: string
  description: string
  /** Columns added only if missing — SQLite has no ADD COLUMN IF NOT EXISTS. */
  addColumns?: readonly ColumnAddition[]
  /** DDL/DML executed after `addColumns`, inside the same transaction. */
  up: string
}

export interface MigrationStatus {
  ok: boolean
  applied: string[]
  pending: string[]
  error: string | null
}

let lastStatus: MigrationStatus = { ok: false, applied: [], pending: [], error: 'not run' }

export function getMigrationStatus(): MigrationStatus {
  return lastStatus
}

export function checksumOf(m: Migration): string {
  return createHash('sha256')
    .update(JSON.stringify({ addColumns: m.addColumns ?? [], up: m.up }))
    .digest('hex')
}

function columnExists(db: Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as Array<{ name: string }>
  return rows.some((r) => r.name === column)
}

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`)
  return `"${name}"`
}

/** Applies pending migrations. Throws on failure — call the Safely variant at startup. */
export function applyMigrations(db: Database, migrations: readonly Migration[] = MIGRATIONS): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id         TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    checksum   TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  const ids = migrations.map((m) => m.id)
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate migration id')
  const sorted = [...migrations].sort((a, b) => a.id.localeCompare(b.id))

  const applied = new Map(
    (db.prepare('SELECT id, checksum FROM schema_migrations').all() as Array<{ id: string; checksum: string }>)
      .map((r) => [r.id, r.checksum])
  )

  const newlyApplied: string[] = []
  for (const m of sorted) {
    const sum = checksumOf(m)
    const prior = applied.get(m.id)
    if (prior !== undefined) {
      if (prior !== sum) {
        throw new Error(
          `Migration ${m.id} was edited after it was applied (checksum mismatch). ` +
            'Applied migrations are immutable — add a new migration instead.'
        )
      }
      continue
    }
    db.transaction(() => {
      for (const c of m.addColumns ?? []) {
        if (!columnExists(db, c.table, c.column)) {
          db.exec(`ALTER TABLE ${quoteIdent(c.table)} ADD COLUMN ${quoteIdent(c.column)} ${c.definition}`)
        }
      }
      db.exec(m.up)
      db.prepare('INSERT INTO schema_migrations (id, description, checksum) VALUES (?, ?, ?)').run(
        m.id,
        m.description,
        sum
      )
    })()
    newlyApplied.push(m.id)
  }
  return newlyApplied
}

/**
 * Startup entry point. Never throws: a failed migration leaves the database
 * on its previous schema (the failed migration's transaction rolled back),
 * logs the error, and records it for `getMigrationStatus()`.
 */
export function applyMigrationsSafely(
  db: Database,
  migrations: readonly Migration[] = MIGRATIONS,
  log: Pick<Console, 'info' | 'error'> = console
): MigrationStatus {
  try {
    const now = applyMigrations(db, migrations)
    if (now.length) log.info(`[migrate] applied: ${now.join(', ')}`)
    const done = (db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as Array<{ id: string }>).map(
      (r) => r.id
    )
    lastStatus = { ok: true, applied: done, pending: [], error: null }
  } catch (err) {
    const message = (err as Error).message
    log.error('[migrate] FAILED — database left on previous schema:', message)
    let done: string[] = []
    try {
      done = (db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as Array<{ id: string }>).map(
        (r) => r.id
      )
    } catch {
      /* table may not exist */
    }
    lastStatus = {
      ok: false,
      applied: done,
      pending: migrations.map((m) => m.id).filter((id) => !done.includes(id)),
      error: message
    }
  }
  return lastStatus
}
