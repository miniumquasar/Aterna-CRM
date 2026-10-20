/**
 * Keeping a backup folder tidy, and copying a backup to another drive.
 *
 *   clean-up   a stored document no backup in the folder lists any more is
 *              removed. If any backup file there can't be read with this key, or
 *              the document was written in the last day (another PC may be
 *              mid-backup to the same folder), nothing is removed.
 *   copying    the backup file and the stored documents it lists go to a folder
 *              on another drive, each copied under a temporary name, compared
 *              byte for byte with the original, then given its real name.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { renameWithRetry } from '../lib/atomic-write'
import { readChunk, type BackupKeys } from './crypto'
import { headerIsGenuine, readBackupHeader, readIndex } from './file'
import { backupFilesIn, blobPath, blobsIn, ensureStore } from './store'

const DAY = 24 * 3_600_000

export interface CleanUp {
  removed: number
  kept: number
  /** Why nothing was removed, when that happened. */
  skipped: string | null
}

/** The stored documents every backup in the folder lists. Throws if a backup can't be read with this key. */
async function referencedBlobs(store: string, keys: BackupKeys): Promise<Set<string>> {
  const referenced = new Set<string>()
  for (const f of backupFilesIn(store)) {
    const path = join(store, f)
    const { header, dataStart } = await readBackupHeader(path)
    if (!headerIsGenuine(keys, header)) throw new Error(`${f} was made with a different key`)
    const index = await readIndex(path, keys, header, dataStart)
    for (const e of index.entries) if (e.blob) referenced.add(e.blob)
  }
  return referenced
}

export async function cleanUpStore(store: string, keys: BackupKeys, now = Date.now()): Promise<CleanUp> {
  let referenced: Set<string>
  try {
    referenced = await referencedBlobs(store, keys)
  } catch (err) {
    return { removed: 0, kept: 0, skipped: `${(err as Error).message}, so no stored documents were removed.` }
  }
  let removed = 0
  for (const name of blobsIn(store)) {
    if (referenced.has(name)) continue
    const p = blobPath(store, name)
    try {
      if (now - statSync(p).mtimeMs < DAY) continue
      rmSync(p, { force: true })
      removed++
    } catch {
      /* already gone */
    }
  }
  return { removed, kept: referenced.size, skipped: null }
}

async function sha256Of(path: string): Promise<string> {
  const fh = await open(path, 'r')
  const hash = createHash('sha256')
  try {
    for (;;) {
      const chunk = await readChunk(fh)
      if (chunk.length === 0) break
      hash.update(chunk)
      if (chunk.length < 1024 * 1024) break
    }
  } finally {
    await fh.close()
  }
  return hash.digest('hex')
}

/** Copies a file under a temporary name, checks the copy matches, then names it. */
async function copyChecked(from: string, to: string): Promise<void> {
  const temp = `${to}.partial`
  mkdirSync(dirname(to), { recursive: true, mode: 0o700 })
  rmSync(temp, { force: true })
  copyFileSync(from, temp)
  try {
    if ((await sha256Of(from)) !== (await sha256Of(temp))) throw new Error('The copy didn’t match the original. The drive may be failing.')
    renameWithRetry(temp, to)
  } catch (err) {
    rmSync(temp, { force: true })
    throw err
  }
}

export interface Copied {
  folder: string
  filename: string
  documentsCopied: number
  documentsAlreadyThere: number
}

/**
 * Copies one backup — the file and the stored documents it lists — into
 * `targetStore` (created if need be).
 */
export async function copyBackup(path: string, keys: BackupKeys | null, targetStore: string, fingerprint: string, onProgress?: (done: number, total: number) => void): Promise<Copied> {
  ensureStore(targetStore, fingerprint)
  const filename = basename(path)
  let blobs: string[] = []
  if (filename.endsWith('.aeterna-backup')) {
    if (!keys) throw new Error('The key is needed to copy this backup.')
    const { header, dataStart } = await readBackupHeader(path)
    if (!headerIsGenuine(keys, header)) throw new Error('This backup was made with a different key.')
    const index = await readIndex(path, keys, header, dataStart)
    blobs = [...new Set(index.entries.map((e) => e.blob).filter((b): b is string => !!b))]
  }
  const source = dirname(path)
  let copied = 0
  let already = 0
  for (let i = 0; i < blobs.length; i++) {
    onProgress?.(i, blobs.length + 1)
    const from = blobPath(source, blobs[i])
    const to = blobPath(targetStore, blobs[i])
    if (existsSync(to) && existsSync(from) && statSync(to).size === statSync(from).size) {
      already++
      continue
    }
    if (!existsSync(from)) continue
    await copyChecked(from, to)
    copied++
  }
  // The backup file last: a folder never holds a backup whose documents aren't all there.
  await copyChecked(path, join(targetStore, filename))
  onProgress?.(blobs.length + 1, blobs.length + 1)
  return { folder: targetStore, filename, documentsCopied: copied, documentsAlreadyThere: already }
}
