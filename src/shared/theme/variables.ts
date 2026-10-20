/**
 * A palette's tokens as CSS custom properties. Colours become "R G B"
 * channels so Tailwind's `rgb(var(--accent) / <alpha-value>)` works with
 * opacity modifiers (bg-accent/15); a translucent token also gets its alpha
 * (`--surface` and `--surface-alpha`).
 *
 * The glass level is applied here, so the variables always say what is on
 * screen: Full thins the two glass layers (× 0.85), Lite thickens them
 * (× 1.15, never above 0.96), and Reduce transparency makes them opaque —
 * flattened over the backdrop exactly as the palette study's validator does
 * — with the stronger hairline.
 */
import type { EffectsLevel } from './appearance'
import { alphaOf, channels, parseColour, scaleAlpha } from './colour'
import type { ModeTokens } from './palettes'

/** '#9f1239' → '159 18 57'. */
export function hexToChannels(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new RangeError(`“${hex}” isn’t a #rrggbb colour.`)
  const n = parseInt(m[1], 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

export interface GlassOptions {
  effects: EffectsLevel
  /** Opaque surfaces instead of glass. */
  reduceTransparency: boolean
}

/** The alpha multiplier each effects level applies to the glass layers (the study's §7). */
export const GLASS_ALPHA: Readonly<Record<EffectsLevel, number>> = Object.freeze({ full: 0.85, balanced: 1, lite: 1.15 })

const DEFAULT_GLASS: GlassOptions = { effects: 'balanced', reduceTransparency: false }

const round = (n: number): string => String(Math.round(n * 1000) / 1000)

/** Every CSS variable a mode's tokens set, by name (with the leading --), at a glass level (Balanced by default). */
export function themeVariables(t: ModeTokens, glass: GlassOptions = DEFAULT_GLASS): Record<string, string> {
  const k = GLASS_ALPHA[glass.effects] ?? 1
  const solid = glass.reduceTransparency
  const surface = solid ? parseColour(t.solid.surface) : scaleAlpha(t.surface, k)
  const raised = solid ? parseColour(t.solid.surfaceRaised) : scaleAlpha(t.surfaceRaised, k)
  const border = solid ? t.borderStrong : t.border

  // A colour token and, for a translucent one, its alpha.
  const vars: Record<string, string> = {}
  const set = (name: string, colour: string): void => {
    vars[`--${name}`] = channels(colour)
  }
  const setWithAlpha = (name: string, colour: string): void => {
    vars[`--${name}`] = channels(colour)
    vars[`--${name}-alpha`] = round(alphaOf(colour))
  }

  set('window', t.window)
  set('backdrop-1', t.backdropFrom)
  set('backdrop-2', t.backdropVia)
  set('backdrop-3', t.backdropTo)
  vars['--glow-1'] = channels(t.glowA)
  vars['--glow-1-alpha'] = round(alphaOf(t.glowA))
  vars['--glow-2'] = channels(t.glowB)
  vars['--glow-2-alpha'] = round(alphaOf(t.glowB))

  vars['--surface'] = channels(surface)
  vars['--surface-alpha'] = round(surface[3])
  vars['--surface-raised'] = channels(raised)
  vars['--surface-raised-alpha'] = round(raised[3])
  setWithAlpha('surface-sunken', t.surfaceSunken)
  setWithAlpha('border', border)
  setWithAlpha('border-strong', t.borderStrong)
  setWithAlpha('highlight', t.highlight)
  setWithAlpha('shadow', t.shadow)

  set('text', t.text)
  set('text-muted', t.textMuted)
  set('text-subtle', t.textFaint)
  set('text-faint', t.textFaint)

  set('accent', t.accent)
  set('accent-hover', t.accentHover)
  set('accent-active', t.accentActive)
  set('on-accent', t.accentFg)
  set('accent-fg', t.accentFg)
  set('accent-text', t.focus)
  setWithAlpha('accent-soft', t.accentSoft)
  set('accent-2', t.accent2)
  set('accent-gradient-from', t.accentGradientFrom)
  set('accent-gradient-to', t.accentGradientTo)
  set('focus', t.focus)

  for (const tone of ['success', 'warning', 'danger', 'info'] as const) {
    set(tone, t[tone])
    setWithAlpha(`${tone}-soft`, t[`${tone}Soft`])
  }

  t.chart.forEach((c, i) => set(`chart-${i + 1}`, c))
  t.chartSequential.forEach((c, i) => set(`chart-seq-${i + 1}`, c))
  t.chartDiverging.forEach((c, i) => set(`chart-div-${i + 1}`, c))

  set('solid-surface', t.solid.surface)
  set('solid-raised', t.solid.surfaceRaised)
  set('solid-sunken', t.solid.surfaceSunken)
  set('solid-selected', t.solid.selected)
  return vars
}

/**
 * The variables for paper: the palette's Day tokens with opaque surfaces,
 * and the deepest accent step as the brand ink (it holds on a mono laser).
 */
export function printVariables(day: ModeTokens): Record<string, string> {
  const vars = themeVariables(day, { effects: 'lite', reduceTransparency: true })
  vars['--accent'] = channels(day.accentActive)
  vars['--accent-text'] = channels(day.accentActive)
  vars['--focus'] = channels(day.accentActive)
  return vars
}

/** Variables as CSS declarations: '--a: 1 2 3; --b: 0.5'. */
export function declarations(vars: Record<string, string>, important = false): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}: ${value}${important ? ' !important' : ''};`)
    .join(' ')
}
