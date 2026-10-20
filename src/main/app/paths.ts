/**
 * Where the practice's data lives. Everything is in one folder, so a backup
 * or a move to a new PC is one folder:
 *
 *   <appData>/AETERNA CRM/        (or AETERNA_DATA_DIR, for tests and smoke runs)
 *     aeterna.db                  the encrypted database (+ -wal, -shm)
 *     database-key.json           its key; never in a backup
 *     documents/                  stored client documents
 *     backups/                    automatic backups (unless moved to another drive)
 *     logs/                       startup.log, app.log
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { DATA_FOLDER_NAME } from '@shared/product'

export interface DataPaths {
  root: string
  database: string
  keyFile: string
  documents: string
  backups: string
  logs: string
  startupLog: string
  appLog: string
}

export const DATABASE_FILE = 'aeterna.db'
export const KEY_FILE = 'database-key.json'

/** Folders earlier builds used, which this build reports but never reads. */
export const LEGACY_DATA_FOLDERS: readonly string[] = ['Companies House CRM', 'companies-house-crm', 'COMPANIES HOUSE CRM']

export function resolveDataRoot(appDataDir: string, env: Record<string, string | undefined> = process.env): string {
  const override = env.AETERNA_DATA_DIR?.trim()
  if (override) return isAbsolute(override) ? override : resolve(override)
  return join(appDataDir, DATA_FOLDER_NAME)
}

export function dataPathsFor(root: string): DataPaths {
  const logs = join(root, 'logs')
  return {
    root,
    database: join(root, DATABASE_FILE),
    keyFile: join(root, KEY_FILE),
    documents: join(root, 'documents'),
    backups: join(root, 'backups'),
    logs,
    startupLog: join(logs, 'startup.log'),
    appLog: join(logs, 'app.log')
  }
}

export function ensureDataFolders(paths: DataPaths): void {
  for (const dir of [paths.root, paths.documents, paths.backups, paths.logs]) mkdirSync(dir, { recursive: true })
}

/** Folders left by earlier builds that still hold files, beside the current data folder. */
export function findLegacyData(appDataDir: string, currentRoot: string): string[] {
  return LEGACY_DATA_FOLDERS.map((name) => join(appDataDir, name)).filter((dir) => {
    if (resolve(dir) === resolve(currentRoot) || !existsSync(dir)) return false
    try {
      return readdirSync(dir).length > 0
    } catch {
      return false
    }
  })
}

let current: DataPaths | null = null

export function setDataPaths(paths: DataPaths): void {
  current = paths
}

/** The data folder's paths. Throws before start-up step 2 has set them. */
export function dataPaths(): DataPaths {
  if (!current) throw new Error('The data folder has not been set up yet (start-up step 2).')
  return current
}
