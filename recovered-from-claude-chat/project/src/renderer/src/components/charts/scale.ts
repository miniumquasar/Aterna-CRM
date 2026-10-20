/**
 * The numbers behind the charts: plain functions, no React, so they are tested
 * on their own (tests/renderer/oracle.test.ts).
 *
 * Colours were chosen with the data-visualisation method's validator, against
 * the dark card surface the charts sit on (#0a050c, the void with 2% white):
 *
 *   series    slot 1 blue #3987e5 for a single series; orange and aqua next
 *   heat      five steps of the same blue, dark (few) to light (many) — on a
 *             dark surface "few" recedes towards it. One hue, lightness
 *             monotone, the darkest step clears 2:1 against the surface.
 *   status    critical #d03b3b, always with an icon and a word beside it
 */

export const VIZ = {
  series: ['#3987e5', '#d95926', '#199e70'] as const,
  /** Slot 1, one step lighter: a hovered column. */
  seriesHover: '#5598e7',
  heat: ['#104281', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef'] as const,
  critical: '#d03b3b',
  grid: 'rgba(255,255,255,0.07)',
  baseline: 'rgba(255,255,255,0.16)',
  muted: '#898781',
  ink: 'rgba(255,255,255,0.88)',
  inkDark: '#0b0b0b'
} as const

/** Which of the five heat steps a count takes, 0 being none at all. Steps are even fifths of the largest count. */
export function heatStep(count: number, max: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (!(count > 0) || !(max > 0)) return 0
  const step = Math.ceil((Math.min(count, max) / max) * 5)
  return Math.max(1, Math.min(5, step)) as 1 | 2 | 3 | 4 | 5
}

/** The fill and text colour of a heat cell: dark text on the two lightest steps. */
export function heatColours(step: number): { fill: string; text: string } | null {
  if (step < 1 || step > 5) return null
  return { fill: VIZ.heat[step - 1], text: step >= 4 ? VIZ.inkDark : VIZ.ink }
}

/**
 * 950 → "950", 1200 → "1.2K", 1250 → "1.25K", 2000000 → "2M": axis ticks from
 * a thousand up. Two decimals at most, so a tick at 1,250 never reads "1.3K".
 */
export function compactNumber(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const short = (v: number, unit: string): string => `${sign}${Number(v.toFixed(2))}${unit}`
  if (abs >= 1_000_000) return short(Math.round(abs / 10_000) / 100, 'M')
  if (abs >= 1_000) return short(Math.round(abs / 10) / 100, 'K')
  return `${sign}${Math.round(abs)}`
}

/**
 * Pence as a short axis label: 120000 → "£1.2K", 9900 → "£99", and 50 →
 * "£0.50" when a small scale steps in pence, so two ticks never share a label.
 */
export function compactPounds(pence: number): string {
  const sign = pence < 0 ? '-' : ''
  const pounds = Math.abs(pence) / 100
  if (pounds < 1_000 && !Number.isInteger(pounds)) return `${sign}£${pounds.toFixed(2)}`
  return `${sign}£${compactNumber(Math.round(pounds))}`
}

/** "Oct", with the year on January and on the first month shown: "Oct 2026", "Nov", … "Jan 2027". */
export function monthTick(label: string, index: number): string {
  const [month, year] = label.split(' ')
  return index === 0 || month === 'Jan' ? `${month} ${year}` : month
}

/** The index of the largest value, or -1 when every value is 0. Ties go to the first. */
export function peakIndex(values: readonly number[]): number {
  let best = -1
  values.forEach((v, i) => {
    if (v > 0 && (best < 0 || v > values[best])) best = i
  })
  return best
}

/** A round top for an axis: 0 → 1, 7 → 8, 78 → 80, 1234 → 1500. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(max))
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const top = step * power
    if (top >= max) return power >= 1 ? top : Math.ceil(top)
  }
  return 10 * power
}
