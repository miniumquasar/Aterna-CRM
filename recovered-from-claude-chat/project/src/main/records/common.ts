/**
 * Small helpers shared by the record services: which columns a table really has,
 * picking only those from what a screen sends, checking money and dates, and
 * turning database constraint errors into sentences a person can act on.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import { columnLabel } from '../../shared/data-model'
import { isPence } from '../../shared/money'
import { UserFacingError } from '../access/policy'

const cache = new WeakMap<Database, Map<string, Set<string>>>()

/** The table's columns, read once per connection. */
export function columnsOf(db: Database, table: string): Set<string> {
  let tables = cache.get(db)
  if (!tables) {
    tables = new Map()
    cache.set(db, tables)
  }
  let cols = tables.get(table)
  if (!cols) {
    cols = new Set((db.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all() as Array<{ name: string }>).map((c) => c.name))
    tables.set(table, cols)
  }
  return cols
}

/** Forgets cached columns (tests that change a schema on the same connection). */
export const forgetColumns = (db: Database): void => {
  cache.delete(db)
}

export const SYSTEM_COLUMNS: readonly string[] = ['id', 'created_at', 'updated_at']

/**
 * The input's keys that are real, writable columns. Screens often send display
 * fields (a joined client name, a label); those are ignored, which also keeps
 * anything a screen sends out of the SQL text.
 */
export function pickColumns(db: Database, table: string, input: unknown, skip: readonly string[] = SYSTEM_COLUMNS): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new UserFacingError('Nothing to save.')
  const known = columnsOf(db, table)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!known.has(k) || skip.includes(k)) continue
    if (v !== null && typeof v === 'object') throw new UserFacingError(`${columnLabel(table, k)} isn’t a value that can be saved.`)
    out[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v
  }
  return out
}

/** Refuses money that isn't whole pence. */
export function checkMoney(table: string, values: Record<string, unknown>, columns: readonly string[], allowNegative: readonly string[] = []): void {
  for (const c of columns) {
    if (!(c in values)) continue
    const v = values[c]
    if (v === null || v === '') {
      values[c] = null
      continue
    }
    if (!isPence(v, allowNegative.includes(c))) {
      throw new UserFacingError(
        typeof v === 'number' && v < 0 && !allowNegative.includes(c)
          ? `${columnLabel(table, c)} can’t be below zero.`
          : `${columnLabel(table, c)} must be an amount in pounds and pence.`
      )
    }
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A YYYY-MM-DD date, or null for empty. */
export function dateOrNull(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || !ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new UserFacingError(`${label} isn’t a valid date.`)
  }
  return value
}

/** Trimmed text, null when empty; refuses text longer than `max`. */
export function textOrNull(value: unknown, label: string, max = 2000): string | null {
  if (value === null || value === undefined) return null
  const t = String(value).trim()
  if (!t) return null
  if (t.length > max) throw new UserFacingError(`${label} is longer than ${max} characters.`)
  return t
}

/** Turns a constraint failure into a sentence; anything else is rethrown untouched. */
export function friendly(err: unknown, table: string): never {
  const msg = err instanceof Error ? err.message : String(err)
  const notNull = /NOT NULL constraint failed: \w+\.(\w+)/.exec(msg)
  if (notNull) throw new UserFacingError(`Fill in ${columnLabel(table, notNull[1]).toLowerCase()}.`)
  if (/FOREIGN KEY constraint failed/.test(msg)) throw new UserFacingError('That client no longer exists, or still has records the practice must keep.')
  if (/UNIQUE constraint failed: \w+\.(\w+)/.test(msg)) {
    const col = /UNIQUE constraint failed: \w+\.(\w+)/.exec(msg)![1]
    throw new UserFacingError(`That ${columnLabel(table, col).toLowerCase()} is already in use.`)
  }
  if (/CHECK constraint failed/.test(msg)) throw new UserFacingError('One of the values isn’t allowed here. Check the choices and amounts.')
  throw err
}

/** The client's current name, to keep the copies some tables hold from going stale. */
export function clientName(db: Database, ref: string): string | null {
  return (db.prepare('SELECT client_name FROM clients WHERE ref = ?').get(ref) as { client_name: string } | undefined)?.client_name ?? null
}

/** Local calendar date, YYYY-MM-DD: the practice works in local time, not UTC. */
export function localDate(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
