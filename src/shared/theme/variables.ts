/**
 * A palette's tokens as CSS custom properties. Colours become "R G B"
 * channels so Tailwind's `rgb(var(--accent) / <alpha-value>)` works with
 * opacity modifiers (bg-accent/15).
 */
import type { ModeTokens } from './palettes'

/** '#9f1239' → '159 18 57'. */
export function hexToChannels(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new RangeError(`“${hex}” isn’t a #rrggbb colour.`)
  const n = parseInt(m[1], 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

/** Every CSS variable a mode's tokens set, by name (with the leading --). */
export function themeVariables(t: ModeTokens): Record<string, string> {
  const vars: Record<string, string> = {
    '--window': hexToChannels(t.window),
    '--backdrop-1': hexToChannels(t.backdrop[0]),
    '--backdrop-2': hexToChannels(t.backdrop[1]),
    '--backdrop-3': hexToChannels(t.backdrop[2]),
    '--glow-1': hexToChannels(t.glow[0]),
    '--glow-2': hexToChannels(t.glow[1]),
    '--surface': hexToChannels(t.surface),
    '--surface-alpha': String(t.surfaceAlpha),
    '--surface-raised': hexToChannels(t.surfaceRaised),
    '--surface-raised-alpha': String(t.surfaceRaisedAlpha),
    '--border': hexToChannels(t.border),
    '--border-alpha': String(t.borderAlpha),
    '--highlight': hexToChannels(t.highlight),
    '--highlight-alpha': String(t.highlightAlpha),
    '--shadow': hexToChannels(t.shadow),
    '--text': hexToChannels(t.text),
    '--text-muted': hexToChannels(t.textMuted),
    '--text-subtle': hexToChannels(t.textSubtle),
    '--accent': hexToChannels(t.accent),
    '--on-accent': hexToChannels(t.onAccent),
    '--accent-text': hexToChannels(t.accentText),
    '--accent-2': hexToChannels(t.accent2),
    '--success': hexToChannels(t.success),
    '--warning': hexToChannels(t.warning),
    '--danger': hexToChannels(t.danger),
    '--info': hexToChannels(t.info),
    '--focus': hexToChannels(t.focus)
  }
  t.chart.forEach((c, i) => {
    vars[`--chart-${i + 1}`] = hexToChannels(c)
  })
  return vars
}
