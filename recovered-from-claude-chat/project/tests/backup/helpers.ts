import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Database } from 'better-sqlite3-multiple-ciphers'
import { openWithKey } from '../../src/main/db/open-database'
import { applyMigrations } from '../../src/main/db/migrate'
import { createBaseDatabase } from '../../scripts/base-schema'
import { MIGRATIONS } from '../../src/main/db/migrations'
import type { BackupSource } from '../../src/main/backup/create'

const BASE_SCHEMA = process.env.CRM_DATABASE_TS ?? resolve(__dirname, '../../src/main/database.ts')

export const KEY = 'ab'.repeat(32)
export const OTHER_KEY = 'cd'.repeat(32)
export const APP_MIGRATION = [...MIGRATIONS].map((m) => m.id).sort().at(-1) as string

export interface Practice {
  dir: string
  dbPath: string
  docsDir: string
  db: Database
  source: BackupSource
  store: string
  setNow: (iso: string) => void
  now: () => Date
  addDocument: (clientRef: string, name: string, content: string | Buffer) => { id: number; path: string }
}

/** A data folder with an encrypted database (base schema + every migration) and a documents folder. */
export function practice(key = KEY): Practice {
  const dir = mkdtempSync(join(tmpdir(), 'aeterna-backup-'))
  const dbPath = join(dir, 'aeterna.db')
  const docsDir = join(dir, 'documents')
  mkdirSync(docsDir, { recursive: true })
  const db = openWithKey(dbPath, key)
  db.pragma('journal_mode = WAL')
  createBaseDatabase(db, BASE_SCHEMA)
  applyMigrations(db)
  db.exec("INSERT INTO clients (ref, client_name) VALUES ('CL0001', 'Made Up Trading Ltd'), ('CL0002', 'Example Holdings Ltd')")
  let clock = new Date('2026-10-12T09:00:00Z')
  const now = (): Date => clock
  const addDocument = (clientRef: string, name: string, content: string | Buffer): { id: number; path: string } => {
    const folder = join(docsDir, clientRef)
    mkdirSync(folder, { recursive: true })
    const path = join(folder, name)
    writeFileSync(path, content)
    const id = Number(
      db.prepare('INSERT INTO documents (client_ref, filename, file_path, category, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?)')
        .run(clientRef, name, path, 'General', Buffer.byteLength(content), 'pdf').lastInsertRowid
    )
    return { id, path }
  }
  return {
    dir, dbPath, docsDir, db, store: join(dir, 'backups'), now, addDocument,
    setNow: (iso) => (clock = new Date(iso)),
    source: { db, dbPath, docsDir, workDir: join(dir, 'backup-work'), databaseKey: key, appVersion: '5.0.0', now }
  }
}
