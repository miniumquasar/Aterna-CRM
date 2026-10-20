/**
 * The colour pairs the components rely on, beyond the palette study's own
 * checks, in every palette and mode at every glass level: pills, the chosen
 * segment, table headers, dialogs and toasts, the Day danger button, the
 * accent as a graphic on the selection tint, and the off-state edges of
 * switches and tick boxes. If a palette changes and one of these slips,
 * the component's styling has to change with it.
 */
import { describe, expect, it } from 'vitest'
import { contrast, over, parseColour, scaleAlpha, type Rgba } from '@shared/theme/colour'
import { PALETTE_STUDY, solidSurfaces, type StudyTokens } from '@shared/theme/palettes'
import { EFFECTS, layers } from './palette-checks'

type Mode = 'day' | 'night'

/** Every opaque L1 and L2 colour, at every glass level. */
function bases(t: StudyTokens): Rgba[] {
  return EFFECTS.flatMap(([effect]) => {
    const L = layers(t, effect)
    return [...L.surface, ...L.raised].map(([, c]) => c)
  })
}

/** `rgb(var(--text) / a)`, as Tailwind's bg-fg/[a] draws it. */
function tint(colour: string, a: number): Rgba {
  const [r, g, b] = parseColour(colour)
  return [r, g, b, a]
}

function worst(fg: string | Rgba, backgrounds: Rgba[]): number {
  return Math.min(...backgrounds.map((bg) => contrast(fg, bg)))
}

const cases = PALETTE_STUDY.flatMap((p) => (['day', 'night'] as const).map((mode) => [p.id, mode, p[mode]] as const))

describe.each(cases)('%s %s', (_id, mode: Mode, t) => {
  const glass = bases(t)
  const onSoftAccent = glass.map((b) => over(t.accentSoft, b))

  it('neutral pills: secondary text on the faint text tint', () => {
    expect(worst(t.textMuted, glass.map((b) => over(tint(t.text, 0.07), b)))).toBeGreaterThanOrEqual(4.5)
  })

  it('accent pills and selected rows: body text on the accent tint, and the focus colour (never the accent fill) for their dots and bars', () => {
    expect(worst(t.text, onSoftAccent)).toBeGreaterThanOrEqual(7)
    expect(worst(t.textMuted, onSoftAccent)).toBeGreaterThanOrEqual(4.5)
    expect(worst(t.focus, onSoftAccent)).toBeGreaterThanOrEqual(3)
  })

  it('the chosen segment: body text on its raised pill', () => {
    const pill = mode === 'day' ? [parseColour(solidSurfaces(t).surfaceRaised)] : glass.map((b) => over(tint(t.text, 0.11), over(t.surfaceSunken, b)))
    expect(worst(t.text, pill)).toBeGreaterThanOrEqual(7)
  })

  it('table headers: secondary text on the frosted header', () => {
    const [r, g, b, a] = parseColour(t.surfaceRaised)
    const fill: Rgba = mode === 'day' ? [r, g, b, Math.min(0.9, a + 0.5)] : [...(parseColour(solidSurfaces(t).surfaceRaised).slice(0, 3) as [number, number, number]), 0.82]
    expect(worst(t.textMuted, glass.map((bg) => over(fill, bg)))).toBeGreaterThanOrEqual(4.5)
  })

  it('dialogs, menus and toasts: text levels on the thicker glass', () => {
    const raised = glass.map((b) => over(t.surfaceRaised, over(scaleAlpha(t.surface, 1.3), b)))
    expect(worst(t.text, raised)).toBeGreaterThanOrEqual(7)
    expect(worst(t.textMuted, raised)).toBeGreaterThanOrEqual(4.5)
    expect(worst(t.focus, raised)).toBeGreaterThanOrEqual(4.5)
  })

  it('the danger button: white on solid danger in Day, danger text on its tint in Night', () => {
    if (mode === 'day') expect(contrast('#ffffff', t.danger)).toBeGreaterThanOrEqual(4.5)
    else expect(worst(t.danger, glass.map((b) => over(t.dangerSoft, b)))).toBeGreaterThanOrEqual(4.5)
  })

  it('switches and tick boxes that are off: an edge and a knob that stand out at 3:1', () => {
    const track = glass.map((b) => over(tint(solidSurfaces(t).surfaceSunken, 0.5), b))
    expect(worst(t.textFaint, glass)).toBeGreaterThanOrEqual(3)
    expect(worst(t.textMuted, track)).toBeGreaterThanOrEqual(3)
  })

  it('a switch or tick box that is on: its focus-colour edge against any glass, and its knob or tick against the fill', () => {
    expect(worst(t.focus, glass)).toBeGreaterThanOrEqual(3)
    expect(Math.min(contrast(t.accentFg, t.accent), contrast(t.accentFg, t.accentGradientFrom))).toBeGreaterThanOrEqual(4.5)
  })
})
