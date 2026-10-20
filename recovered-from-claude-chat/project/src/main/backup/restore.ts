/**
 * Looking inside a backup, testing it, and restoring it.
 *
 *   inspect   what a backup is, from its header alone (no key needed)
 *   test      a full trial restore that changes nothing: the database is copied
 *             out to a working folder, opened with the key and integrity-checked,
 *             its counts compared with the header, and every stored document
 *             decrypted and checked against its fingerprint
 *   stage     the same work, keeping the results in restore-staging/ inside the
 *             data folder: the database (document paths pointed at this PC's
 *             documents folder) and the documents that are missing or different
 *   apply     at the next start, before the database opens: the staged database
 *             takes the live one's place (the live one is kept as a safety copy),
 *             the key file is updated when the backup came with a key typed from
 *             the recovery sheet, the database must open with that key — or both
 *             are put back — and only then do the staged documents move in. A
 *             document already there with different content is kept aside, never
 *             overwritten.
 *
 * Older backups (copies of the database, *.db) restore the database only.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { open } from 'node:fs/promises'
import type { Database } from 'better-sqlite3-multiple-ciphers'
import { openWithKey } from '../db/open-database'
import type { DatabaseKeyStore } from '../db/database-key'
import { writeAudit } from '../access/audit'
import { isInside } from '../records/documents'
import { renameWithRetry } from '../lib/atomic-write'
import { backupKeys, decryptFile, hashFile } from './crypto'
import { backupFileKind, extractDatabase, headerIsGenuine, readBackupHeader, readIndex, type BackupHeader, type BackupIndex, type BackupKind, type IndexEntry } from './file'
import { blobPath, blobsIn } from './store'
import { countsIn, latestMigrationIn } from './create'
import { fingerprintOf } from './keys'

export class RestoreError extends Error {}

type Counts = BackupHeader['counts']

export interface BackupSummary {
  path: string
  filename: string
  /** 2: a backup file with documents; 1: an older backup, a copy of the database only. */
  format: 1 | 2
  createdAt: string | null
  appVersion: string | null
  keyFingerprint: string | null
  kind: BackupKind | null
  counts: Counts | null
  documents: BackupHeader['documents'] | null
  /** Stored documents in the folder beside the backup file. */
  documentsInFolder: number
  /** Made by a version of the app newer than this one, so it can't be restored here. */
  newerThanApp: boolean
  size: number
}

export interface BackupTest {
  ok: boolean
  testedAt: string
  /** One sentence for the screen. */
  summary: string
  problems: string[]
  counts: Counts | null
  documents: { expected: number; checked: number; notInFolder: number; damaged: number; bytes: number }
}

export type RestoreProgress = { stage: 'database' | 'documents'; done: number; total: number }

const isNewer = (migration: string | null | undefined, appMigration: string): boolean => !!migration && migration.localeCompare(appMigration) > 0

async function headerOf(path: string): Promise<{ header: BackupHeader; dataStart: number; fileSize: number }> {
  try {
    return await readBackupHeader(path)
  } catch (err) {
    throw new RestoreError((err as Error).message)
  }
}

export async function inspectBackup(path: string, appMigration: string): Promise<BackupSummary> {
  if (!existsSync(path)) throw new RestoreError('That backup file isn’t there any more.')
  const kind = await backupFileKind(path)
  const size = statSync(path).size
  if (kind === 'database') {
    return {
      path, filename: basename(path), format: 1, createdAt: statSync(path).mtime.toISOString(), appVersion: null, keyFingerprint: null, kind: null,
      counts: null, documents: null, documentsInFolder: 0, newerThanApp: false, size
    }
  }
  if (kind !== 'backup') throw new RestoreError('This isn’t an AETERNA CRM backup file. Choose a file ending in .aeterna-backup.')
  const { header } = await headerOf(path)
  return {
    path, filename: basename(path), format: 2, createdAt: header.createdAt, appVersion: header.appVersion, keyFingerprint: header.keyFingerprint,
    kind: header.kind, counts: header.counts, documents: header.documents, documentsInFolder: blobsIn(dirname(path)).length,
    newerThanApp: isNewer(header.migration, appMigration), size
  }
}

/** Opens a database copy with the key and checks it; returns its counts. */
function checkDatabase(path: string, databaseKey: string, full: boolean): { counts: Counts; migration: string | null; db: Database } {
  let db: Database
  try {
    db = openWithKey(path, databaseKey)
  } catch {
    throw new RestoreError('The database in this backup can’t be opened with this key.')
  }
  try {
    const check = String(db.pragma(full ? 'integrity_check' : 'quick_check', { simple: true }))
    if (check !== 'ok') throw new RestoreError(`The database in this backup failed its integrity check (${check.slice(0, 120)}).`)
    return { counts: countsIn(db), migration: latestMigrationIn(db), db }
  } catch (err) {
    db.close()
    throw err
  }
}

const sameCounts = (a: Counts, b: Counts): boolean => a.clients === b.clients && a.documents === b.documents && a.users === b.users

/** The parts of a relative path from a backup's list, or null if it could leave the documents folder. */
function safeParts(rel: string | null): string[] | null {
  if (typeof rel !== 'string' || !rel || rel.length > 1024) return null
  const parts = rel.split('/')
  if (parts.some((p) => !p || p === '.' || p === '..' || /[\\:\0]/.test(p))) return null
  return parts
}

/** The key's backup material, and a check that the header was made with it. */
function genuineHeader(header: BackupHeader, databaseKey: string): ReturnType<typeof backupKeys> {
  const keys = backupKeys(databaseKey)
  if (!headerIsGenuine(keys, header)) {
    throw new RestoreError(
      fingerprintOf(databaseKey) === header.keyFingerprint
        ? 'The backup file’s header has been changed or damaged, so it isn’t trusted.'
        : `This backup needs the key with fingerprint ${header.keyFingerprint}; the key given has fingerprint ${fingerprintOf(databaseKey)}.`
    )
  }
  return keys
}

/** A trial restore that changes nothing. Never throws: what went wrong is in the result. */
export async function testBackup(
  path: string,
  databaseKey: string,
  opts: { workDir: string; appMigration: string; now?: () => Date; onProgress?: (p: RestoreProgress) => void }
): Promise<BackupTest> {
  const testedAt = (opts.now ?? (() => new Date()))().toISOString()
  const docs = { expected: 0, checked: 0, notInFolder: 0, damaged: 0, bytes: 0 }
  const problems: string[] = []
  let counts: Counts | null = null
  mkdirSync(opts.workDir, { recursive: true, mode: 0o700 })
  const temp = join(opts.workDir, `test-${process.pid}-${Date.now()}.db`)
  const done = (summary: string): BackupTest => ({ ok: problems.length === 0, testedAt, summary, problems, counts, documents: docs })
  try {
    if (!existsSync(path)) {
      problems.push('The backup file isn’t there any more.')
      return done('The backup file is missing.')
    }
    const kind = await backupFileKind(path)
    if (kind === 'database') {
      opts.onProgress?.({ stage: 'database', done: 0, total: 1 })
      copyFileSync(path, temp)
      const checked = checkDatabase(temp, databaseKey, true)
      counts = checked.counts
      checked.db.close()
      return done(`The database opened with the key and passed its integrity check: ${counts.clients} clients. This older backup holds the database only, not documents.`)
    }
    if (kind !== 'backup') {
      problems.push('This isn’t an AETERNA CRM backup file.')
      return done('This isn’t an AETERNA CRM backup file.')
    }
    const { header, dataStart } = await headerOf(path)
    const keys = genuineHeader(header, databaseKey)
    if (isNewer(header.migration, opts.appMigration)) problems.push(`It was made by a newer version of AETERNA CRM (${header.appVersion}); install that version or later to restore it.`)
    opts.onProgress?.({ stage: 'database', done: 0, total: 1 })
    await extractDatabase(path, header, dataStart, temp)
    const checked = checkDatabase(temp, databaseKey, true)
    counts = checked.counts
    checked.db.close()
    if (!sameCounts(counts, header.counts)) problems.push('The database’s counts don’t match what the backup recorded when it was made.')
    opts.onProgress?.({ stage: 'database', done: 1, total: 1 })

    const index = await readIndex(path, keys, header, dataStart)
    const stored = index.entries.filter((e) => e.blob && e.sha256)
    docs.expected = stored.length
    const store = dirname(path)
    for (let i = 0; i < stored.length; i++) {
      opts.onProgress?.({ stage: 'documents', done: i, total: stored.length })
      const e = stored[i]
      const blob = blobPath(store, e.blob as string)
      if (!existsSync(blob)) {
        docs.notInFolder++
        continue
      }
      const r = await decryptFile(keys, 'document', blob, null).catch(() => null)
      if (!r || r.sha256 !== e.sha256) docs.damaged++
      else {
        docs.checked++
        docs.bytes += r.bytes
      }
    }
    opts.onProgress?.({ stage: 'documents', done: stored.length, total: stored.length })
    if (docs.notInFolder) problems.push(`${docs.notInFolder} stored document${docs.notInFolder === 1 ? ' is' : 's are'} missing from the documents folder beside the backup.`)
    if (docs.damaged) problems.push(`${docs.damaged} stored document${docs.damaged === 1 ? ' is' : 's are'} damaged.`)
    const clients = `${counts.clients} client${counts.clients === 1 ? '' : 's'}`
    return done(
      problems.length
        ? `The database restores (${clients}), but: ${problems.join(' ')}`
        : `Everything restores: the database opened with the key and passed its integrity check (${clients}), and all ${docs.checked} stored documents were read back and match.`
    )
  } catch (err) {
    problems.push(err instanceof RestoreError ? err.message : `The test stopped: ${(err as Error).message}`)
    return done(problems[problems.length - 1])
  } finally {
    for (const s of ['', '-wal', '-shm', '-journal']) rmSync(temp + s, { force: true })
  }
}

// ── Staging a restore ──────────────────────────────────────────────────────

export const STAGING = 'restore-staging'
export const restoreMarkerPath = (dataDir: string): string => join(dataDir, 'restore-pending.json')

export interface RestoreMarker {
  version: 2
  /** The prepared database, relative to the data folder. */
  database: string
  /** Prepared documents (relative paths below it mirror the documents folder), relative to the data folder. */
  documents: string | null
  /** The key to put in the key file with the database, when it differs from this PC's. */
  key?: string
  filename: string
  backupCreatedAt: string | null
  requestedBy: string | null
  requestedAt: string
  /** Set while the swap is happening, so an interrupted start can put the database back. */
  safety?: string
}

export interface StagedRestore {
  filename: string
  createdAt: string | null
  counts: Counts
  documents: { toRestore: number; unchanged: number; notInFolder: number; damaged: number; outside: number }
}

/**
 * Prepares a restore in the data folder. Nothing live changes until the next
 * start applies it. Throws RestoreError with a plain message if the backup
 * can't be restored with this key.
 */
export async function stageRestore(
  path: string,
  databaseKey: string,
  opts: {
    dataDir: string
    docsDir: string
    appMigration: string
    /** Write this key into the key file with the database (the backup's key differs from this PC's). */
    writeKey: boolean
    actor: { id: number; name: string } | null
    now?: () => Date
    onProgress?: (p: RestoreProgress) => void
  }
): Promise<StagedRestore> {
  const now = (opts.now ?? (() => new Date()))()
  if (!existsSync(path)) throw new RestoreError('That backup file isn’t there any more.')
  const kind = await backupFileKind(path)
  if (kind === 'unknown') throw new RestoreError('This isn’t an AETERNA CRM backup file. Choose a file ending in .aeterna-backup.')
  const staging = join(opts.dataDir, STAGING)
  rmSync(staging, { recursive: true, force: true })
  rmSync(restoreMarkerPath(opts.dataDir), { force: true })
  mkdirSync(staging, { recursive: true, mode: 0o700 })
  const stagedDb = join(staging, 'aeterna.db')
  const stagedDocs = join(staging, 'documents')
  const docs = { toRestore: 0, unchanged: 0, notInFolder: 0, damaged: 0, outside: 0 }
  let header: BackupHeader | null = null
  let index: BackupIndex | null = null
  try {
    opts.onProgress?.({ stage: 'database', done: 0, total: 1 })
    if (kind === 'backup') {
      const read = await headerOf(path)
      header = read.header
      const keys = genuineHeader(header, databaseKey)
      if (isNewer(header.migration, opts.appMigration)) {
        throw new RestoreError(`This backup was made by a newer version of AETERNA CRM (${header.appVersion}). Install that version or later, then restore it.`)
      }
      await extractDatabase(path, header, read.dataStart, stagedDb)
      index = await readIndex(path, keys, header, read.dataStart)

      const store = dirname(path)
      const stored = index.entries.filter((e) => e.blob && e.sha256)
      for (let i = 0; i < stored.length; i++) {
        opts.onProgress?.({ stage: 'documents', done: i, total: stored.length })
        const e = stored[i]
        const parts = safeParts(e.rel)
        const target = parts ? join(opts.docsDir, ...parts) : null
        if (!parts || !target || !isInside(opts.docsDir, target)) {
          docs.outside++
          continue
        }
        if (existsSync(target) && statSync(target).size === e.size && (await hashFile(target)).sha256 === e.sha256) {
          docs.unchanged++
          continue
        }
        const blob = blobPath(store, e.blob as string)
        if (!existsSync(blob)) {
          docs.notInFolder++
          continue
        }
        const out = join(stagedDocs, ...parts)
        mkdirSync(dirname(out), { recursive: true, mode: 0o700 })
        const fh = await open(out, 'w', 0o600)
        let r: { sha256: string } | null = null
        try {
          r = await decryptFile(keys, 'document', blob, async (plain) => {
            await fh.write(plain)
          }).catch(() => null)
          await fh.sync()
        } finally {
          await fh.close()
        }
        if (!r || r.sha256 !== e.sha256) {
          rmSync(out, { force: true })
          docs.damaged++
        } else docs.toRestore++
      }
      opts.onProgress?.({ stage: 'documents', done: stored.length, total: stored.length })
    } else {
      copyFileSync(path, stagedDb)
    }

    const checked = checkDatabase(stagedDb, databaseKey, true)
    const db = checked.db
    try {
      if (header && !sameCounts(checked.counts, header.counts)) throw new RestoreError('The database’s counts don’t match what the backup recorded when it was made, so it isn’t trusted.')
      db.transaction(() => {
        // Point every document the backup listed at this PC's documents folder.
        if (index) {
          const point = db.prepare('UPDATE documents SET file_path = ? WHERE id = ?')
          for (const e of index.entries as IndexEntry[]) {
            const parts = safeParts(e.rel)
            if (parts) point.run(join(opts.docsDir, ...parts), e.id)
          }
        }
        writeAudit(db, opts.actor, 'Restored from a backup', 'backup_registry', null, null, {
            filename: basename(path), backup_made: header?.createdAt ?? null, on: now.toISOString(),
            documents_restored: docs.toRestore, documents_unchanged: docs.unchanged, documents_not_found: docs.notInFolder, documents_damaged: docs.damaged
          })
      })()
      db.pragma('wal_checkpoint(TRUNCATE)')
    } finally {
      db.close()
    }
    for (const s of ['-wal', '-shm']) rmSync(stagedDb + s, { force: true })

    const marker: RestoreMarker = {
      version: 2,
      database: relative(opts.dataDir, stagedDb),
      documents: docs.toRestore ? relative(opts.dataDir, stagedDocs) : null,
      key: opts.writeKey ? databaseKey : undefined,
      filename: basename(path),
      backupCreatedAt: header?.createdAt ?? null,
      requestedBy: opts.actor?.name ?? null,
      requestedAt: now.toISOString()
    }
    writeMarker(opts.dataDir, marker)
    return { filename: basename(path), createdAt: header?.createdAt ?? null, counts: checked.counts, documents: docs }
  } catch (err) {
    rmSync(staging, { recursive: true, force: true })
    rmSync(restoreMarkerPath(opts.dataDir), { force: true })
    if (err instanceof RestoreError) throw err
    throw new RestoreError(`The backup couldn’t be prepared for restoring: ${(err as Error).message}`)
  }
}

function writeMarker(dataDir: string, marker: RestoreMarker): void {
  const target = restoreMarkerPath(dataDir)
  const temp = `${target}.tmp`
  writeFileSync(temp, JSON.stringify(marker), { mode: 0o600 })
  renameWithRetry(temp, target)
}

/** Cancels a restore that was prepared but not yet applied. */
export function cancelStagedRestore(dataDir: string): void {
  rmSync(restoreMarkerPath(dataDir), { force: true })
  rmSync(join(dataDir, STAGING), { recursive: true, force: true })
}

// ── Applying it at the next start ──────────────────────────────────────────

export interface RestoreOutcome {
  restored: boolean
  notice: string | null
  /** For the screens: the backup restored, when one was. */
  from?: { filename: string; createdAt: string | null; documents: number; keptAside: string | null }
}

const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)

function move(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true })
  try {
    renameSync(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    copyFileSync(from, to)
    rmSync(from, { force: true })
  }
}

function filesUnder(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const n of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, n.name)
      if (n.isDirectory()) walk(p)
      else if (n.isFile()) out.push(p)
    }
  }
  if (existsSync(root)) walk(root)
  return out
}

const longDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'an earlier date'

/**
 * Called at start-up before the database opens. `opens` must try the database
 * at `dbPath` with whatever key the key file now holds.
 */
export function applyPendingRestore(
  dataDir: string,
  dbPath: string,
  docsDir: string,
  keyStore: DatabaseKeyStore,
  opens: (path: string) => boolean,
  now: Date = new Date()
): RestoreOutcome {
  const markerPath = restoreMarkerPath(dataDir)
  if (!existsSync(markerPath)) return { restored: false, notice: null }
  let raw: Partial<RestoreMarker> & { backupPath?: string }
  try {
    raw = JSON.parse(readFileSync(markerPath, 'utf8'))
  } catch {
    cancelStagedRestore(dataDir)
    return { restored: false, notice: 'A restore was requested, but the request was unreadable, so nothing changed.' }
  }
  const sidecars = ['-wal', '-shm']
  const putBack = (from: string): void => {
    renameWithRetry(from, dbPath)
    for (const s of sidecars) if (existsSync(from + s)) renameWithRetry(from + s, dbPath + s)
  }

  // Requests from earlier versions name a backup database to copy in.
  let staged: string
  if (raw.version === 2 && typeof raw.database === 'string') staged = join(dataDir, raw.database)
  else if (typeof raw.backupPath === 'string' && existsSync(raw.backupPath)) {
    staged = join(dataDir, STAGING, 'aeterna.db')
    mkdirSync(dirname(staged), { recursive: true })
    copyFileSync(raw.backupPath, staged)
  } else {
    cancelStagedRestore(dataDir)
    return { restored: false, notice: 'The backup chosen for restoring was missing, so nothing changed.' }
  }
  const filename = String(raw.filename ?? basename(raw.backupPath ?? staged))

  // An earlier start stopped part-way through the swap.
  const earlierSafety = raw.safety ? join(dataDir, raw.safety) : null
  let resumed = false
  if (earlierSafety && existsSync(earlierSafety) && isInside(dataDir, earlierSafety)) {
    if (!existsSync(dbPath)) putBack(earlierSafety) // it stopped before the restored database was in: start again
    else if (!existsSync(staged)) resumed = true // it stopped after: the restored database is in place
  }

  let safetyName: string
  let hadDb: boolean
  if (resumed && earlierSafety) {
    safetyName = basename(earlierSafety)
    hadDb = true
    if (!opens(dbPath)) {
      renameWithRetry(dbPath, join(dirname(dbPath), `${basename(dbPath, '.db')}.restore-failed-${stamp(now)}.db`))
      putBack(earlierSafety)
      cancelStagedRestore(dataDir)
      return { restored: false, notice: 'The restore didn’t work (the restored database would not open with its key). The database is as it was.' }
    }
  } else {
    if (!existsSync(staged) || !isInside(dataDir, staged)) {
      cancelStagedRestore(dataDir)
      return { restored: false, notice: 'The backup prepared for restoring was missing, so nothing changed.' }
    }
    safetyName = `${basename(dbPath, '.db')}.before-restore-${stamp(now)}.db`
    const safety = join(dirname(dbPath), safetyName)
    writeMarker(dataDir, { ...(raw as RestoreMarker), version: 2, database: relative(dataDir, staged), safety: relative(dataDir, safety) })
    const previousKey = keyStore.read()
    hadDb = existsSync(dbPath)
    try {
      if (hadDb) {
        renameWithRetry(dbPath, safety)
        for (const s of sidecars) if (existsSync(dbPath + s)) renameWithRetry(dbPath + s, safety + s)
      }
      if (typeof raw.key === 'string' && raw.key) keyStore.write({ key: raw.key, origin: 'generated' })
      renameWithRetry(staged, dbPath)
      if (!opens(dbPath)) throw new Error('the restored database would not open with its key')
    } catch (err) {
      // Put everything back as it was.
      if (existsSync(dbPath)) renameWithRetry(dbPath, join(dirname(dbPath), `${basename(dbPath, '.db')}.restore-failed-${stamp(now)}.db`))
      if (hadDb && existsSync(safety)) putBack(safety)
      if (typeof raw.key === 'string' && raw.key && previousKey) keyStore.write(previousKey)
      cancelStagedRestore(dataDir)
      return { restored: false, notice: `The restore didn’t work (${(err as Error).message}). The database is as it was.` }
    }
  }

  // The database is in and opens: now the documents. One that can't be put in place is kept, never lost.
  let documents = 0
  let notPlaced = 0
  let keptAside: string | null = null
  let leftIn: string | null = null
  const stagedDocs = raw.version === 2 && raw.documents ? join(dataDir, raw.documents) : null
  if (stagedDocs && isInside(dataDir, stagedDocs)) {
    const keepDir = join(dataDir, `kept-before-restore-${stamp(now)}`)
    for (const file of filesUnder(stagedDocs)) {
      const rel = relative(stagedDocs, file)
      const target = join(docsDir, rel)
      if (!isInside(docsDir, target)) continue
      try {
        if (existsSync(target)) {
          move(target, join(keepDir, rel))
          keptAside = keepDir
        }
        move(file, target)
        documents++
      } catch {
        notPlaced++
      }
    }
    if (notPlaced) {
      leftIn = join(dataDir, `restored-documents-not-placed-${stamp(now)}`)
      try {
        renameWithRetry(stagedDocs, leftIn)
      } catch {
        leftIn = stagedDocs
      }
    }
  }
  rmSync(markerPath, { force: true })
  if (!leftIn || leftIn !== stagedDocs) rmSync(join(dataDir, STAGING), { recursive: true, force: true })
  const parts = [`Restored from the backup made ${longDate(raw.backupCreatedAt ?? null)} (${filename}).`]
  if (hadDb) parts.push(`The database as it was is kept as ${safetyName}.`)
  if (documents) parts.push(`${documents} document${documents === 1 ? ' was' : 's were'} put back.`)
  if (keptAside) parts.push(`Documents that had changed since were kept in ${basename(keptAside)}.`)
  if (notPlaced && leftIn) parts.push(`${notPlaced} document${notPlaced === 1 ? '' : 's'} couldn’t be put in place and ${notPlaced === 1 ? 'is' : 'are'} in ${basename(leftIn)} in the data folder.`)
  return { restored: true, notice: parts.join(' '), from: { filename, createdAt: raw.backupCreatedAt ?? null, documents, keptAside } }
}
