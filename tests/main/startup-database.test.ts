import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryLogger } from '@main/app/logger'
import { dataPathsFor, ensureDataFolders, type DataPaths } from '@main/app/paths'
import type { KeyRecovery } from '@main/backup/startup'
import { DatabaseOpenError, openDatabase } from '@main/db/connection'
import { KeyFileError, createDatabaseKey, readDatabaseKey, writeDatabaseKey } from '@main/db/key-file'
import { openPracticeDatabase, type DatabaseStartupDeps } from '@main/startup/database'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function folder(): DataPaths {
  const d = mkdtempSync(join(tmpdir(), 'aeterna-start-'))
  dirs.push(d)
  const p = dataPathsFor(d)
  ensureDataFolders(p)
  return p
}

const digest = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex')

function deps(over: Partial<DatabaseStartupDeps> = {}): DatabaseStartupDeps & { calls: string[]; recoveries: KeyRecovery[] } {
  const calls: string[] = []
  const recoveries: KeyRecovery[] = []
  return {
    calls,
    recoveries,
    applyPendingRestore: () => void calls.push('restore'),
    recoverDatabaseKey: async (ctx) => {
      recoveries.push(ctx)
      return null
    },
    window: { preloadPath: '/p.js', rendererFile: '/index.html', devServerUrl: null },
    log: createMemoryLogger(),
    now: () => new Date('2026-10-20T10:00:00Z'),
    line: (l) => void calls.push(l),
    ...over
  }
}

/** A practice database with one row, closed, and its key. */
function existingPractice(p: DataPaths): string {
  const key = createDatabaseKey(p.keyFile)
  const { db } = openDatabase({ file: p.database, key })
  db.exec('CREATE TABLE kept (x INTEGER); INSERT INTO kept VALUES (7);')
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.close()
  return key
}

describe('start-up step 3: the key and the database', () => {
  it('starts a new installation with a new key, after asking about a staged restore', async () => {
    const p = folder()
    const d = deps({ applyPendingRestore: () => void d.calls.push(`restore (key file there: ${existsSync(p.keyFile)})`) })
    const opened = await openPracticeDatabase(p, d)
    expect(opened.keySource).toBe('created')
    expect(readDatabaseKey(p.keyFile)).toBe(opened.key)
    expect(d.calls[0]).toBe('restore (key file there: false)')
    opened.db.close()
  })

  it('swaps in a staged restore before the key is read', async () => {
    const p = folder()
    const staged = folder()
    const stagedKey = existingPractice(staged)
    const d = deps({
      applyPendingRestore: () => {
        renameSync(staged.database, p.database)
        writeDatabaseKey(p.keyFile, stagedKey)
      }
    })
    const opened = await openPracticeDatabase(p, d)
    expect(opened.keySource).toBe('key_file')
    expect(opened.db.prepare('SELECT x FROM kept').get()).toEqual({ x: 7 })
    opened.db.close()
  })

  it('stops, changing nothing, when the key file is missing and the recovery sheet isn’t used', async () => {
    const p = folder()
    existingPractice(p)
    rmSync(p.keyFile)
    const before = digest(p.database)
    const d = deps()
    await expect(openPracticeDatabase(p, d)).rejects.toThrow(KeyFileError)
    expect(d.recoveries.map((r) => r.problem)).toEqual(['missing_key'])
    expect(d.recoveries[0].message).toMatch(/key file is missing/)
    expect(existsSync(p.keyFile)).toBe(false)
    expect(digest(p.database)).toBe(before)
  })

  it('opens with the key from the recovery sheet when the key file is missing', async () => {
    const p = folder()
    const key = existingPractice(p)
    rmSync(p.keyFile)
    const d = deps({
      recoverDatabaseKey: async (ctx) => {
        writeDatabaseKey(ctx.paths.keyFile, key)
        return key
      }
    })
    const opened = await openPracticeDatabase(p, d)
    expect(opened.keySource).toBe('recovery_sheet')
    expect(opened.db.prepare('SELECT x FROM kept').get()).toEqual({ x: 7 })
    expect(readDatabaseKey(p.keyFile)).toBe(key)
    opened.db.close()
  })

  it('offers the recovery sheet when the key file’s key doesn’t open the database, and never replaces the file', async () => {
    const p = folder()
    const key = existingPractice(p)
    rmSync(p.keyFile)
    createDatabaseKey(p.keyFile) // a different key, e.g. copied from another PC
    const wrongKeyFile = readFileSync(p.keyFile)
    const d = deps({ recoverDatabaseKey: async () => key })
    const opened = await openPracticeDatabase(p, d)
    expect(opened.keySource).toBe('recovery_sheet')
    expect(opened.db.prepare('SELECT x FROM kept').get()).toEqual({ x: 7 })
    expect(readFileSync(p.keyFile).equals(wrongKeyFile)).toBe(true)
    opened.db.close()
  })

  it('stops, changing nothing, when the recovered key is wrong too', async () => {
    const p = folder()
    existingPractice(p)
    rmSync(p.keyFile)
    createDatabaseKey(p.keyFile)
    const before = digest(p.database)
    const d = deps({ recoverDatabaseKey: async () => 'ab'.repeat(32) })
    await expect(openPracticeDatabase(p, d)).rejects.toBeInstanceOf(DatabaseOpenError)
    expect(digest(p.database)).toBe(before)
  })

  it('refuses a recovered key that isn’t a key', async () => {
    const p = folder()
    existingPractice(p)
    rmSync(p.keyFile)
    await expect(openPracticeDatabase(p, deps({ recoverDatabaseKey: async () => 'not a key' }))).rejects.toThrow(/expected form/)
  })
})
