/**
 * Colour maths for the theme, ported from the palette study's validator
 * (docs/design/validate.py): parsing, source-over compositing, WCAG
 * contrast, OKLab / OKLCH, CIEDE2000 and colour-vision simulation.
 *
 * The theme engine uses parse / over / channels to flatten glass into
 * opaque colours (Reduce transparency, print); the palette tests use the
 * rest to hold every palette to the study's thresholds. Pure functions, no
 * DOM, so main, renderer and tests share them.
 */

/** Red, green and blue from 0 to 255, and alpha from 0 to 1. */
export type Rgba = readonly [number, number, number, number]

const HEX = /^#([0-9a-f]{6})$/i
const RGBA = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i

/** '#rrggbb' or 'rgba(r, g, b, a)' → [r, g, b, a]. Throws for anything else. */
export function parseColour(colour: string): Rgba {
  const c = colour.trim()
  const hex = HEX.exec(c)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const m = RGBA.exec(c)
  if (!m) throw new RangeError(`“${colour}” isn’t a #rrggbb or rgba() colour.`)
  const a = m[4] === undefined ? 1 : Number(m[4])
  return [Number(m[1]), Number(m[2]), Number(m[3]), a]
}

export function isColour(colour: string): boolean {
  try {
    parseColour(colour)
    return true
  } catch {
    return false
  }
}

/** Rounds half to even, as Python's round() does, so flattened colours match the study's hexes exactly. */
function roundHalfEven(v: number): number {
  const r = Math.round(v)
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
}

const clampByte = (v: number): number => Math.max(0, Math.min(255, roundHalfEven(v)))

/** [r, g, b, …] → '#rrggbb' (alpha dropped). */
export function toHex(rgb: Rgba | readonly number[]): string {
  return `#${[rgb[0], rgb[1], rgb[2]].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('')}`
}

/** A colour's red, green and blue as 'R G B', for `rgb(var(--x) / alpha)`. */
export function channels(colour: string | Rgba): string {
  const [r, g, b] = typeof colour === 'string' ? parseColour(colour) : colour
  return `${clampByte(r)} ${clampByte(g)} ${clampByte(b)}`
}

/** A colour's alpha, 0 to 1 (1 for '#rrggbb'). */
export function alphaOf(colour: string): number {
  return parseColour(colour)[3]
}

/** The colour with its alpha multiplied by `k`, never above 0.96 (so glass stays glass). */
export function scaleAlpha(colour: string | Rgba, k: number): Rgba {
  const [r, g, b, a] = typeof colour === 'string' ? parseColour(colour) : colour
  return [r, g, b, Math.min(0.96, a * k)]
}

/** Source-over: `top` (translucent or not) laid on an opaque `bottom`. The result is opaque. */
export function over(top: string | Rgba, bottom: string | Rgba): Rgba {
  const t = typeof top === 'string' ? parseColour(top) : top
  const b = typeof bottom === 'string' ? parseColour(bottom) : bottom
  const a = t[3]
  return [a * t[0] + (1 - a) * b[0], a * t[1] + (1 - a) * b[1], a * t[2] + (1 - a) * b[2], 1]
}

// ── Luminance and contrast (WCAG 2) ────────────────────────────────────────

const toLinear = (v: number): number => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function linear(colour: string | Rgba): [number, number, number] {
  const p = typeof colour === 'string' ? parseColour(colour) : colour
  return [toLinear(p[0]), toLinear(p[1]), toLinear(p[2])]
}

export function luminance(colour: string | Rgba): number {
  const [r, g, b] = linear(colour)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1 to 21. Both colours are taken as opaque. */
export function contrast(a: string | Rgba, b: string | Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// ── OKLab / OKLCH ──────────────────────────────────────────────────────────

function oklabFromLinear(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}

/** [L 0–1, C, h degrees]. */
export function oklch(colour: string | Rgba): [number, number, number] {
  const [L, a, b] = oklabFromLinear(...linear(colour))
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360]
}

// ── Colour-vision simulation (Machado, Oliveira and Fernandes 2009, severity 1) ──

export type Vision = 'normal' | 'protan' | 'deutan' | 'tritan'
export const VISIONS: readonly Vision[] = ['normal', 'protan', 'deutan', 'tritan']

type Matrix = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]]
const MACHADO: Record<Exclude<Vision, 'normal'>, Matrix> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998]
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881]
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039]
  ]
}

function simulated(colour: string | Rgba, vision: Vision): [number, number, number] {
  const rgb = linear(colour)
  if (vision === 'normal') return rgb
  const M = MACHADO[vision]
  const clamp = (v: number): number => Math.max(0, Math.min(1, v))
  return [0, 1, 2].map((i) => clamp(M[i][0] * rgb[0] + M[i][1] * rgb[1] + M[i][2] * rgb[2])) as [number, number, number]
}

// ── CIE Lab and ΔE2000 ─────────────────────────────────────────────────────

function labFromLinear(r: number, g: number, b: number): [number, number, number] {
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const rad = (d: number): number => (d * Math.PI) / 180
const deg = (r: number): number => (r * 180) / Math.PI

/** CIEDE2000 colour difference, optionally as seen with a colour-vision deficiency. */
export function deltaE2000(c1: string | Rgba, c2: string | Rgba, vision: Vision = 'normal'): number {
  const [L1, a1, b1] = labFromLinear(...simulated(c1, vision))
  const [L2, a2, b2] = labFromLinear(...simulated(c2, vision))
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cm = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const h1p = a1p || b1 ? (deg(Math.atan2(b1, a1p)) + 360) % 360 : 0
  const h2p = a2p || b2 ? (deg(Math.atan2(b2, a2p)) + 360) % 360 : 0
  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2))
  const Lpm = (L1 + L2) / 2
  const Cpm = (C1p + C2p) / 2
  let hpm: number
  if (C1p * C2p === 0) hpm = h1p + h2p
  else if (Math.abs(h1p - h2p) <= 180) hpm = (h1p + h2p) / 2
  else if (h1p + h2p < 360) hpm = (h1p + h2p + 360) / 2
  else hpm = (h1p + h2p - 360) / 2
  const T = 1 - 0.17 * Math.cos(rad(hpm - 30)) + 0.24 * Math.cos(rad(2 * hpm)) + 0.32 * Math.cos(rad(3 * hpm + 6)) - 0.2 * Math.cos(rad(4 * hpm - 63))
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2)
  const Sc = 1 + 0.045 * Cpm
  const Sh = 1 + 0.015 * Cpm * T
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))
}

/** OKLab distance × 100 (the dataviz rules' ΔE), optionally under a colour-vision deficiency. */
export function deltaEOk(c1: string | Rgba, c2: string | Rgba, vision: Vision = 'normal'): number {
  const p = oklabFromLinear(...simulated(c1, vision))
  const q = oklabFromLinear(...simulated(c2, vision))
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}
