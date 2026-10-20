/**
 * The theme as CSS variables (every name the first token set had is still
 * there, plus every token of the palette study), the glass levels and
 * Reduce transparency, the print theme, and the appearance preferences.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE, DENSITY_LEVELS, EFFECTS_LEVELS, MODE_TAGLINES, normaliseAppearance, resolveMode } from '@shared/theme/appearance'
import { channels } from '@shared/theme/colour'
import { PALETTE_IDS, PALETTES, tokensFor } from '@shared/theme/palettes'
import { GLASS_ALPHA, declarations, hexToChannels, printVariables, themeVariables } from '@shared/theme/variables'

/** The names the first token set wrote; screens may use any of them. */
const FIRST_NAMES = [
  '--window', '--backdrop-1', '--backdrop-2', '--backdrop-3', '--glow-1', '--glow-2',
  '--surface', '--surface-alpha', '--surface-raised', '--surface-raised-alpha', '--border', '--border-alpha',
  '--highlight', '--highlight-alpha', '--shadow', '--text', '--text-muted', '--text-subtle',
  '--accent', '--on-accent', '--accent-text', '--accent-2', '--success', '--warning', '--danger', '--info', '--focus',
  '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6', '--chart-7', '--chart-8'
]

const CHANNELS = /^\d{1,3} \d{1,3} \d{1,3}$/

describe('theme variables', () => {
  it('turns colours into channels for Tailwind', () => {
    expect(hexToChannels('#9f1239')).toBe('159 18 57')
    expect(() => hexToChannels('red')).toThrow()
    expect(channels('rgba(60, 18, 36, 0.5)')).toBe('60 18 36')
  })

  it.each(PALETTE_IDS.flatMap((id) => (['day', 'night'] as const).map((mode) => [id, mode] as const)))('%s %s writes every variable, as channels or alphas', (id, mode) => {
    const vars = themeVariables(tokensFor(id, mode))
    for (const name of FIRST_NAMES) expect(vars[name], name).toBeDefined()
    for (const name of ['--surface-sunken', '--border-strong', '--accent-hover', '--accent-active', '--accent-soft', '--accent-gradient-from', '--accent-gradient-to', '--success-soft', '--info-soft', '--chart-seq-5', '--chart-div-3', '--solid-surface', '--solid-selected', '--text-faint']) {
      expect(vars[name], name).toBeDefined()
    }
    for (const [name, value] of Object.entries(vars)) {
      if (name.endsWith('-alpha')) {
        expect(Number(value), name).toBeGreaterThanOrEqual(0)
        expect(Number(value), name).toBeLessThanOrEqual(1)
      } else {
        expect(value, name).toMatch(CHANNELS)
      }
    }
  })

  it('writes the tokens themselves at the Balanced level', () => {
    const t = PALETTES.burgundy.night
    const vars = themeVariables(t)
    expect(vars['--accent']).toBe(hexToChannels(t.accent))
    expect(vars['--surface']).toBe('60 18 36')
    expect(vars['--surface-alpha']).toBe('0.5')
    expect(vars['--surface-raised-alpha']).toBe('0.05')
    expect(vars['--text-subtle']).toBe(hexToChannels(t.textFaint))
    expect(vars['--accent-text']).toBe(hexToChannels(t.focus))
    expect(vars['--on-accent']).toBe(hexToChannels(t.accentFg))
    expect(vars['--window']).toBe(hexToChannels(t.backdropVia))
    expect(vars['--glow-1-alpha']).toBe('0.38')
  })

  it('thins the glass for Full and thickens it for Lite, never past 0.96', () => {
    const t = PALETTES.burgundy.day // surface 0.6, raised 0.7
    expect(GLASS_ALPHA).toEqual({ full: 0.85, balanced: 1, lite: 1.15 })
    expect(themeVariables(t, { effects: 'full', reduceTransparency: false })['--surface-alpha']).toBe('0.51')
    expect(themeVariables(t, { effects: 'lite', reduceTransparency: false })['--surface-alpha']).toBe('0.69')
    expect(themeVariables(t, { effects: 'lite', reduceTransparency: false })['--surface-raised-alpha']).toBe('0.805')
    const thick = { ...t, surface: 'rgba(255, 255, 255, 0.9)' }
    expect(themeVariables(thick, { effects: 'lite', reduceTransparency: false })['--surface-alpha']).toBe('0.96')
  })

  it('makes the glass opaque, with the stronger hairline, under Reduce transparency', () => {
    const t = PALETTES.burgundy.night
    const vars = themeVariables(t, { effects: 'full', reduceTransparency: true })
    expect(vars['--surface']).toBe(hexToChannels('#260e1a'))
    expect(vars['--surface-alpha']).toBe('1')
    expect(vars['--surface-raised']).toBe(hexToChannels('#311925'))
    expect(vars['--surface-raised-alpha']).toBe('1')
    expect(vars['--border']).toBe(channels(t.borderStrong))
    expect(vars['--border-alpha']).toBe('0.2')
  })

  it('prints in Day with opaque surfaces and the deepest accent as ink, whatever is on screen', () => {
    const day = PALETTES.sapphire.day
    const vars = printVariables(day)
    expect(vars['--text']).toBe(hexToChannels(day.text))
    expect(vars['--surface-alpha']).toBe('1')
    expect(vars['--accent']).toBe(hexToChannels(day.accentActive))
    expect(declarations({ '--a': '1 2 3' }, true)).toBe('--a: 1 2 3 !important;')
  })
})

describe('appearance preferences', () => {
  it('default to Burgundy & Slate, Auto, Balanced and Comfortable', () => {
    expect(DEFAULT_APPEARANCE).toEqual({ mode: 'auto', palette: 'burgundy', effects: 'balanced', density: 'comfortable', reduceMotion: false, reduceTransparency: false })
    expect(EFFECTS_LEVELS).toEqual(['full', 'balanced', 'lite'])
    expect(DENSITY_LEVELS).toEqual(['comfortable', 'compact'])
    expect(MODE_TAGLINES).toEqual({ day: 'Bright and crisp', night: 'Easy on the eyes', auto: 'Follows Windows' })
  })

  it('normalise what was stored, keeping what is valid', () => {
    expect(normaliseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE)
    expect(normaliseAppearance('night')).toEqual(DEFAULT_APPEARANCE)
    expect(normaliseAppearance({ mode: 'night', palette: 'neon', effects: 'lite', density: 'tiny', reduceMotion: 'yes' })).toEqual({ ...DEFAULT_APPEARANCE, mode: 'night', effects: 'lite' })
    expect(normaliseAppearance({ palette: 'petrol', density: 'compact', reduceTransparency: true })).toEqual({ ...DEFAULT_APPEARANCE, palette: 'petrol', density: 'compact', reduceTransparency: true })
    // A preference saved by the first build (no density, Full effects) still reads.
    expect(normaliseAppearance({ mode: 'day', palette: 'emerald', effects: 'full', reduceMotion: false, reduceTransparency: false })).toEqual({ ...DEFAULT_APPEARANCE, mode: 'day', palette: 'emerald', effects: 'full' })
  })

  it('resolve Auto from the operating system', () => {
    expect(resolveMode('auto', true)).toBe('night')
    expect(resolveMode('auto', false)).toBe('day')
    expect(resolveMode('day', true)).toBe('day')
    expect(resolveMode('night', false)).toBe('night')
  })
})
