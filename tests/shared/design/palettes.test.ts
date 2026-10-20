/**
 * The palettes are the palette study's, exactly, and every one still passes
 * the study's checks: text, accent, semantic and chart contrast at every
 * glass level, chart colours apart under four kinds of colour vision, and
 * the sequential and diverging scales. The port of the validator is itself
 * checked against the study's own published numbers (validation.txt).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrast, deltaE2000, isColour, over, parseColour, toHex } from '@shared/theme/colour'
import { DEFAULT_PALETTE, PALETTES, PALETTE_IDS, PALETTE_STUDY, paletteFor, prose, solidSurfaces, tokensFor, type PaletteStudy } from '@shared/theme/palettes'
import { checkPalette, explain, TOKEN_KEYS, type CheckRow } from './palette-checks'

const study = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/design/palettes.json'), 'utf8')) as PaletteStudy[]
const validation = readFileSync(resolve(process.cwd(), 'docs/design/validation.txt'), 'utf8')
const MODES = ['day', 'night'] as const

describe('the palette data', () => {
  it('is docs/design/palettes.json, exactly', () => {
    expect(PALETTE_STUDY).toEqual(study)
  })

  it('has the eight palettes, Burgundy & Slate first and by default', () => {
    expect(PALETTE_IDS).toEqual(['burgundy', 'sapphire', 'emerald', 'graphite', 'indigo', 'onyx', 'aubergine', 'petrol'])
    expect(PALETTE_STUDY.map((p) => p.id)).toEqual([...PALETTE_IDS])
    expect(DEFAULT_PALETTE).toBe('burgundy')
    expect(PALETTES.burgundy.name).toBe('Burgundy & Slate')
    expect(paletteFor('nope').id).toBe('burgundy')
    expect(paletteFor(null).id).toBe('burgundy')
  })

  it.each(PALETTE_IDS.flatMap((id) => MODES.map((mode) => [id, mode] as const)))('%s %s has exactly the 35 tokens, all valid colours', (id, mode) => {
    const p = PALETTE_STUDY.find((x) => x.id === id) as PaletteStudy
    const t = p[mode]
    expect(Object.keys(t)).toEqual([...TOKEN_KEYS])
    expect(t.chart).toHaveLength(8)
    expect(new Set(t.chart).size).toBe(8)
    expect(t.chartSequential).toHaveLength(5)
    expect(t.chartDiverging).toHaveLength(5)
    for (const [key, value] of Object.entries(t)) for (const c of Array.isArray(value) ? value : [value]) expect(isColour(c as string), `${key} ${c}`).toBe(true)
    expect(p.tagline.split(/\s+/).length).toBeLessThanOrEqual(6)
    expect(p.swatches).toHaveLength(3)
    for (const s of p.swatches) expect(s).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('derives the window colour, solid surfaces and the first-pass names from the tokens', () => {
    const t = tokensFor('burgundy', 'night')
    expect(t.scheme).toBe('dark')
    expect(tokensFor('burgundy', 'day').scheme).toBe('light')
    expect(t.window).toBe(t.backdropVia)
    expect(t.backdrop).toEqual([t.backdropFrom, t.backdropVia, t.backdropTo])
    expect(t.glow).toEqual(['#96163c', '#3a5074'])
    expect(t.surfaceAlpha).toBe(0.5)
    expect(t.textSubtle).toBe(t.textFaint)
    expect(t.onAccent).toBe(t.accentFg)
    expect(t.accentText).toBe(t.focus)
    // The study's own Reduce-transparency hexes for Burgundy (PALETTES.md §7).
    expect(t.solid).toEqual({ surface: '#260e1a', surfaceRaised: '#311925', surfaceSunken: '#1c0a14', selected: '#491728' })
    expect(tokensFor('burgundy', 'day').solid).toEqual({ surface: '#f7f9fc', surfaceRaised: '#fdfdfe', surfaceSunken: '#ecedf2', selected: '#efe6ec' })
  })

  it('sets the study’s prose with en dashes and curly apostrophes on screen', () => {
    expect(prose(PALETTES.burgundy.recommendedFor)).toBe('Solicitors, barristers’ clerks, conveyancing and probate – the default for every new install.')
  })
})

describe('the colour maths', () => {
  it('parses, composites and measures as the validator does', () => {
    expect(parseColour('#8f1237')).toEqual([143, 18, 55, 1])
    expect(parseColour('rgba(255, 255, 255, 0.6)')).toEqual([255, 255, 255, 0.6])
    expect(() => parseColour('red')).toThrow()
    expect(toHex(over('rgba(0, 0, 0, 0.5)', '#ffffff'))).toBe('#808080')
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#d16472')).toBeCloseTo(3.64, 2) // the brief's sheen end (validation.txt)
    expect(deltaE2000('#123456', '#123456')).toBe(0)
  })

  it('matches the study’s published worst cases for every palette and mode', () => {
    const table = section(validation, 'KEY RESULTS')
    expect(table.length).toBe(16)
    const columns: Array<[number, (rows: CheckRow[]) => number, number]> = [
      [2, pick('text'), 0.006],
      [3, pick('textMuted'), 0.006],
      [4, pick('textFaint'), 0.006],
      [5, pick('accentFg on accent'), 0.006],
      [6, pick('accentFg on accentGradientTo'), 0.006],
      [7, pick('accent as UI graphic vs surface'), 0.006],
      [8, pick('focus ring vs surface (>=3)'), 0.006],
      [9, pick('accent2 as graphic vs surface'), 0.006],
      [10, pick('success as text (>=4.5)'), 0.006],
      [11, pick('warning as text (>=4.5)'), 0.006],
      [12, pick('danger as text (>=4.5)'), 0.006],
      [13, pick('info as text (>=4.5)'), 0.006],
      [14, (rows) => Math.min(...rows.filter((r) => r.name.startsWith('chart[')).map((r) => r.value)), 0.006],
      [15, pick('adjacent dE2000 normal'), 0.06],
      [16, pick('adjacent dE2000 protan'), 0.06],
      [17, pick('adjacent dE2000 deutan'), 0.06],
      [18, pick('adjacent dE2000 tritan'), 0.06]
    ]
    for (const cells of table) {
      const [id, mode] = cells
      const rows = checkPalette(PALETTE_STUDY.find((p) => p.id === id) as PaletteStudy).filter((r) => r.mode === mode)
      for (const [col, value, tolerance] of columns) {
        expect(Math.abs(value(rows) - Number(cells[col])), `${id} ${mode} column ${col}`).toBeLessThanOrEqual(tolerance)
      }
    }
  })

  it('flattens glass exactly as the study’s Reduce-transparency table', () => {
    const table = section(validation, 'REDUCE TRANSPARENCY')
    expect(table.length).toBe(16)
    for (const [id, mode, surface, raised, sunken, selected] of table) {
      const p = PALETTE_STUDY.find((x) => x.id === id) as PaletteStudy
      expect(solidSurfaces(p[mode as 'day' | 'night']), `${id} ${mode}`).toEqual({ surface, surfaceRaised: raised, surfaceSunken: sunken, selected })
    }
  })
})

describe('every palette passes the study’s checks', () => {
  it.each(PALETTE_IDS.map((id) => [id] as const))('%s', (id) => {
    const rows = checkPalette(PALETTE_STUDY.find((p) => p.id === id) as PaletteStudy)
    expect(rows.length).toBe(95)
    expect(rows.filter((r) => !r.ok).map(explain)).toEqual([])
  })

  it('fails a palette whose secondary text is too faint, or whose chart colours run together', () => {
    const base = PALETTE_STUDY[0]
    const faint: PaletteStudy = { ...base, night: { ...base.night, textMuted: base.night.textFaint } }
    expect(checkPalette(faint).filter((r) => !r.ok).map((r) => `${r.mode} ${r.name}`)).toContain('night textMuted')
    const muddled: PaletteStudy = { ...base, day: { ...base.day, chart: [base.day.chart[0], base.day.chart[0], ...base.day.chart.slice(2)] } }
    expect(checkPalette(muddled).filter((r) => !r.ok).map((r) => `${r.mode} ${r.name}`)).toContain('day adjacent dE2000 normal')
    const pale: PaletteStudy = { ...base, day: { ...base.day, accent: '#f3c0cc' } }
    expect(checkPalette(pale).filter((r) => !r.ok).map((r) => r.name)).toContain('accentFg on accent')
  })

  it('agrees with the study’s verdict', () => {
    expect(validation.trim().split('\n').pop()).toBe('OVERALL: ALL CHECKS PASS')
  })
})

/** The rows of a table in validation.txt, as cells, from its title to the next blank line. */
function section(text: string, title: string): string[][] {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.startsWith(title))
  const out: string[][] = []
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) break
    const cells = line.trim().split(/\s+/)
    if ((PALETTE_IDS as readonly string[]).includes(cells[0])) out.push(cells)
  }
  return out
}

function pick(name: string): (rows: CheckRow[]) => number {
  return (rows) => {
    const row = rows.find((r) => r.name === name)
    if (!row) throw new Error(`No check named ${name}`)
    return row.value
  }
}
