/** The semantic tones every component shares, and their classes (all from theme variables). */
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

/** Soft fill, readable text and a hairline in the tone: badges, banners, tiles. */
export const SOFT_TONE: Record<Tone, string> = {
  neutral: 'bg-fg/[0.07] text-fg-muted border-line/20',
  accent: 'bg-accent/15 text-accent-text border-accent/30',
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
  info: 'bg-info/15 text-info border-info/30'
}

/** Text in the tone. */
export const TEXT_TONE: Record<Tone, string> = {
  neutral: 'text-fg-muted',
  accent: 'text-accent-text',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info'
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
