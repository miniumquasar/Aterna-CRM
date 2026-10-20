/**
 * Backups for the running app: where they go, when they're made, which are
 * kept, testing, copying and preparing restores. No Electron here — the IPC
 * layer (../ipc/backup.ts) adds dialogs, notifications and the restart.
 *
 * One backup job runs at a time (making, testing, restoring, copying or
 * tidying); another asked for meanwhile is refused with a plain message.
 */
import { existsSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { Database } from 'better-sqlite3-multiple-ciphers'
import { auditChanges, writeAudit, type Row } from '../access/audit'
import { isInside } from '../records/documents'
import type { BackupKind } from './file'
import { BackupError, makeBackup, sqlTime, type BackupMade, type BackupProgress } from './create'
import { backupKeys } from './crypto'
import { fingerprintOf } from './keys'
import { cleanUpStore, copyBackup, type Copied } from './maintain'
import { stageRestore, testBackup, type BackupTest, type RestoreProgress, type StagedRestore } from './restore'
import { DEFAULT_SCHEDULE, isDue, nextDue, parseTime, SCHEDULES, scheduledToRemove, type BackupSchedule, type ScheduleSettings } from './schedule'
import { documentsBytes, folderWritable, isBackupFileName, storeFolderIn } from './store'

export { BackupError }

export type BackupActivity = 'backup' | 'test' | 'restore' | 'copy' | 'tidy'

export interface BackupSettings extends ScheduleSettings {
  /** A folder chosen for backups (an external drive, a NAS), or null for the app's own folder. */
  folder: string | null
}

export interface BackupRow {
  id: number
  filename: string
  file_path: string
  file_size: number | null
  created_by: string | null
  notes: string | null
  created_at: string
  kind: BackupKind | null
  format: number | null
  key_fingerprint: string | null
  clients: number | null
  documents: number | null
  documents_bytes: number | null
  documents_missing: number | null
  tested_at: string | null
  test_result: string | null
}

export interface BackupActivityState {
  activity: BackupActivity
  stage: string
  done: number
  total: number
}

export interface BackupServiceDeps {
  db: () => Database
  dbPath: () => string
  dataDir: string
  docsDir: string
  /** The key the database is open with; null when it isn't saved under one (locked, in memory). */
  databaseKey: () => string | null
  appVersion: string
  /** The newest schema change this version of the app knows. */
  appMigration: string
  now?: () => Date
  /** Told about every step of the job running, and null when it ends. */
  onActivity?: (state: BackupActivityState | null) => void
}

type Actor = { id: number; name: string } | null

const SETTING = {
  schedule: 'backup_schedule',
  time: 'backup_time',
  weekday: 'backup_weekday',
  folder: 'backup_folder',
  lastError: 'backup_last_error',
  folderProblem: 'backup_folder_problem'
} as const

const HOUR = 3_600_000
/** After a scheduled backup fails, wait this long before trying again. */
const RETRY_AFTER = HOUR

/** "2026-10-12 18:15:00" (UTC, as SQLite stores it) as a Date. */
export const fromSqlTime = (s: string): Date => new Date(`${s.replace(' ', 'T')}${/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'}`)

/** Files this app may delete: its own backup files, and older backups' database copies. */
const isOurFile = (path: string): boolean => isBackupFileName(basename(path)) || /^aeterna-backup-\d{8}-\d{6}(?:-\d+)?\.db$/.test(basename(path))

export class BackupService {
  private running: BackupActivityState | null = null
  private lastScheduledFailure = 0
  /** Slow answers about folders (on a NAS especially), kept briefly; cleared when a job ends. */
  private readonly cache = new Map<string, { at: number; value: unknown }>()

  constructor(private readonly deps: BackupServiceDeps) {}

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))()
  }

  private get db(): Database {
    return this.deps.db()
  }

  private getSetting(key: string): string | null {
    return (this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null
  }

  private setSetting(key: string, value: string | null): void {
    if (value === null) this.db.prepare('DELETE FROM app_settings WHERE key = ?').run(key)
    else this.db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value)
  }

  /** The key the database is open with, or null. */
  ownKey(): string | null {
    return this.deps.databaseKey()
  }

  private key(): string {
    const key = this.deps.databaseKey()
    if (!key) throw new BackupError('Backups need the practice database to be open with its key, and it isn’t right now.')
    return key
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  settings(): BackupSettings {
    const schedule = this.getSetting(SETTING.schedule) as BackupSchedule | null
    const time = this.getSetting(SETTING.time)
    const weekday = Number(this.getSetting(SETTING.weekday))
    return {
      schedule: schedule && SCHEDULES.includes(schedule) ? schedule : DEFAULT_SCHEDULE.schedule,
      time: time && parseTime(time) ? time : DEFAULT_SCHEDULE.time,
      weekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 && this.getSetting(SETTING.weekday) !== null ? weekday : DEFAULT_SCHEDULE.weekday,
      folder: this.getSetting(SETTING.folder) || null
    }
  }

  saveSettings(input: unknown, actor: Actor): BackupSettings {
    const s = (input && typeof input === 'object' ? input : {}) as Partial<BackupSettings>
    const before = this.settings()
    const next: BackupSettings = { ...before }
    if (s.schedule !== undefined) {
      if (!SCHEDULES.includes(s.schedule)) throw new BackupError('Unknown backup schedule.')
      next.schedule = s.schedule
    }
    if (s.time !== undefined) {
      if (!parseTime(s.time)) throw new BackupError('Give the time as hours and minutes, for example 12:30.')
      next.time = s.time
    }
    if (s.weekday !== undefined) {
      if (!Number.isInteger(s.weekday) || s.weekday < 0 || s.weekday > 6) throw new BackupError('Unknown day of the week.')
      next.weekday = s.weekday
    }
    if (s.folder !== undefined) {
      const folder = s.folder ? resolve(String(s.folder)) : null
      if (folder && (folder === resolve(this.deps.dataDir) || isInside(this.deps.dataDir, folder))) {
        throw new BackupError('Choose a folder outside the app’s own data folder — on another drive, a NAS, or a USB drive — so a backup survives this computer.')
      }
      if (folder && !folderWritable(folder)) throw new BackupError('That folder can’t be written to. Check the drive is connected and you can save files there.')
      next.folder = folder
    }
    const diff = auditChanges('app_settings', before as unknown as Row, next as unknown as Row, [])
    if (!diff) return before
    this.db.transaction(() => {
      this.setSetting(SETTING.schedule, next.schedule)
      this.setSetting(SETTING.time, next.time)
      this.setSetting(SETTING.weekday, String(next.weekday))
      this.setSetting(SETTING.folder, next.folder)
      if (next.folder !== before.folder) this.setSetting(SETTING.folderProblem, null)
      writeAudit(this.db, actor, 'Changed the backup settings', 'app_settings', 'backup', diff.before, diff.after)
    })()
    this.cache.clear()
    return next
  }

  /** The app's own backup folder. */
  defaultStore(): string {
    return join(this.deps.dataDir, 'backups')
  }

  /** Whether a folder can be written to, remembered for a minute (screens ask often; a NAS answers slowly). */
  private writable(folder: string, fresh = false): boolean {
    const hit = this.cache.get(`w:${folder}`)
    if (!fresh && hit && Date.now() - hit.at < 60_000) return hit.value as boolean
    const value = folderWritable(folder)
    this.cache.set(`w:${folder}`, { at: Date.now(), value })
    return value
  }

  /** Where the next backup goes: the chosen folder if it can be written to now, otherwise the app's own. */
  currentStore(fresh = false): { store: string; chosen: string | null; problem: string | null } {
    const { folder } = this.settings()
    if (!folder) return { store: this.defaultStore(), chosen: null, problem: null }
    const key = this.deps.databaseKey()
    if (!key) return { store: this.defaultStore(), chosen: folder, problem: null }
    if (!this.writable(folder, fresh)) {
      return { store: this.defaultStore(), chosen: folder, problem: `The backup folder ${folder} isn’t available (is the drive connected?), so backups are going to the app’s own folder until it is.` }
    }
    return { store: storeFolderIn(folder, fingerprintOf(key)), chosen: folder, problem: null }
  }

  // ── The list ───────────────────────────────────────────────────────────────

  list(): Array<BackupRow & { exists: boolean }> {
    const rows = this.db.prepare('SELECT * FROM backup_registry ORDER BY created_at DESC, id DESC').all() as BackupRow[]
    return rows.map((r) => ({ ...r, exists: existsSync(r.file_path) }))
  }

  row(id: unknown): BackupRow {
    const n = Number(id)
    const row = Number.isInteger(n) ? (this.db.prepare('SELECT * FROM backup_registry WHERE id = ?').get(n) as BackupRow | undefined) : undefined
    if (!row) throw new BackupError('That backup is no longer in the list.')
    return row
  }

  private lastOf(kind: BackupKind | null): BackupRow | null {
    const sql = kind ? 'SELECT * FROM backup_registry WHERE kind = ? ORDER BY created_at DESC, id DESC LIMIT 1' : 'SELECT * FROM backup_registry ORDER BY created_at DESC, id DESC LIMIT 1'
    return ((kind ? this.db.prepare(sql).get(kind) : this.db.prepare(sql).get()) as BackupRow | undefined) ?? null
  }

  status(): {
    settings: BackupSettings
    store: string
    folderProblem: string | null
    keyFingerprint: string | null
    lastBackup: { at: string; filename: string; kind: BackupKind | null } | null
    nextDue: string | null
    lastError: { at: string; message: string } | null
    lastTest: { at: string; ok: boolean; summary: string; filename: string } | null
    running: BackupActivityState | null
    count: number
    bytes: number
  } {
    const settings = this.settings()
    const where = this.currentStore()
    const last = this.lastOf(null)
    const lastScheduled = this.lastOf('scheduled')
    const due = nextDue(settings, lastScheduled ? fromSqlTime(lastScheduled.created_at) : null, this.now())
    const tested = this.db.prepare('SELECT filename, tested_at, test_result FROM backup_registry WHERE tested_at IS NOT NULL ORDER BY tested_at DESC LIMIT 1').get() as
      | { filename: string; tested_at: string; test_result: string | null }
      | undefined
    let lastTest: { at: string; ok: boolean; summary: string; filename: string } | null = null
    if (tested) {
      try {
        const r = JSON.parse(tested.test_result ?? '{}') as { ok?: boolean; summary?: string }
        lastTest = { at: tested.tested_at, ok: r.ok === true, summary: String(r.summary ?? ''), filename: tested.filename }
      } catch {
        lastTest = { at: tested.tested_at, ok: false, summary: '', filename: tested.filename }
      }
    }
    let lastError: { at: string; message: string } | null = null
    try {
      lastError = JSON.parse(this.getSetting(SETTING.lastError) ?? 'null')
    } catch {
      lastError = null
    }
    const totals = this.db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(file_size), 0) AS bytes FROM backup_registry').get() as { n: number; bytes: number }
    const key = this.deps.databaseKey()
    return {
      settings,
      store: where.store,
      folderProblem: where.problem,
      keyFingerprint: key ? fingerprintOf(key) : null,
      lastBackup: last ? { at: last.created_at, filename: last.filename, kind: last.kind } : null,
      nextDue: due ? due.toISOString() : null,
      lastError,
      lastTest,
      running: this.running,
      count: totals.n,
      bytes: totals.bytes + this.documentsSize(where.store)
    }
  }

  /** The stored documents' size in a folder, remembered for five minutes (it means a look at every file). */
  private documentsSize(store: string): number {
    const hit = this.cache.get(`d:${store}`)
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value as number
    const value = documentsBytes(store)
    this.cache.set(`d:${store}`, { at: Date.now(), value })
    return value
  }

  // ── Jobs ───────────────────────────────────────────────────────────────────

  get busy(): BackupActivityState | null {
    return this.running
  }

  private async exclusive<T>(activity: BackupActivity, job: (step: (stage: string, done: number, total: number) => void) => Promise<T>): Promise<T> {
    if (this.running) {
      const what: Record<BackupActivity, string> = {
        backup: 'A backup is being made', test: 'A backup is being tested', restore: 'A restore is being prepared',
        copy: 'A backup is being copied', tidy: 'Old backups are being tidied away'
      }
      throw new BackupError(`${what[this.running.activity]} right now. Try again when it has finished.`)
    }
    this.running = { activity, stage: 'starting', done: 0, total: 0 }
    this.deps.onActivity?.(this.running)
    const step = (stage: string, done: number, total: number): void => {
      this.running = { activity, stage, done, total }
      this.deps.onActivity?.(this.running)
    }
    try {
      return await job(step)
    } finally {
      this.running = null
      this.cache.clear()
      this.deps.onActivity?.(null)
    }
  }

  /** Makes a backup now. `fellBack` says when the chosen folder wasn't available. */
  async backUp(kind: BackupKind, actor: Actor, notes: string | null): Promise<BackupMade & { fellBack: string | null; tidied: number }> {
    const key = this.key()
    return this.exclusive('backup', async (step) => {
      // Looked at afresh: a drive plugged in a moment ago counts.
      const where = this.currentStore(true)
      const made = await makeBackup(
        { db: this.db, dbPath: this.deps.dbPath(), docsDir: this.deps.docsDir, workDir: join(this.deps.dataDir, 'backup-work'), databaseKey: key, appVersion: this.deps.appVersion, now: this.deps.now },
        where.store,
        { kind, actor, notes, onProgress: (p: BackupProgress) => step(p.stage, p.done, p.total) }
      )
      this.setSetting(SETTING.lastError, null)
      this.setSetting(SETTING.folderProblem, where.problem ? JSON.stringify({ at: this.now().toISOString(), message: where.problem }) : null)
      step('tidying', 0, 1)
      const tidied = kind === 'scheduled' ? await this.tidyNow(key) : 0
      return { ...made, fellBack: where.problem, tidied }
    })
  }

  /** Removes scheduled backups past keeping, then stored documents no backup lists. Returns how many backups went. */
  private async tidyNow(key: string): Promise<number> {
    const scheduled = this.db.prepare("SELECT id, created_at, file_path, filename FROM backup_registry WHERE kind = 'scheduled'").all() as Array<{ id: number; created_at: string; file_path: string; filename: string }>
    const remove = new Set(scheduledToRemove(scheduled.map((r) => ({ id: r.id, createdAt: fromSqlTime(r.created_at) })), this.now()))
    const stores = new Set<string>([this.currentStore().store])
    const gone: string[] = []
    for (const r of scheduled) {
      if (!remove.has(r.id)) continue
      if (isOurFile(r.file_path)) rmSync(r.file_path, { force: true })
      stores.add(dirname(r.file_path))
      gone.push(r.filename)
    }
    if (gone.length) {
      this.db.transaction(() => {
        const del = this.db.prepare('DELETE FROM backup_registry WHERE id = ?')
        for (const id of remove) del.run(id)
        writeAudit(this.db, null, 'Removed old scheduled backups', 'backup_registry', null, { filenames: gone }, null)
      })()
    }
    const keys = backupKeys(key)
    for (const store of stores) if (existsSync(store)) await cleanUpStore(store, keys, this.now().getTime())
    return gone.length
  }

  async tidy(): Promise<number> {
    const key = this.key()
    return this.exclusive('tidy', () => this.tidyNow(key))
  }

  /** Called every minute or so: makes the scheduled backup when it's due. */
  async runScheduledIfDue(): Promise<{ ran: false } | { ran: true; made: BackupMade & { fellBack: string | null } } | { ran: true; error: string }> {
    if (this.running || !this.deps.databaseKey()) return { ran: false }
    const settings = this.settings()
    const last = this.lastOf('scheduled')
    const now = this.now()
    if (!isDue(settings, last ? fromSqlTime(last.created_at) : null, now)) return { ran: false }
    if (now.getTime() - this.lastScheduledFailure < RETRY_AFTER) return { ran: false }
    try {
      const made = await this.backUp('scheduled', null, null)
      this.lastScheduledFailure = 0
      return { ran: true, made }
    } catch (err) {
      this.lastScheduledFailure = now.getTime()
      const message = (err as Error).message
      try {
        this.setSetting(SETTING.lastError, JSON.stringify({ at: now.toISOString(), message }))
      } catch {
        /* the database may be closing */
      }
      return { ran: true, error: message }
    }
  }

  /** A full trial restore of one backup, recorded on it. Changes nothing else. */
  async test(id: unknown, actor: Actor): Promise<BackupTest> {
    const row = this.row(id)
    const key = this.key()
    return this.exclusive('test', async (step) => {
      const result = await testBackup(row.file_path, key, {
        workDir: join(this.deps.dataDir, 'backup-work'), appMigration: this.deps.appMigration, now: this.deps.now,
        onProgress: (p: RestoreProgress) => step(p.stage, p.done, p.total)
      })
      this.db.transaction(() => {
        this.db.prepare('UPDATE backup_registry SET tested_at = ?, test_result = ? WHERE id = ?').run(
          sqlTime(new Date(result.testedAt)), JSON.stringify({ ok: result.ok, summary: result.summary, problems: result.problems }), row.id
        )
        writeAudit(this.db, actor, 'Tested a backup', 'backup_registry', row.id, null, { filename: row.filename, ok: result.ok, summary: result.summary })
      })()
      return result
    })
  }

  /** Prepares a restore (applied at the next start). `key` is the backup's key; `writeKey` when it isn't this PC's. */
  async prepareRestore(path: string, key: string, writeKey: boolean, actor: Actor): Promise<StagedRestore> {
    return this.exclusive('restore', (step) =>
      stageRestore(path, key, {
        dataDir: this.deps.dataDir, docsDir: this.deps.docsDir, appMigration: this.deps.appMigration, writeKey, actor, now: this.deps.now,
        onProgress: (p: RestoreProgress) => step(p.stage, p.done, p.total)
      })
    )
  }

  /** Copies one backup, with its documents, into a folder on another drive. */
  async copyTo(id: unknown, folder: string, actor: Actor): Promise<Copied> {
    const row = this.row(id)
    if (!existsSync(row.file_path)) throw new BackupError('The backup file isn’t there any more, so it can’t be copied.')
    if (!folderWritable(folder)) throw new BackupError('That folder can’t be written to. Check the drive is connected and you can save files there.')
    const key = this.key()
    const fingerprint = row.key_fingerprint ?? fingerprintOf(key)
    const target = storeFolderIn(folder, fingerprint)
    if (target === dirname(row.file_path)) throw new BackupError('That backup is already in that folder.')
    return this.exclusive('copy', async (step) => {
      const copied = await copyBackup(row.file_path, row.format === 2 ? backupKeys(key) : null, target, fingerprint, (d, t) => step('copying', d, t))
      writeAudit(this.db, actor, 'Copied a backup to another folder', 'backup_registry', row.id, null, { filename: row.filename, to: copied.folder, documents_copied: copied.documentsCopied })
      return copied
    })
  }

  /** Deletes one backup: its file, and stored documents no other backup there lists. */
  async remove(id: unknown, actor: Actor): Promise<void> {
    const row = this.row(id)
    if (this.running) throw new BackupError('A backup job is running right now. Try again when it has finished.')
    if (isOurFile(row.file_path)) rmSync(row.file_path, { force: true })
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM backup_registry WHERE id = ?').run(row.id)
      writeAudit(this.db, actor, 'Deleted a backup', 'backup_registry', row.id, { filename: row.filename, created_at: row.created_at, kind: row.kind }, null)
    })()
    const key = this.deps.databaseKey()
    if (key && row.format === 2 && existsSync(dirname(row.file_path))) {
      await this.exclusive('tidy', () => cleanUpStore(dirname(row.file_path), backupKeys(key), this.now().getTime())).catch(() => undefined)
    }
  }

  /** The newest schema change this app knows, for checks elsewhere. */
  get appMigration(): string {
    return this.deps.appMigration
  }
}
