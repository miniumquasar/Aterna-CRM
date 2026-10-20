/**
 * Making a backup.
 *
 *   1. Everything written so far goes into the database file (a WAL checkpoint),
 *      which is then copied in one step: nothing can be written between the two,
 *      so the copy is complete and consistent.
 *   2. The copy is opened with the key and checked before anything else happens.
 *   3. Each stored document the copy lists is encrypted into the backup folder —
 *      only if that folder doesn't already hold it, so an unchanged document is
 *      kept once however many backups there are. Each one written is read back
 *      and checked.
 *   4. The backup file (header, database, list of documents) is written beside
 *      them under a temporary name, read back and checked, and only then given
 *      its real name and recorded.
 *
 * A backup that stops part-way leaves only ".partial" files, removed next time.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import type { Database } from 'better-sqlite3-multiple-ciphers'
import { openWithKey } from '../db/open-database'
import { writeAudit } from '../access/audit'
import { isInside } from '../records/documents'
import { renameWithRetry } from '../lib/atomic-write'
import { backupKeys, blobName, decryptFile, encryptFile, hashFile, type BackupKeys } from './crypto'
import { headerIsGenuine, readBackupHeader, sealIndex, writeBackupFile, type BackupHeader, type BackupIndex, type BackupKind, type IndexEntry } from './file'
import { blobPath, ensureStore, newBackupName, removeLeftovers } from './store'
import { fingerprintOf } from './keys'

export class BackupError extends Error {}

export interface BackupSource {
  /** The live practice database. */
  db: Database
  dbPath: string
  /** The app's documents folder. */
  docsDir: string
  /** A working folder on the same disk as the database, for the moment's copy. */
  workDir: string
  /** The key the database is open with. */
  databaseKey: string
  appVersion: string
  now?: () => Date
}

export type BackupStage = 'database' | 'documents' | 'writing' | 'checking' | 'tidying'
export interface BackupProgress {
  stage: BackupStage
  done: number
  total: number
}

export interface BackupMade {
  id: number
  filename: string
  path: string
  store: string
  header: BackupHeader
  /** Documents put in the backup folder for the first time by this backup. */
  newDocuments: number
  file_size: number
}

const hasTable = (db: Database, table: string): boolean =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)

export function countsIn(db: Database): BackupHeader['counts'] {
  const count = (t: string): number => (hasTable(db, t) ? (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n : 0)
  return { clients: count('clients'), documents: count('documents'), users: count('users') }
}

export function latestMigrationIn(db: Database): string | null {
  if (!hasTable(db, 'schema_migrations')) return null
  return (db.prepare('SELECT id FROM schema_migrations ORDER BY id DESC LIMIT 1').get() as { id: string } | undefined)?.id ?? null
}

/** "2026-10-12 18:15:00" — the form SQLite's datetime('now') gives. */
export const sqlTime = (d: Date): string => d.toISOString().replace('T', ' ').slice(0, 19)

interface CachedHash {
  size: number
  mtime_ms: number
  ctime_ms: number
  sha256: string
}

/**
 * Puts one document into the folder (unless it is there already) and says how
 * the backup's list should describe it.
 */
async function storeDocument(
  keys: BackupKeys,
  store: string,
  docsDir: string,
  doc: { id: number; file_path: string | null },
  cache: Map<string, CachedHash>,
  fresh: Map<string, CachedHash>
): Promise<{ entry: IndexEntry; added: boolean }> {
  const path = String(doc.file_path ?? '')
  if (!path || !isInside(docsDir, path)) return { entry: { id: doc.id, rel: null, missing: 'outside' }, added: false }
  const rel = relative(docsDir, path).split(sep).join('/')
  let st: ReturnType<typeof statSync>
  try {
    st = statSync(path)
    if (!st.isFile()) return { entry: { id: doc.id, rel, missing: 'not-found' }, added: false }
  } catch {
    return { entry: { id: doc.id, rel, missing: 'not-found' }, added: false }
  }

  let sha: string
  const known = cache.get(path)
  try {
    if (known && known.size === st.size && known.mtime_ms === st.mtimeMs && known.ctime_ms === st.ctimeMs) sha = known.sha256
    else {
      sha = (await hashFile(path)).sha256
      fresh.set(path, { size: st.size, mtime_ms: st.mtimeMs, ctime_ms: st.ctimeMs, sha256: sha })
    }
  } catch {
    return { entry: { id: doc.id, rel, missing: 'unreadable' }, added: false }
  }

  let name = blobName(keys, sha)
  if (existsSync(blobPath(store, name))) return { entry: { id: doc.id, rel, size: st.size, sha256: sha, blob: name }, added: false }

  const partial = `${blobPath(store, name)}.partial`
  mkdirSync(join(partial, '..'), { recursive: true, mode: 0o700 })
  rmSync(partial, { force: true })
  let written: { sha256: string; bytes: number }
  try {
    written = await encryptFile(keys, 'document', path, partial)
  } catch (err) {
    rmSync(partial, { force: true })
    // The document itself can't be read (locked, removed this moment): listed, and the backup goes on.
    const readable = await hashFile(path).then(() => true, () => false)
    if (!readable) return { entry: { id: doc.id, rel, missing: 'unreadable' }, added: false }
    // Otherwise the backup folder is the problem (full, read-only, unplugged): no backup is better than a partial one.
    const code = (err as NodeJS.ErrnoException).code
    throw new BackupError(
      code === 'ENOSPC'
        ? 'The backup folder’s drive is full, so no backup was made. Free some space or choose another folder.'
        : `The backup folder couldn’t be written to (${code ?? (err as Error).message}), so no backup was made.`
    )
  }
  if (written.sha256 !== sha) {
    // The file changed between being fingerprinted and being copied: what was copied is what counts.
    sha = written.sha256
    name = blobName(keys, sha)
    fresh.delete(path)
    if (existsSync(blobPath(store, name))) {
      rmSync(partial, { force: true })
      return { entry: { id: doc.id, rel, size: written.bytes, sha256: sha, blob: name }, added: false }
    }
  }
  // Read back what was written: a failing drive is found now, not on the day of a restore.
  const check = await decryptFile(keys, 'document', partial, null).catch(() => null)
  if (!check || check.sha256 !== sha) {
    rmSync(partial, { force: true })
    throw new BackupError('A document didn’t read back correctly from the backup folder. The drive may be failing; try another folder.')
  }
  const target = blobPath(store, name)
  mkdirSync(join(target, '..'), { recursive: true, mode: 0o700 })
  renameWithRetry(partial, target)
  return { entry: { id: doc.id, rel, size: written.bytes, sha256: sha, blob: name }, added: true }
}

/** Re-reads a written backup file: header genuine, both parts' checksums right. */
export async function checkWrittenBackup(path: string, keys: BackupKeys): Promise<BackupHeader> {
  const { header, dataStart } = await readBackupHeader(path)
  if (!headerIsGenuine(keys, header)) throw new BackupError('The backup file didn’t read back correctly.')
  const fh = await open(path, 'r')
  try {
    const parts: Array<[number, number, string]> = [
      [dataStart, header.database.bytes, header.database.sha256],
      [dataStart + header.database.bytes, header.index.bytes, header.index.sha256]
    ]
    for (const [start, length, expected] of parts) {
      const hash = createHash('sha256')
      for (let pos = start; pos < start + length; ) {
        const want = Math.min(1024 * 1024, start + length - pos)
        const { bytesRead, buffer } = await fh.read(Buffer.allocUnsafe(want), 0, want, pos)
        if (bytesRead === 0) break
        hash.update(buffer.subarray(0, bytesRead))
        pos += bytesRead
      }
      if (hash.digest('hex') !== expected) throw new BackupError('The backup file didn’t read back correctly. The drive may be failing; try another folder.')
    }
  } finally {
    await fh.close()
  }
  return header
}

export async function makeBackup(
  src: BackupSource,
  store: string,
  opts: { kind: BackupKind; actor: { id: number; name: string } | null; notes: string | null; onProgress?: (p: BackupProgress) => void }
): Promise<BackupMade> {
  const now = (src.now ?? (() => new Date()))()
  const progress = (stage: BackupStage, done: number, total: number): void => opts.onProgress?.({ stage, done, total })
  const keys = backupKeys(src.databaseKey)
  const fingerprint = fingerprintOf(src.databaseKey)
  const snapshot = join(src.workDir, `snapshot-${process.pid}-${now.getTime()}.db`)
  try {
    ensureStore(store, fingerprint)
    removeLeftovers(store)
    mkdirSync(src.workDir, { recursive: true, mode: 0o700 })
  } catch (err) {
    throw plainError(err)
  }
  progress('database', 0, 1)
  let partial: string | null = null
  try {
    // Checkpoint and copy back to back, with nothing in between: the copy is the database as of now.
    src.db.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(src.dbPath, snapshot)
    let docs: Array<{ id: number; file_path: string | null }>
    let counts: BackupHeader['counts']
    let migration: string | null
    const copy = openWithKey(snapshot, src.databaseKey)
    try {
      const check = String(copy.pragma('quick_check', { simple: true }))
      if (check !== 'ok') throw new BackupError(`The database failed its check (${check.slice(0, 120)}), so no backup was made. Restore the latest good backup, or contact support.`)
      counts = countsIn(copy)
      migration = latestMigrationIn(copy)
      docs = hasTable(copy, 'documents') ? (copy.prepare('SELECT id, file_path FROM documents ORDER BY id').all() as typeof docs) : []
    } finally {
      copy.close()
    }
    progress('database', 1, 1)

    const cache = new Map<string, CachedHash>()
    if (hasTable(src.db, 'backup_hashes')) {
      for (const r of src.db.prepare('SELECT path, size, mtime_ms, ctime_ms, sha256 FROM backup_hashes').all() as Array<CachedHash & { path: string }>) cache.set(r.path, r)
    }
    const fresh = new Map<string, CachedHash>()
    const entries: IndexEntry[] = []
    let newDocuments = 0
    for (let i = 0; i < docs.length; i++) {
      progress('documents', i, docs.length)
      const { entry, added } = await storeDocument(keys, store, src.docsDir, docs[i], cache, fresh)
      entries.push(entry)
      if (added) newDocuments++
    }
    progress('documents', docs.length, docs.length)
    const stored = entries.filter((e) => e.blob)
    const index: BackupIndex = { version: 1, documentsRoot: src.docsDir, entries }

    progress('writing', 0, 1)
    const filename = newBackupName(store, now)
    partial = join(store, `${filename}.partial`)
    await writeBackupFile(partial, keys, {
      createdAt: now.toISOString(),
      appVersion: src.appVersion,
      migration,
      keyFingerprint: fingerprint,
      kind: opts.kind,
      counts,
      documents: { stored: stored.length, bytes: stored.reduce((n, e) => n + (e.size ?? 0), 0), missing: entries.length - stored.length }
    }, snapshot, sealIndex(keys, index))
    progress('checking', 0, 1)
    const header = await checkWrittenBackup(partial, keys)
    const path = join(store, filename)
    renameWithRetry(partial, path)
    partial = null
    const size = statSync(path).size

    const id = src.db.transaction(() => {
      if (fresh.size && hasTable(src.db, 'backup_hashes')) {
        const put = src.db.prepare('INSERT OR REPLACE INTO backup_hashes (path, size, mtime_ms, ctime_ms, sha256) VALUES (?, ?, ?, ?, ?)')
        for (const [p, h] of fresh) put.run(p, h.size, h.mtime_ms, h.ctime_ms, h.sha256)
      }
      const rowId = Number(
        src.db.prepare(`INSERT INTO backup_registry (filename, file_path, file_size, created_by, notes, created_at, kind, format, key_fingerprint,
            clients, documents, documents_bytes, documents_missing) VALUES (?, ?, ?, ?, ?, ?, ?, 2, ?, ?, ?, ?, ?)`).run(
          filename, path, size, opts.actor?.name ?? 'system', opts.notes, sqlTime(now), opts.kind, fingerprint,
          counts.clients, header.documents.stored, header.documents.bytes, header.documents.missing
        ).lastInsertRowid
      )
      writeAudit(src.db, opts.actor,
        opts.kind === 'scheduled' ? 'Made a scheduled backup' : 'Made a backup', 'backup_registry', rowId, null, {
          filename, folder: store, clients: counts.clients, documents: header.documents.stored, documents_missing: header.documents.missing,
          new_documents: newDocuments, notes: opts.notes ?? undefined
        })
      return rowId
    })()
    return { id, filename, path, store, header, newDocuments, file_size: size }
  } catch (err) {
    throw plainError(err)
  } finally {
    if (partial) rmSync(partial, { force: true })
    for (const s of ['', '-wal', '-shm', '-journal']) rmSync(snapshot + s, { force: true })
  }
}

/** Why a backup failed, in words for the screen and the notification. */
function plainError(err: unknown): BackupError {
  if (err instanceof BackupError) return err
  const code = (err as NodeJS.ErrnoException)?.code
  if (code === 'ENOSPC') return new BackupError('The backup folder’s drive is full, so no backup was made. Free some space or choose another folder.')
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') return new BackupError('The backup folder can’t be written to, so no backup was made. Check you can save files there, or choose another folder.')
  if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EIO') return new BackupError('The backup folder isn’t available (the drive may have been unplugged), so no backup was made.')
  return new BackupError(`No backup was made: ${(err as Error)?.message ?? 'unknown error'}`)
}
