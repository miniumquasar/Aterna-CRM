import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { KeyFileError, createDatabaseKey, loadOrCreateDatabaseKey, readDatabaseKey } from '@main/db/key-file'

const dirs: string[] = []
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'aeterna-key-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('the database key file', () => {
  it('is created once with 32 random bytes as hex, and leaves no temporary file', () => {
    const dir = tempDir()
    const file = join(dir, 'database-key.json')
    const key = createDatabaseKey(file)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ version: 1, key })
    expect(readDatabaseKey(file)).toBe(key)
    expect(readdirSync(dir)).toEqual(['database-key.json'])
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o077).toBe(0)
  })

  it('is never overwritten', () => {
    const file = join(tempDir(), 'database-key.json')
    const key = createDatabaseKey(file)
    const before = readFileSync(file)
    expect(() => createDatabaseKey(file)).toThrow(KeyFileError)
    expect(readFileSync(file).equals(before)).toBe(true)
    expect(loadOrCreateDatabaseKey({ keyFile: file, databaseFile: join(tempDir(), 'none.db') })).toEqual({ key, created: false })
    expect(readFileSync(file).equals(before)).toBe(true)
  })

  it('is created for a new installation only', () => {
    const dir = tempDir()
    const loaded = loadOrCreateDatabaseKey({ keyFile: join(dir, 'database-key.json'), databaseFile: join(dir, 'aeterna.db') })
    expect(loaded.created).toBe(true)
  })

  it('is not made up for a database that already exists without one', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'aeterna.db'), 'existing database bytes')
    expect(() => loadOrCreateDatabaseKey({ keyFile: join(dir, 'database-key.json'), databaseFile: join(dir, 'aeterna.db') })).toThrow(/missing/)
    expect(existsSync(join(dir, 'database-key.json'))).toBe(false)
  })

  it('stops with an explanation, untouched, when the file is damaged', () => {
    const file = join(tempDir(), 'database-key.json')
    writeFileSync(file, '{ "version": 1, "key": "not-hex" }')
    expect(() => readDatabaseKey(file)).toThrow(KeyFileError)
    writeFileSync(file, 'garbage')
    expect(() => loadOrCreateDatabaseKey({ keyFile: file, databaseFile: join(tempDir(), 'x.db') })).toThrow(/can’t be read/)
    expect(readFileSync(file, 'utf8')).toBe('garbage')
  })

  it('is not made up when only the database’s -wal file is left', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'aeterna.db-wal'), 'write-ahead log frames')
    expect(() => loadOrCreateDatabaseKey({ keyFile: join(dir, 'database-key.json'), databaseFile: join(dir, 'aeterna.db') })).toThrow(KeyFileError)
    expect(existsSync(join(dir, 'database-key.json'))).toBe(false)
  })
})

