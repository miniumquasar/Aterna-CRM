/**
 * The settings table: JSON values by group and key (`appearance` / an OS
 * user name, `setup` / `completedAt`, …). Read and write it only through
 * these helpers, so values are always valid JSON.
 */
import type { Db } from './connection'

export function getSetting<T = unknown>(db: Db, group: string, key: string): T | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE "group" = ? AND key = ?').get(group, key) as { value: string } | undefined
  return row ? (JSON.parse(row.value) as T) : undefined
}

export function setSetting(db: Db, group: string, key: string, value: unknown, updatedBy: number | null = null): void {
  const json = JSON.stringify(value ?? null)
  db.prepare(
    `INSERT INTO settings ("group", key, value, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT ("group", key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  ).run(group, key, json, updatedBy)
}

export function deleteSetting(db: Db, group: string, key: string): void {
  db.prepare('DELETE FROM settings WHERE "group" = ? AND key = ?').run(group, key)
}

export function settingsInGroup(db: Db, group: string): Record<string, unknown> {
  const rows = db.prepare('SELECT key, value FROM settings WHERE "group" = ? ORDER BY key').all(group) as Array<{ key: string; value: string }>
  return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]))
}
