/**
 * The semantic tones every component shares, and their classes (all from theme variables).
 *
 * Contrast rules these follow (checked in tests/shared/design/combinations.test.ts):
 * a semantic colour is readable as text on its own soft tint, so success,
 * warning, danger and info pills use it for the label; the accent as text
 * is not readable enough on the accent tint, so accent pills keep the label
 * in body text and the accent text colour (the focus colour) for the dot,
 * icon or bar — the accent fill itself falls under 3:1 on its own tint in Night.
 */
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

/** Soft fill, readable text and a hairline in the tone: badges, banners, tiles. */
export const SOFT_TONE: Record<Tone, string> = {
  neutral: 'bg-fg/[0.07] text-fg-muted border-line/[0.14]',
  accent: 'bg-accent-soft text-fg border-accent/25',
  success: 'bg-success-soft text-success border-success/25',
  warning: 'bg-warning-soft text-warning border-warning/25',
  danger: 'bg-danger-soft text-danger border-danger/25',
  info: 'bg-info-soft text-info border-info/25'
}

/** Text in the tone (on glass, never on the tone's own tint for the accent). */
export const TEXT_TONE: Record<Tone, string> = {
  neutral: 'text-fg-muted',
  accent: 'text-accent-text',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info'
}

/** A dot or bar in the tone. */
export const DOT_TONE: Record<Tone, string> = {
  neutral: 'bg-fg-subtle',
  accent: 'bg-accent-text',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info'
}

/** The tone's soft tint behind an icon (icon tiles in empty states, toasts and stat tiles). */
export const ICON_TILE_TONE: Record<Tone, string> = {
  neutral: 'bg-fg/[0.07] text-fg-muted',
  accent: 'bg-accent-soft text-accent-text',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info'
}

/** The tone's colour as a CSS value, for SVG strokes and fills. */
export const TONE_VAR: Record<Tone, string> = {
  neutral: 'rgb(var(--text-muted))',
  accent: 'rgb(var(--accent-text))',
  success: 'rgb(var(--success))',
  warning: 'rgb(var(--warning))',
  danger: 'rgb(var(--danger))',
  info: 'rgb(var(--info))'
}
