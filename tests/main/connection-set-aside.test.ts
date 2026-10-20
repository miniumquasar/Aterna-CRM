/**
 * Setting a damaged database aside is all or nothing: if one of its files
 * can't be moved (Windows keeps a file open by another program locked), the
 * ones already moved go back, so the set is never split.
 */
import type * as fs from 'node:fs'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const failing = vi.hoisted(() => ({ suffix: null as string | null }))

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof fs>()
  return {
    ...real,
    renameSync: (from: string, to: string) => {
      if (failing.suffix && String(from).endsWith(failing.suffix)) {
        throw Object.assign(new Error(`EBUSY: resource busy or locked, rename '${String(from)}'`), { code: 'EBUSY' })
      }
      return real.renameSync(from, to)
    }
  }
})

const { DatabaseOpenError, setAside } = await import('@main/db/connection')

const dirs: string[] = []
afterEach(() => {
  failing.suffix = null
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('setting a damaged database aside', () => {
  it('moves the database, its -wal and its -shm together', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aeterna-aside-'))
    dirs.push(dir)
    const file = join(dir, 'aeterna.db')
    for (const s of ['', '-wal', '-shm']) writeFileSync(file + s, s || 'main')
    const target = setAside(file, 'damaged', new Date('2026-10-20T10:00:00Z'))
    expect(readdirSync(dir).sort()).toEqual([`${target}`, `${target}-shm`, `${target}-wal`].map((f) => f.slice(dir.length + 1)).sort())
  })

  it('puts everything back when one file can’t be moved', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aeterna-aside-'))
    dirs.push(dir)
    const file = join(dir, 'aeterna.db')
    for (const s of ['', '-wal', '-shm']) writeFileSync(file + s, s || 'main')
    failing.suffix = '-shm'
    expect(() => setAside(file, 'damaged')).toThrow(DatabaseOpenError)
    expect(readdirSync(dir).sort()).toEqual(['aeterna.db', 'aeterna.db-shm', 'aeterna.db-wal'])
  })
})
