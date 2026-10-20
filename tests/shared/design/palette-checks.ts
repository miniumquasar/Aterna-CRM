/**
 * The palette study's validator (docs/design/validate.py), ported check for
 * check, so a change to a palette that breaks contrast or the chart rules
 * fails `npm test`. Every translucent layer is composited over the darkest
 * and lightest backdrop colours, both glows at full strength included, at
 * every glass level (Full, Balanced, Lite and Reduce transparency); the
 * worst case is the number that must pass.
 */
import { contrast, deltaE2000, deltaEOk, oklch, over, parseColour, scaleAlpha, VISIONS, type Rgba } from '@shared/theme/colour'
import type { PaletteStudy, StudyTokens } from '@shared/theme/palettes'

export const TOKEN_KEYS = [
  'backdropFrom', 'backdropVia', 'backdropTo', 'glowA', 'glowB',
  'surface', 'surfaceRaised', 'surfaceSunken', 'border', 'borderStrong',
  'highlight', 'shadow', 'text', 'textMuted', 'textFaint',
  'accent', 'accentHover', 'accentActive', 'accentFg', 'accentSoft', 'accent2',
  'accentGradientFrom', 'accentGradientTo', 'focus',
  'success', 'successSoft', 'warning', 'warningSoft', 'danger', 'dangerSoft',
  'info', 'infoSoft', 'chart', 'chartSequential', 'chartDiverging'
] as const

export type Effect = 'full' | 'balanced' | 'lite' | 'solid'
export const EFFECTS: ReadonlyArray<[Effect, number | null]> = [
  ['full', 0.85],
  ['balanced', 1],
  ['lite', 1.15],
  ['solid', null]
]

export const T = { textTarget: 7, textFloor: 4.5, muted: 4.5, faint: 3, ui: 3, focus: 4.5, deChart: 15, deAccentSemantic: 10 } as const

type Layer = [label: string, colour: Rgba]
interface Layers {
  surface: Layer[]
  raised: Layer[]
  sunken: Layer[]
  accentSoft: Layer[]
}

/** Every opaque colour each kind of text can sit on, at one effect level. */
export function layers(t: StudyTokens, effect: Effect): Layers {
  const k = EFFECTS.find(([e]) => e === effect)?.[1] ?? null
  const stops: Layer[] = [
    ['backdropFrom', parseColour(t.backdropFrom)],
    ['backdropVia', parseColour(t.backdropVia)],
    ['backdropTo', parseColour(t.backdropTo)]
  ]
  const bases: Layer[] = [...stops]
  for (const g of ['glowA', 'glowB'] as const) for (const [name, s] of stops) bases.push([`${g} over ${name}`, over(t[g], s)])
  let surface: Layer[]
  let raised: Layer[]
  if (effect === 'solid') {
    const s = over(t.surface, t.backdropVia)
    surface = [['solid surface', s]]
    raised = [['solid raised', over(t.surfaceRaised, s)]]
  } else {
    surface = bases.map(([n, b]) => [`surface over ${n}`, over(scaleAlpha(t.surface, k ?? 1), b)])
    raised = surface.map(([n, b]) => [`raised on ${n}`, over(scaleAlpha(t.surfaceRaised, k ?? 1), b)])
  }
  const both = [...surface, ...raised]
  return {
    surface,
    raised,
    sunken: both.map(([n, b]) => [`sunken on ${n}`, over(t.surfaceSunken, b)]),
    accentSoft: both.map(([n, b]) => [`accentSoft on ${n}`, over(t.accentSoft, b)])
  }
}

function worst(fg: string, bgs: readonly Layer[]): [number, string] {
  let best: [number, string] | null = null
  for (const [label, bg] of bgs) {
    const r = contrast(fg, bg)
    if (!best || r < best[0]) best = [r, label]
  }
  return best ?? [Infinity, '']
}

export interface CheckRow {
  palette: string
  mode: 'day' | 'night' | 'both'
  group: string
  name: string
  value: number
  threshold: number
  ok: boolean
  detail: string
}

export function checkPalette(p: PaletteStudy): CheckRow[] {
  const rows: CheckRow[] = []
  const add = (mode: CheckRow['mode'], group: string, name: string, value: number, threshold: number, ok: boolean, detail = ''): void => {
    rows.push({ palette: p.id, mode, group, name, value, threshold, ok, detail })
  }

  // Colour follows the entity: slot i is the same hue family in Day and Night.
  let worstDh = 0
  let where = ''
  for (const key of ['chart', 'chartSequential', 'chartDiverging'] as const) {
    p.day[key].forEach((a, i) => {
      const b = p.night[key][i]
      const la = oklch(a)
      const lb = oklch(b)
      if (Math.min(la[1], lb[1]) < 0.03) return
      const dh = Math.abs(((la[2] - lb[2] + 540) % 360) - 180)
      if (dh > worstDh) {
        worstDh = dh
        where = `${key}[${i + 1}] ${a} / ${b}`
      }
    })
  }
  add('both', 'chart', 'slot hue day vs night (<= 25 deg)', worstDh, 25, worstDh <= 25, where)

  for (const mode of ['day', 'night'] as const) {
    const t = p[mode]
    const worstAll = (colour: string, where: ReadonlyArray<keyof Layers> = ['surface', 'raised']): [number, string] => {
      let lo: [number, string] | null = null
      for (const [eff] of EFFECTS) {
        const L = layers(t, eff)
        const r = worst(colour, where.flatMap((w) => L[w]))
        if (!lo || r[0] < lo[0]) lo = [r[0], `${eff}: ${r[1]}`]
      }
      return lo ?? [Infinity, '']
    }

    // Text tiers on every layer, every effect level.
    const all = ['surface', 'raised', 'sunken', 'accentSoft'] as const
    const text = worstAll(t.text, all)
    add(mode, 'text', 'text', text[0], T.textFloor, text[0] >= T.textFloor, text[1])
    add(mode, 'text', 'text (target 7:1)', text[0], T.textTarget, text[0] >= T.textTarget, text[1])
    const muted = worstAll(t.textMuted, all)
    add(mode, 'text', 'textMuted', muted[0], T.muted, muted[0] >= T.muted, muted[1])
    const faint = worstAll(t.textFaint, all)
    add(mode, 'text', 'textFaint', faint[0], T.faint, faint[0] >= T.faint, faint[1])

    // Accent.
    for (const key of ['accent', 'accentHover', 'accentActive', 'accentGradientFrom', 'accentGradientTo'] as const) {
      const r = contrast(t.accentFg, t[key])
      add(mode, 'accent', `accentFg on ${key}`, r, 4.5, r >= 4.5)
    }
    const ui = worstAll(t.accent, ['surface'])
    add(mode, 'accent', 'accent as UI graphic vs surface', ui[0], T.ui, ui[0] >= T.ui, ui[1])
    const focus = worstAll(t.focus)
    add(mode, 'accent', 'focus ring vs surface (>=3)', focus[0], T.ui, focus[0] >= T.ui, focus[1])
    add(mode, 'accent', 'focus as accent text (>=4.5)', focus[0], T.focus, focus[0] >= T.focus, focus[1])
    const a2 = worstAll(t.accent2)
    add(mode, 'accent', 'accent2 as graphic vs surface', a2[0], T.ui, a2[0] >= T.ui, a2[1])
    for (const s of ['success', 'warning', 'danger', 'info'] as const) {
      const d = deltaE2000(t.accent, t[s])
      add(mode, 'accent', `accent vs ${s} dE2000`, d, T.deAccentSemantic, d >= T.deAccentSemantic)
    }

    // Semantic colours as text on the surface, a raised card and their own soft tint.
    for (const s of ['success', 'warning', 'danger', 'info'] as const) {
      let lo: [number, string] | null = null
      for (const [eff] of EFFECTS) {
        const L = layers(t, eff)
        const base = [...L.surface, ...L.raised]
        const bgs: Layer[] = [...base, ...base.map(([n, b]): Layer => [`${s}Soft on ${n}`, over(t[`${s}Soft`], b)])]
        const r = worst(t[s], bgs)
        if (!lo || r[0] < lo[0]) lo = [r[0], `${eff}: ${r[1]}`]
      }
      if (lo) add(mode, 'semantic', `${s} as text (>=4.5)`, lo[0], 4.5, lo[0] >= 4.5, lo[1])
    }

    // Chart: contrast, and adjacent pairs under four visions.
    const chart = t.chart
    chart.forEach((c, i) => {
      const r = worstAll(c)
      add(mode, 'chart', `chart[${i + 1}] ${c} vs surface`, r[0], 3, r[0] >= 3, r[1])
    })
    for (const v of VISIONS) {
      let d = Infinity
      let at = 0
      for (let i = 0; i < chart.length - 1; i++) {
        const e = deltaE2000(chart[i], chart[i + 1], v)
        if (e < d) {
          d = e
          at = i
        }
      }
      add(mode, 'chart', `adjacent dE2000 ${v}`, d, T.deChart, d >= T.deChart, `worst ${at + 1}-${at + 2} ${chart[at]}/${chart[at + 1]}`)
    }

    // The dataviz rules: lightness band, chroma floor, OKLab distance.
    const band = mode === 'day' ? [0.43, 0.77] : [0.48, 0.67]
    const Ls = chart.map((c) => oklch(c)[0])
    const Cs = chart.map((c) => oklch(c)[1])
    add(mode, 'chart-skill', `OKLCH L in band ${band.join('-')}`, Math.min(...Ls), band[0], Ls.every((x) => x >= band[0] && x <= band[1]), `L ${Math.min(...Ls).toFixed(3)}-${Math.max(...Ls).toFixed(3)}`)
    add(mode, 'chart-skill', 'OKLCH chroma >= 0.10', Math.min(...Cs), 0.1, Math.min(...Cs) >= 0.1)
    const pairs = chart.slice(0, -1).map((c, i) => [c, chart[i + 1]] as const)
    const dn = Math.min(...pairs.map(([a, b]) => deltaEOk(a, b)))
    add(mode, 'chart-skill', 'OKLab dE normal >= 15', dn, 15, dn >= 15)
    const dc = Math.min(...pairs.flatMap(([a, b]) => [deltaEOk(a, b, 'protan'), deltaEOk(a, b, 'deutan')]))
    add(mode, 'chart-skill', 'OKLab dE protan/deutan >= 8', dc, 8, dc >= 8)

    // Sequential: one hue, light to dark, evenly stepped, the near end visible.
    const seq = t.chartSequential
    const sL = seq.map((c) => oklch(c)[0])
    const mono = sL.every((x, i) => i === 0 || sL[i - 1] > x)
    add(mode, 'scales', 'sequential light->dark monotone', mono ? 1 : 0, 1, mono, sL.map((x) => x.toFixed(2)).join(' '))
    const gap = Math.min(...sL.slice(1).map((x, i) => sL[i] - x))
    add(mode, 'scales', 'sequential adjacent dL >= 0.06', gap, 0.06, gap >= 0.06)
    const hues = seq.filter((c) => oklch(c)[1] > 0.02).map((c) => oklch(c)[2])
    const spread = hues.length ? Math.max(...hues.flatMap((a) => hues.map((b) => Math.abs(((a - b + 540) % 360) - 180)))) : 0
    add(mode, 'scales', 'sequential single hue (spread <= 40)', spread, 40, spread <= 40)
    const near = mode === 'day' ? seq[0] : seq[seq.length - 1]
    const nr = worstAll(near)
    add(mode, 'scales', 'sequential step nearest surface >= 2', nr[0], 2, nr[0] >= 2, `${near}; ${nr[1]}`)

    // Diverging: grey midpoint, visible poles that differ in every vision, monotone arms.
    const dv = t.chartDiverging
    const mid = oklch(dv[2])
    add(mode, 'scales', 'diverging midpoint grey (C <= 0.03)', mid[1], 0.03, mid[1] <= 0.03)
    for (const i of [0, 4]) {
      const r = worstAll(dv[i])
      add(mode, 'scales', `diverging pole ${i + 1} vs surface`, r[0], 3, r[0] >= 3, r[1])
    }
    const dpol = Math.min(...VISIONS.map((v) => deltaE2000(dv[0], dv[4], v)))
    add(mode, 'scales', 'diverging poles dE2000 (all visions)', dpol, 15, dpol >= 15)
    const dinner = Math.min(...VISIONS.map((v) => deltaE2000(dv[1], dv[3], v)))
    add(mode, 'scales', 'diverging inner steps dE2000 (all visions)', dinner, 10, dinner >= 10)
    const dL = dv.map((c) => oklch(c)[0])
    const arms = mode === 'day' ? dL[0] < dL[1] && dL[1] < dL[2] && dL[4] < dL[3] && dL[3] < dL[2] : dL[0] > dL[1] && dL[1] > dL[2] && dL[4] > dL[3] && dL[3] > dL[2]
    add(mode, 'scales', 'diverging arms monotone to midpoint', arms ? 1 : 0, 1, arms, dL.map((x) => x.toFixed(2)).join(' '))
  }
  return rows
}

/** A failure as one readable line. */
export function explain(row: CheckRow): string {
  return `${row.palette} ${row.mode} ${row.group}: ${row.name} = ${row.value.toFixed(2)} (needs ${row.threshold}) ${row.detail}`.trim()
}
