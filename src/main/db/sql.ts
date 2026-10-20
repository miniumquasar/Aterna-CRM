/** SQL fragments every migration uses, so tables agree on how times and dates look. */

/** The current instant as stored: ISO 8601 UTC with milliseconds, '2026-10-20T15:36:18.992Z'. */
export const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"

/** A CHECK that `column` is null or a real calendar date, 'YYYY-MM-DD'. */
export function dateCheck(column: string): string {
  return `CHECK (${column} IS NULL OR (${column} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(${column}) = ${column}))`
}

/** A CHECK that `column` is 0 or 1. */
export function boolCheck(column: string): string {
  return `CHECK (${column} IN (0, 1))`
}

/** A CHECK that `column` is null or a value sealed by field-crypto ('v1:…'). */
export function encryptedCheck(column: string): string {
  return `CHECK (${column} IS NULL OR ${column} GLOB 'v[0-9]*:*')`
}

/** `created_at` and `updated_at` columns. */
export const TIMESTAMPS = `created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}`

/** The current instant in the stored form, from JavaScript. */
export function nowIso(now: Date = new Date()): string {
  return now.toISOString()
}
