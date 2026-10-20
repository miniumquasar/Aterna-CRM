/**
 * backup.ts — making, testing, copying and restoring backups, their schedule,
 * and getting back in when the database's key file is lost. The rules are in
 * ../backup/.
 *
 *   partners and managers   back up, test, copy, change the schedule and folder
 *   partners                restore (with their password typed again) and delete
 *   nobody signed in        only on a new installation with no accounts yet, or
 *                           when the database can't be opened: restore from a
 *                           backup file with the recovery sheet, or unlock the
 *                           database with the recovery sheet
 *
 * A file a person picks stays in this process: the screen gets an expiring token.
 */
import { app, dialog, ipcMain, Notification, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BackupRecord, BackupStatus, BackupFileSummary } from '@shared/types'
import { closeLedger, currentDatabaseKey, getLedger } from '../database'
import { databaseKeyFile } from '../db/database-key'
import { openWithKey } from '../db/open-database'
import { MIGRATIONS } from '../db/migrations'
import { BackupService, BackupError, type BackupActivityState } from '../backup/service'
import { RestoreError, inspectBackup, type BackupSummary } from '../backup/restore'
import { fingerprintOf, keyFromSheet } from '../backup/keys'
import { describeSchedule } from '../backup/schedule'
import { AuthError } from '../auth/service'
import { UserFacingError } from '../access/policy'
import { sendToRenderer } from '../window-events'
import { getAuth, requireRole } from './auth'
import { recoveryStatus } from './recovery'

const APP_MIGRATION = [...MIGRATIONS].map((m) => m.id).sort().at(-1) ?? ''

let service: BackupService | null = null

export function backupService(): BackupService {
  if (!service) {
    const dataDir = app.getPath('userData')
    service = new BackupService({
      db: () => getLedger().db,
      dbPath: () => getLedger().path,
      dataDir,
      docsDir: join(dataDir, 'documents'),
      databaseKey: () => {
        const ledger = getLedger()
        const key = currentDatabaseKey()
        return typeof key === 'string' && key && (ledger.mode === 'encrypted' || ledger.mode === 'dev-only') ? key : null
      },
      appVersion: app.getVersion(),
      appMigration: APP_MIGRATION,
      onActivity: (state: BackupActivityState | null) => sendToRenderer('backup:activity', state)
    })
  }
  return service
}

type Reply<T> = ({ success: true } & T) | { success: false; error: string }

function fail(err: unknown): { success: false; error: string } {
  if (err instanceof BackupError || err instanceof RestoreError || err instanceof AuthError || err instanceof UserFacingError) return { success: false, error: err.message }
  console.error('[backup]', err)
  return { success: false, error: 'That couldn’t be done. Nothing was changed.' }
}

async function attempt<T extends object>(fn: () => Promise<T> | T): Promise<Reply<T>> {
  try {
    return { success: true, ...(await fn()) }
  } catch (err) {
    return fail(err)
  }
}

const actorOf = (u: { id: number; name: string }): { id: number; name: string } => ({ id: u.id, name: u.name })

/** Nobody signed in may restore or unlock only on a new installation, or when the database can't be opened. */
function setupMode(): boolean {
  try {
    return getLedger().mode === 'locked' || getAuth().status().firstRun
  } catch {
    return false
  }
}

function restartSoon(): void {
  setTimeout(() => {
    try {
      closeLedger()
    } finally {
      app.relaunch()
      app.exit(0)
    }
  }, 600)
}

// Files picked in a dialog, by token; a token lasts half an hour.
const picked = new Map<string, { path: string; summary: BackupSummary; until: number }>()
function pickedFile(token: unknown): { path: string; summary: BackupSummary } {
  const entry = typeof token === 'string' ? picked.get(token) : undefined
  if (!entry || entry.until < Date.now()) throw new BackupError('Choose the backup file again.')
  return entry
}

/**
 * Whether this PC's own key opens a backup, or the recovery sheet's key is needed.
 * An older backup (a database copy) names no key: this PC's own is tried first,
 * and the restore says so if it doesn't open — never opening the file in place.
 */
function needsKey(summary: BackupSummary): boolean {
  const key = backupService().ownKey()
  if (!key) return true
  return summary.format === 2 ? summary.keyFingerprint !== fingerprintOf(key) : false
}

function toRecord(r: ReturnType<BackupService['list']>[number]): BackupRecord {
  let test: BackupRecord['test'] = null
  if (r.tested_at) {
    try {
      const t = JSON.parse(r.test_result ?? '{}') as { ok?: boolean; summary?: string }
      test = { at: r.tested_at, ok: t.ok === true, summary: String(t.summary ?? '') }
    } catch {
      test = { at: r.tested_at, ok: false, summary: '' }
    }
  }
  return {
    id: r.id, filename: r.filename, file_path: r.file_path, file_size: r.file_size, created_by: r.created_by, notes: r.notes, created_at: r.created_at,
    kind: r.kind ?? 'manual', format: r.format === 2 ? 2 : 1, key_fingerprint: r.key_fingerprint, clients: r.clients, documents: r.documents,
    documents_bytes: r.documents_bytes, documents_missing: r.documents_missing, exists: r.exists, test
  }
}

/** Prepares the restore, then restarts the app to apply it. */
async function restoreFrom(path: string, summary: BackupSummary, recoveryKey: unknown, actor: { id: number; name: string } | null): Promise<{ restarting: true; documents: number }> {
  const svc = backupService()
  const own = svc.ownKey()
  let key: string
  if (typeof recoveryKey === 'string' && recoveryKey.trim()) {
    const typed = keyFromSheet(recoveryKey, summary.format === 2 ? summary.keyFingerprint : null)
    if (!typed.ok) throw new BackupError(typed.error)
    key = typed.key
  } else if (own && !needsKey(summary)) key = own
  else throw new BackupError(`Type the key from the recovery sheet${summary.keyFingerprint ? ` with fingerprint ${summary.keyFingerprint}` : ''}.`)
  if (summary.newerThanApp) throw new BackupError(`This backup was made by a newer version of AETERNA CRM (${summary.appVersion}). Install that version or later, then restore it.`)
  const staged = await svc.prepareRestore(path, key, key !== own, actor)
  restartSoon()
  return { restarting: true, documents: staged.documents.toRestore }
}

function summaryView(summary: BackupSummary): BackupFileSummary {
  return {
    filename: summary.filename, format: summary.format, createdAt: summary.createdAt, appVersion: summary.appVersion, keyFingerprint: summary.keyFingerprint,
    counts: summary.counts, documents: summary.documents, documentsInFolder: summary.documentsInFolder, newerThanApp: summary.newerThanApp, size: summary.size,
    needsKey: needsKey(summary)
  }
}

export function registerBackupHandlers(): void {
  ipcMain.handle('backup:status', async (): Promise<Reply<{ status: BackupStatus }>> =>
    attempt(() => {
      requireRole(['partner', 'manager'])
      const s = backupService().status()
      const recovery = recoveryStatus()
      const vaultSetUp = (() => {
        try {
          return !!getLedger().db.prepare('SELECT 1 FROM vault_keys LIMIT 1').get()
        } catch {
          return false
        }
      })()
      return {
        status: {
          ...s,
          scheduleText: describeSchedule(s.settings),
          recoverySheet: { available: recovery.available, done: recovery.done, fingerprint: recovery.fingerprint, savedAt: recovery.last?.savedAt ?? null, savedBy: recovery.last?.savedBy ?? null },
          vaultSetUp
        }
      }
    })
  )

  ipcMain.handle('backup:list', (): BackupRecord[] => {
    try {
      requireRole(['partner', 'manager'])
      return backupService().list().map(toRecord)
    } catch {
      return []
    }
  })

  ipcMain.handle('backup:create', async (_e, notes?: unknown) =>
    attempt(async () => {
      const me = requireRole(['partner', 'manager'])
      const made = await backupService().backUp('manual', actorOf(me), typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 300) : null)
      return { id: made.id, filename: made.filename, folder: made.store, documents: made.header.documents.stored, newDocuments: made.newDocuments, fellBack: made.fellBack }
    })
  )

  ipcMain.handle('backup:test', async (_e, id: unknown) =>
    attempt(async () => {
      const me = requireRole(['partner', 'manager'])
      return { result: await backupService().test(id, actorOf(me)) }
    })
  )

  ipcMain.handle('backup:delete', async (_e, id: unknown) =>
    attempt(async () => {
      const me = requireRole(['partner'])
      await backupService().remove(id, actorOf(me))
      return {}
    })
  )

  ipcMain.handle('backup:save-settings', (_e, input: unknown) =>
    attempt(() => {
      const me = requireRole(['partner', 'manager'])
      return { settings: backupService().saveSettings(input, actorOf(me)) }
    })
  )

  ipcMain.handle('backup:choose-folder', async () =>
    attempt(async () => {
      requireRole(['partner', 'manager'])
      const r = await dialog.showOpenDialog({ title: 'Choose a folder for backups', properties: ['openDirectory', 'createDirectory'] })
      return { folder: r.canceled || !r.filePaths[0] ? null : r.filePaths[0] }
    })
  )

  ipcMain.handle('backup:copy', async (_e, id: unknown) =>
    attempt(async () => {
      const me = requireRole(['partner', 'manager'])
      backupService().row(id)
      const r = await dialog.showOpenDialog({ title: 'Copy the backup to…', buttonLabel: 'Copy here', properties: ['openDirectory', 'createDirectory'] })
      if (r.canceled || !r.filePaths[0]) return { copied: null }
      return { copied: await backupService().copyTo(id, r.filePaths[0], actorOf(me)) }
    })
  )

  ipcMain.handle('backup:open-folder', async () =>
    attempt(async () => {
      requireRole(['partner', 'manager'])
      const { store } = backupService().currentStore()
      mkdirSync(store, { recursive: true })
      const error = await shell.openPath(store)
      if (error) throw new BackupError(`The folder couldn’t be opened: ${error}`)
      return {}
    })
  )

  // Restore a backup in the list: partners, with their password typed again.
  ipcMain.handle('backup:restore', async (_e, id: unknown, password: unknown, recoveryKey?: unknown) =>
    attempt(async () => {
      const me = requireRole(['partner'])
      if (!getAuth().confirmPassword(String(password ?? ''))) throw new BackupError('That password isn’t right.')
      const row = backupService().row(id)
      if (!existsSync(row.file_path)) throw new BackupError('The backup file isn’t there any more, so it can’t be restored.')
      const summary = await inspectBackup(row.file_path, APP_MIGRATION)
      return restoreFrom(row.file_path, summary, recoveryKey, actorOf(me))
    })
  )

  // Choose a backup file anywhere (a new PC, a USB drive): partners, or anyone during set-up.
  ipcMain.handle('backup:choose-file', async () =>
    attempt(async () => {
      if (!setupMode()) requireRole(['partner'])
      const r = await dialog.showOpenDialog({
        title: 'Choose the backup to restore',
        properties: ['openFile'],
        filters: [{ name: 'AETERNA CRM backups', extensions: ['aeterna-backup', 'db'] }]
      })
      if (r.canceled || !r.filePaths[0]) return { token: null, summary: null }
      const summary = await inspectBackup(r.filePaths[0], APP_MIGRATION)
      const token = randomUUID()
      picked.set(token, { path: r.filePaths[0], summary, until: Date.now() + 30 * 60_000 })
      return { token, summary: summaryView(summary) }
    })
  )

  ipcMain.handle('backup:restore-file', async (_e, token: unknown, input: unknown) =>
    attempt(async () => {
      const { password, recoveryKey } = (input && typeof input === 'object' ? input : {}) as { password?: unknown; recoveryKey?: unknown }
      let actor: { id: number; name: string } | null = null
      if (!setupMode()) {
        const me = requireRole(['partner'])
        if (!getAuth().confirmPassword(String(password ?? ''))) throw new BackupError('That password isn’t right.')
        actor = actorOf(me)
      }
      const { path, summary } = pickedFile(token)
      return restoreFrom(path, summary, recoveryKey, actor)
    })
  )

  // The database is locked (its key file is lost or damaged): unlock it with the key from the recovery sheet.
  ipcMain.handle('backup:unlock', async (_e, recoveryKey: unknown) =>
    attempt(async () => {
      const ledger = getLedger()
      if (ledger.mode !== 'locked') throw new BackupError('The database is open already.')
      const typed = keyFromSheet(String(recoveryKey ?? ''), null)
      if (!typed.ok) throw new BackupError(typed.error)
      try {
        const probe = openWithKey(ledger.path, typed.key)
        const ok = String(probe.pragma('quick_check', { simple: true })) === 'ok'
        probe.close()
        if (!ok) throw new Error('check')
      } catch {
        throw new BackupError(`This key (fingerprint ${fingerprintOf(typed.key)}) doesn’t open the database on this computer. Check the recovery sheet is this practice’s, and the newest one.`)
      }
      databaseKeyFile(join(app.getPath('userData'), 'database-key.json')).write({ key: typed.key, origin: 'generated' })
      restartSoon()
      return { restarting: true }
    })
  )
}

// ── Scheduled backups ──────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null
let first: ReturnType<typeof setTimeout> | null = null

async function tick(): Promise<void> {
  const r = await backupService().runScheduledIfDue()
  if (!r.ran) return
  sendToRenderer('backup:changed', null)
  if ('error' in r) {
    if (Notification.isSupported()) new Notification({ title: 'The scheduled backup didn’t work', body: r.error }).show()
  } else if (r.made.fellBack && Notification.isSupported()) {
    new Notification({ title: 'Backup saved in the app’s own folder', body: r.made.fellBack }).show()
  }
}

/** Checks every minute whether a scheduled backup is due; the first check soon after start. */
export function startBackupScheduler(): void {
  stopBackupScheduler()
  first = setTimeout(() => void tick().catch(() => undefined), 20_000)
  timer = setInterval(() => void tick().catch(() => undefined), 60_000)
}

export function stopBackupScheduler(): void {
  if (first) clearTimeout(first)
  if (timer) clearInterval(timer)
  first = null
  timer = null
}

