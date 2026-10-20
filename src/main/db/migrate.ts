/**
 * Schema migrations: the only source of the schema. Each is
 * `{ id: 'NNNN_name', up(db) }`, applied in id order, each inside its own
 * transaction, and recorded in schema_migrations. A migration never drops
 * user data; once released it is never edited (write a new one).
 *
 * A migration that rebuilds a table can ask for `foreignKeys: 'off'`: foreign
 * keys are switched off around its transaction and every key is checked
 * before it commits.
 */
import { PlainError } from '../app/plain-error'
import { nullLogger, type Logger } from '../app/logger'
import type { Db } from './connection'
import { NOW } from './sql'

export interface Migration {
  /** Sortable and unique, 'NNNN_name', in the domain's number range. Never renamed. */
  id: string
  up(db: Db): void
  /** 'off' for a migration that rebuilds tables (see above). */
  foreignKeys?: 'off'
}

export class MigrationError extends PlainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'MigrationError'
  }
}

const ID = /^\d{4}_[a-z0-9_]+$/

/** The order migrations apply in: by id, compared character by character (never by locale). */
export function compareMigrationIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Throws if ids are malformed or repeated, or two share a number (0401_a and 0401_b). */
export function validateMigrations(migrations: readonly Migration[]): void {
  const seen = new Set<string>()
  const numbers = new Map<string, string>()
  for (const m of migrations) {
    if (!ID.test(m.id)) throw new Error(`Migration id “${m.id}” must look like 0401_client_registers.`)
    if (seen.has(m.id)) throw new Error(`Migration id “${m.id}” is used twice.`)
    const n = m.id.slice(0, 4)
    const other = numbers.get(n)
    if (other) throw new Error(`Migrations “${other}” and “${m.id}” share the number ${n}; give each its own.`)
    seen.add(m.id)
    numbers.set(n, m.id)
  }
}

export function ensureMigrationTable(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT ${NOW}
  ) STRICT`)
}

export function appliedMigrations(db: Db): string[] {
  ensureMigrationTable(db)
  return (db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as Array<{ id: string }>).map((r) => r.id)
}

export interface MigrateResult {
  applied: string[]
  total: number
}

export function migrate(db: Db, migrations: readonly Migration[], log: Logger = nullLogger): MigrateResult {
  validateMigrations(migrations)
  const done = new Set(appliedMigrations(db))
  const known = new Set(migrations.map((m) => m.id))
  const unknown = [...done].filter((id) => !known.has(id))
  if (unknown.length) {
    throw new MigrationError(
      'This database was last used by a newer version of AETERNA CRM, which made changes this version doesn’t know ' +
        `(${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? '…' : ''}). The database has not been changed. ` +
        'Install the newer version again to carry on.'
    )
  }

  const pending = [...migrations].filter((m) => !done.has(m.id)).sort((a, b) => compareMigrationIds(a.id, b.id))
  const applied: string[] = []
  for (const m of pending) {
    const keysOff = m.foreignKeys === 'off'
    if (keysOff) db.pragma('foreign_keys = OFF')
    try {
      db.transaction(() => {
        m.up(db)
        if (keysOff) {
          const problems = db.pragma('foreign_key_check') as unknown[]
          if (problems.length) throw new Error(`${problems.length} foreign key problem(s) after the migration.`)
        }
        db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(m.id)
      })()
    } catch (cause) {
      log.error(`Migration ${m.id} failed and was rolled back.`, cause)
      throw new MigrationError(
        `The database couldn’t be brought up to date (step ${m.id} failed), so nothing was changed. ` +
          'The details are in the app’s log. Contact support if this keeps happening.',
        { cause }
      )
    } finally {
      if (keysOff) db.pragma('foreign_keys = ON')
    }
    applied.push(m.id)
    log.info(`Migration ${m.id} applied.`)
  }
  return { applied, total: done.size + applied.length }
}
