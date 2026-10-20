import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE, normaliseAppearance, resolveMode } from '@shared/theme/appearance'
import { DEFAULT_PALETTE, PALETTES, PALETTE_IDS, paletteFor, type ModeTokens } from '@shared/theme/palettes'
import { hexToChannels, themeVariables } from '@shared/theme/variables'

// The palette study's own checks (contrast, chart colours, scales) are in tests/shared/design/.
const COLOUR = /^(#[0-9a-f]{6}|rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (0|1|0?\.\d+)\))$/i

describe('palettes', () => {
  it('has the eight themes of the palette study, Burgundy & Slate by default', () => {
    expect(PALETTE_IDS).toEqual(['burgundy', 'sapphire', 'emerald', 'graphite', 'indigo', 'onyx', 'aubergine', 'petrol'])
    expect(DEFAULT_PALETTE).toBe('burgundy')
    expect(PALETTES.burgundy.name).toBe('Burgundy & Slate')
    expect(PALETTES.burgundy.night.backdrop).toEqual(['#2b0a16', '#110a11', '#090a10'])
    expect(PALETTES.burgundy.day.window).toBe('#eceff7')
  })

  it.each(PALETTE_IDS.flatMap((id) => (['day', 'night'] as const).map((mode) => [id, mode] as const)))('%s %s has complete, valid tokens', (id, mode) => {
    const t: ModeTokens = PALETTES[id][mode]
    expect(PALETTES[id].id).toBe(id)
    expect(t.scheme).toBe(mode === 'day' ? 'light' : 'dark')
    for (const [name, value] of Object.entries(t)) {
      if (typeof value === 'string' && name !== 'scheme') expect(value, name).toMatch(COLOUR)
      if (typeof value === 'number') expect(value, name).toBeGreaterThanOrEqual(0)
      if (typeof value === 'number') expect(value, name).toBeLessThanOrEqual(1)
      if (Array.isArray(value)) for (const v of value) expect(v, name).toMatch(COLOUR)
    }
    expect(t.chart.length).toBe(8)
    expect(new Set(t.chart).size).toBe(t.chart.length)
  })

  it('falls back to the default for an unknown id', () => {
    expect(paletteFor('nope').id).toBe('burgundy')
  })
})

describe('theme variables', () => {
  it('turns colours into channels for Tailwind', () => {
    expect(hexToChannels('#9f1239')).toBe('159 18 57')
    expect(() => hexToChannels('red')).toThrow()
    const vars = themeVariables(PALETTES.burgundy.night)
    expect(vars['--accent']).toBe(hexToChannels(PALETTES.burgundy.night.accent))
    expect(vars['--surface-alpha']).toBe('0.5')
    expect(vars['--chart-1']).toBeDefined()
  })
})

describe('appearance preferences', () => {
  it('normalise what was stored, keeping what is valid', () => {
    expect(normaliseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE)
    expect(normaliseAppearance({ mode: 'night', palette: 'neon', effects: 'lite', reduceMotion: 'yes' })).toEqual({ ...DEFAULT_APPEARANCE, mode: 'night', effects: 'lite' })
  })

  it('resolve Auto from the operating system', () => {
    expect(resolveMode('auto', true)).toBe('night')
    expect(resolveMode('auto', false)).toBe('day')
    expect(resolveMode('day', true)).toBe('day')
  })
})
