/**
 * Appearance is saved for the person using this PC (the OS user), applies
 * before anyone signs in and after the licence lapses, stays out of the
 * audit log, refuses choices that don't exist, and gives the window the
 * saved theme's colours so start-up never flashes.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE } from '@shared/theme/appearance'
import { PALETTES } from '@shared/theme/palettes'
import { APPEARANCE_GROUP, readAppearance, saveAppearance, windowColours } from '@main/preferences/appearance'
import { createTestDb } from '../../helpers/db'
import { createTestIpc } from '../../helpers/ipc'

describe('appearance preferences', () => {
  it('start at the defaults and keep each OS user’s own choice', () => {
    const { db } = createTestDb()
    expect(readAppearance(db, 'ann')).toEqual(DEFAULT_APPEARANCE)
    saveAppearance(db, { mode: 'night', palette: 'onyx', density: 'compact' }, 'ann')
    saveAppearance(db, { palette: 'petrol' }, 'bob')
    expect(readAppearance(db, 'ann')).toEqual({ ...DEFAULT_APPEARANCE, mode: 'night', palette: 'onyx', density: 'compact' })
    expect(readAppearance(db, 'bob')).toEqual({ ...DEFAULT_APPEARANCE, palette: 'petrol' })
    // A later change keeps what was saved before.
    saveAppearance(db, { effects: 'lite' }, 'ann')
    expect(readAppearance(db, 'ann')).toMatchObject({ mode: 'night', palette: 'onyx', density: 'compact', effects: 'lite' })
  })

  it('read a damaged or older saved value as the nearest valid one', () => {
    const { db } = createTestDb()
    db.prepare('INSERT INTO settings ("group", key, value) VALUES (?, ?, ?)').run(APPEARANCE_GROUP, 'old', JSON.stringify({ mode: 'day', palette: 'graphite', effects: 'full', reduceMotion: true }))
    expect(readAppearance(db, 'old')).toEqual({ ...DEFAULT_APPEARANCE, mode: 'day', palette: 'graphite', effects: 'full', reduceMotion: true })
    db.prepare('INSERT INTO settings ("group", key, value) VALUES (?, ?, ?)').run(APPEARANCE_GROUP, 'odd', JSON.stringify('neon'))
    expect(readAppearance(db, 'odd')).toEqual(DEFAULT_APPEARANCE)
  })

  it('colour the window with the saved theme: Day, Night, or what Windows is using', () => {
    const night = PALETTES.sapphire.night
    const day = PALETTES.sapphire.day
    expect(windowColours({ ...DEFAULT_APPEARANCE, palette: 'sapphire', mode: 'night' }, false)).toEqual({ background: night.backdropVia, symbol: night.text })
    expect(windowColours({ ...DEFAULT_APPEARANCE, palette: 'sapphire', mode: 'day' }, true)).toEqual({ background: day.backdropVia, symbol: day.text })
    expect(windowColours({ ...DEFAULT_APPEARANCE, palette: 'sapphire', mode: 'auto' }, true).background).toBe(night.backdropVia)
    expect(windowColours({ ...DEFAULT_APPEARANCE, palette: 'sapphire', mode: 'auto' }, false).background).toBe(day.backdropVia)
    expect(windowColours(DEFAULT_APPEARANCE, false).background).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('appearance channels', () => {
  it('work signed out, save only what is sent, and stay out of the audit log', async () => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db)
    expect(await ipc.ok('appearance.get', undefined)).toEqual(DEFAULT_APPEARANCE)
    expect(await ipc.ok('appearance.set', { palette: 'aubergine', density: 'compact' })).toEqual({ ...DEFAULT_APPEARANCE, palette: 'aubergine', density: 'compact' })
    expect(await ipc.ok('appearance.set', { reduceTransparency: true })).toMatchObject({ palette: 'aubergine', density: 'compact', reduceTransparency: true })
    expect(await ipc.ok('appearance.get', undefined)).toMatchObject({ palette: 'aubergine', density: 'compact', reduceTransparency: true })
    expect(ipc.auditCount()).toBe(0)
  })

  it('still save after the licence lapses', async () => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db, { readOnly: true })
    expect(await ipc.call('appearance.set', { mode: 'night' })).toMatchObject({ ok: true, data: { mode: 'night' } })
  })

  it.each([
    [{ mode: 'dusk' }, 'mode'],
    [{ palette: 'neon' }, 'palette'],
    [{ effects: 'ultra' }, 'effects'],
    [{ density: 'tiny' }, 'density'],
    [{ reduceMotion: 'yes' }, 'reduceMotion'],
    [{ reduceTransparency: 1 }, 'reduceTransparency']
  ] as const)('refuse %o, naming the field', async (patch, field) => {
    const { db } = createTestDb()
    const ipc = createTestIpc(db)
    const result = await ipc.call('appearance.set', patch as never)
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid', field } })
    if (!result.ok) expect(result.error.message).toMatch(/^[A-Z].*\.$/)
    expect(await ipc.ok('appearance.get', undefined)).toEqual(DEFAULT_APPEARANCE)
  })
})
