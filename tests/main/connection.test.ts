import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { DatabaseOpenError, openDatabase } from '@main/db/connection'

const KEY = '1f'.repeat(32)
const OTHER = '2e'.repeat(32)
const dirs: string[] = []
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'aeterna-db-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const digest = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex')

function makeDatabase(file: string, key: string): void {
  const opened = openDatabase({ file, key })
  opened.db.exec('CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (42);')
  opened.db.pragma('wal_checkpoint(TRUNCATE)')
  opened.db.close()
}

describe('opening the practice database', () => {
  it('creates an encrypted database with the connection settings', () => {
    const file = join(tempDir(), 'aeterna.db')
    const opened = openDatabase({ file, key: KEY })
    expect(opened.created).toBe(true)
    expect(opened.db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(opened.db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(opened.db.pragma('busy_timeout', { simple: true })).toBe(5000)
    opened.db.exec('CREATE TABLE t (x)')
    opened.db.close()
    // Without the key the file is unreadable: it isn't a plain SQLite file.
    expect(readFileSync(file).subarray(0, 16).toString('latin1')).not.toBe('SQLite format 3\u0000')
    const reopened = openDatabase({ file, key: KEY })
    expect(reopened.created).toBe(false)
    reopened.db.close()
  })

  it('leaves a database with the wrong key byte-for-byte untouched, with no side files', () => {
    const dir = tempDir()
    const file = join(dir, 'aeterna.db')
    makeDatabase(file, KEY)
    const before = digest(file)
    const filesBefore = readdirSync(dir).sort()
    expect(() => openDatabase({ file, key: OTHER })).toThrow(DatabaseOpenError)
    expect(() => openDatabase({ file, key: OTHER })).toThrow(/has not been changed/)
    expect(digest(file)).toBe(before)
    expect(readdirSync(dir).sort()).toEqual(filesBefore)
    // …and it still opens with the right key.
    const ok = openDatabase({ file, key: KEY })
    expect(ok.db.prepare('SELECT x FROM t').get()).toEqual({ x: 42 })
    ok.db.close()
  })

  it('never replaces a file that isn’t a database', () => {
    const dir = tempDir()
    const file = join(dir, 'aeterna.db')
    writeFileSync(file, 'this is not a database, but it is someone’s file')
    const before = digest(file)
    expect(() => openDatabase({ file, key: KEY })).toThrow(DatabaseOpenError)
    expect(digest(file)).toBe(before)
    expect(readdirSync(dir)).toEqual(['aeterna.db'])
  })

  it('sets a damaged database aside with its side files and starts a new one', () => {
    const dir = tempDir()
    const file = join(dir, 'aeterna.db')
    makeDatabase(file, KEY)
    writeFileSync(`${file}-wal`, '')
    const opened = openDatabase({ file, key: KEY, quickCheck: () => '*** in database main *** Page 3: btree damaged', now: () => new Date('2026-10-20T10:00:00Z') })
    expect(opened.setAsideAt).toBe(`${file}.damaged-2026-10-20T10-00-00-000Z`)
    expect(existsSync(opened.setAsideAt as string)).toBe(true)
    expect(existsSync(`${opened.setAsideAt}-wal`)).toBe(true)
    expect(opened.notices[0]).toMatch(/set aside/)
    expect(opened.created).toBe(true)
    expect(opened.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 't'").get()).toEqual({ n: 0 })
    opened.db.close()
    // The set-aside copy still holds the data, under the same key.
    const old = new Database(opened.setAsideAt as string, { readonly: true })
    old.pragma("cipher = 'sqlcipher'")
    old.pragma('legacy = 4')
    old.pragma(`key = "x'${KEY}'"`)
    expect(old.prepare('SELECT x FROM t').get()).toEqual({ x: 42 })
    old.close()
  })

  it('opens a database left mid-write by a crash, keeping what the WAL holds', () => {
    const dir = tempDir()
    const live = join(dir, 'live.db')
    const opened = openDatabase({ file: live, key: KEY })
    opened.db.pragma('wal_autocheckpoint = 0')
    opened.db.exec('CREATE TABLE t (x INTEGER)')
    const insert = opened.db.prepare('INSERT INTO t VALUES (?)')
    for (let i = 0; i < 50; i++) insert.run(i)
    // Copy the files while the connection is still open, as a crash would leave them.
    const crashed = join(dir, 'aeterna.db')
    copyFileSync(live, crashed)
    copyFileSync(`${live}-wal`, `${crashed}-wal`)
    if (existsSync(`${live}-shm`)) copyFileSync(`${live}-shm`, `${crashed}-shm`)
    opened.db.close()
    const reopened = openDatabase({ file: crashed, key: KEY })
    expect(reopened.setAsideAt).toBeNull()
    expect(reopened.db.prepare('SELECT count(*) AS n FROM t').get()).toEqual({ n: 50 })
    reopened.db.close()
  })

  it('leaves a healthy database where it is when the check can’t run because the file is busy', () => {
    const dir = tempDir()
    const file = join(dir, 'aeterna.db')
    makeDatabase(file, KEY)
    const before = digest(file)
    const busy = (): string => {
      throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' })
    }
    expect(() => openDatabase({ file, key: KEY, quickCheck: busy })).toThrow(/couldn’t be checked just now[\s\S]*has not been changed/)
    expect(digest(file)).toBe(before)
    expect(readdirSync(dir).filter((f) => f.includes('damaged'))).toEqual([])
  })

  it('sets a database aside when the check itself stops on damage', () => {
    const dir = tempDir()
    const file = join(dir, 'aeterna.db')
    makeDatabase(file, KEY)
    const corrupt = (): string => {
      throw Object.assign(new Error('database disk image is malformed'), { code: 'SQLITE_CORRUPT' })
    }
    const opened = openDatabase({ file, key: KEY, quickCheck: corrupt })
    expect(opened.setAsideAt).toMatch(/\.damaged-/)
    opened.db.close()
  })

  it('never starts a new database beside a -wal file whose database is missing', () => {
    const dir = tempDir()
    const file = join(dir, 'aeterna.db')
    writeFileSync(`${file}-wal`, 'frames from a database that has gone')
    expect(() => openDatabase({ file, key: KEY })).toThrow(/without the database itself[\s\S]*Nothing has been changed/)
    expect(readdirSync(dir)).toEqual(['aeterna.db-wal'])
  })

  it('never overwrites an earlier set-aside copy', () => {
    const dir = tempDir()
    const file = join(dir, 'aeterna.db')
    const now = (): Date => new Date('2026-10-20T10:00:00Z')
    const damaged = (): string => 'row 1 missing from index'
    makeDatabase(file, KEY)
    const first = openDatabase({ file, key: KEY, quickCheck: damaged, now })
    first.db.exec('CREATE TABLE second (x)')
    first.db.close()
    const second = openDatabase({ file, key: KEY, quickCheck: damaged, now })
    expect(second.setAsideAt).not.toBe(first.setAsideAt)
    expect(existsSync(first.setAsideAt as string)).toBe(true)
    expect(existsSync(second.setAsideAt as string)).toBe(true)
    second.db.close()
  })
})

