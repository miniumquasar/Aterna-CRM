/**
 * The figures on stat tiles count up once per session (600 ms, easing out):
 * the one orchestrated moment the palette study allows. A figure already
 * formatted for people ('£12,400.00', '1,250', '42%') is read apart into
 * its prefix, number and suffix, and counted in the same format.
 */
export interface Figure {
  prefix: string
  value: number
  decimals: number
  grouped: boolean
  suffix: string
}

const FIGURE = /^(\D*?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(\D*)$/

/** '£12,400.00' → { prefix '£', value 12400, decimals 2, grouped, suffix '' }; null when it isn't one figure. */
export function readFigure(text: string): Figure | null {
  const m = FIGURE.exec(text.trim())
  if (!m) return null
  const whole = m[2].replace(/,/g, '')
  const decimals = m[3]?.length ?? 0
  const value = Number(decimals ? `${whole}.${m[3]}` : whole)
  if (!Number.isFinite(value)) return null
  return { prefix: m[1], value, decimals, grouped: m[2].includes(',') || value >= 10_000, suffix: m[4] }
}

export function writeFigure(f: Figure, value: number): string {
  const n = new Intl.NumberFormat('en-GB', { minimumFractionDigits: f.decimals, maximumFractionDigits: f.decimals, useGrouping: f.grouped }).format(value)
  return `${f.prefix}${n}${f.suffix}`
}

/** The figure eased out from 0 at `t` (0 to 1) of the way through. */
export function figureAt(f: Figure, t: number): string {
  const eased = 1 - (1 - Math.max(0, Math.min(1, t))) ** 3
  return writeFigure(f, f.value * eased)
}

/** Tiles whose figure has counted up already in this session. */
const counted = new Set<string>()

export function hasCounted(key: string): boolean {
  return counted.has(key)
}

export function markCounted(key: string): void {
  counted.add(key)
}

/** For tests. */
export function resetCounted(): void {
  counted.clear()
}
