/**
 * A backup folder.
 *
 *   README.txt                                       what the folder is and how to restore
 *   AETERNA-CRM-backup-20261012-181500.aeterna-backup one file per backup
 *   documents/3f/3f9a…                                each stored document, encrypted, kept once
 *                                                     and shared by every backup in the folder
 *
 * Keep the folder together: a backup file finds its documents beside it. A
 * folder somewhere other than the app's own (an external drive, a NAS) gets a
 * subfolder named after the key's fingerprint, so two PCs backing up to the
 * same place never mix their files.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BACKUP_EXTENSION } from './file'

export const DOCUMENTS = 'documents'
export const README = 'README.txt'
const BACKUP_NAME = new RegExp(`^AETERNA-CRM-backup-\\d{8}-\\d{6}(?:-\\d+)?\\.${BACKUP_EXTENSION}$`)
const BLOB_NAME = /^[0-9a-f]{64}$/
const PARTIAL = /\.partial$/

/** The folder backups go in, inside a folder the person chose. */
export const storeFolderIn = (chosen: string, fingerprint: string): string => join(chosen, `AETERNA CRM backups ${fingerprint}`)

export const blobPath = (store: string, name: string): string => join(store, DOCUMENTS, name.slice(0, 2), name)

export const isBackupFileName = (name: string): boolean => BACKUP_NAME.test(name)

const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)

/** A new backup file name in the folder, never one already there. */
export function newBackupName(store: string, now: Date): string {
  const base = `AETERNA-CRM-backup-${stamp(now)}`
  let name = `${base}.${BACKUP_EXTENSION}`
  for (let i = 2; existsSync(join(store, name)) || existsSync(join(store, `${name}.partial`)); i++) name = `${base}-${i}.${BACKUP_EXTENSION}`
  return name
}

export function readme(fingerprint: string): string {
  return [
    'AETERNA CRM backups',
    '===================',
    '',
    `These backups need the encryption key with the fingerprint ${fingerprint}.`,
    'The key is on the recovery sheet a partner printed or saved from the app.',
    '',
    'Keep this folder together. Each .aeterna-backup file holds the practice',
    'database and the list of stored documents; the documents themselves are in',
    'the "documents" folder beside them, each kept once and shared by every backup.',
    'Copy the whole folder, never a backup file on its own.',
    '',
    'Everything here is encrypted. Without the key it can’t be read.',
    '',
    'To restore on a new computer:',
    '  1. Install AETERNA CRM and start it.',
    '  2. Choose "Restore from a backup", then the newest .aeterna-backup file here.',
    '  3. Type the key from the recovery sheet. Check the fingerprint matches.',
    '  4. Sign in with your usual username and password, then enter the licence key',
    '     again on the Licence screen.',
    '',
    'Stored logins also need the vault passphrase, which is never in a backup.',
    ''
  ].join('\r\n')
}

/** Creates the folder, its documents folder and its README. */
export function ensureStore(store: string, fingerprint: string): void {
  mkdirSync(join(store, DOCUMENTS), { recursive: true, mode: 0o700 })
  const notes = join(store, README)
  if (!existsSync(notes)) writeFileSync(notes, readme(fingerprint), { mode: 0o644 })
}

/** Backup files in the folder, oldest first by name. */
export function backupFilesIn(store: string): string[] {
  try {
    return readdirSync(store).filter(isBackupFileName).sort()
  } catch {
    return []
  }
}

/** Every stored document's name in the folder. */
export function blobsIn(store: string): string[] {
  const root = join(store, DOCUMENTS)
  const names: string[] = []
  let shards: string[]
  try {
    shards = readdirSync(root)
  } catch {
    return names
  }
  for (const shard of shards) {
    if (!/^[0-9a-f]{2}$/.test(shard)) continue
    try {
      for (const f of readdirSync(join(root, shard))) if (BLOB_NAME.test(f) && f.startsWith(shard)) names.push(f)
    } catch {
      /* not a folder */
    }
  }
  return names
}

/**
 * Removes files left by a backup that stopped part-way: only ever the ".partial"
 * files this app writes, and only old ones, in case another PC is writing to the
 * same folder right now.
 */
export function removeLeftovers(store: string, olderThanMs = 6 * 3_600_000, now = Date.now()): number {
  let removed = 0
  const sweep = (dir: string): void => {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const n of names) {
      const p = join(dir, n)
      if (PARTIAL.test(n)) {
        try {
          if (now - statSync(p).mtimeMs < olderThanMs) continue
        } catch {
          continue
        }
        rmSync(p, { force: true })
        removed++
      } else if (dir === join(store, DOCUMENTS) && /^[0-9a-f]{2}$/.test(n)) sweep(p)
    }
  }
  sweep(store)
  sweep(join(store, DOCUMENTS))
  return removed
}

/** Total size of the folder's stored documents. */
export function documentsBytes(store: string): number {
  let total = 0
  for (const b of blobsIn(store)) total += safeSize(blobPath(store, b))
  return total
}

function safeSize(p: string): number {
  try {
    return statSync(p).size
  } catch {
    return 0
  }
}

/** Whether a folder can be written to now (an external drive may be unplugged). */
export function folderWritable(dir: string): boolean {
  try {
    if (!existsSync(dir)) return false
    const probe = join(dir, `.aeterna-write-test-${process.pid}-${Date.now()}`)
    writeFileSync(probe, 'ok')
    rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}
