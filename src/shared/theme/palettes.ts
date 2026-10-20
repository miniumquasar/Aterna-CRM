/**
 * Colour themes as pure data. The main process uses them for the window
 * background (no white flash at start-up); the renderer writes them to CSS
 * variables on <html data-mode data-palette>, and Tailwind's colours read
 * those variables, so no component hard-codes a colour.
 *
 * Each palette has a token set for Day and for Night. These are first-pass
 * values; the design domain replaces them after its palette study
 * (docs/design/PALETTES.md), keeping these names and this shape.
 */

export const PALETTE_IDS = ['burgundy', 'sapphire', 'emerald', 'graphite', 'indigo'] as const
export type PaletteId = (typeof PALETTE_IDS)[number]

export const DEFAULT_PALETTE: PaletteId = 'burgundy'

/** The two modes a palette defines. Auto resolves to one of them. */
export type ResolvedMode = 'day' | 'night'

/** Colours are '#rrggbb'. Alphas are 0 to 1. */
export interface ModeTokens {
  /** 'light' or 'dark', for the browser's own controls (scrollbars, date pickers). */
  scheme: 'light' | 'dark'
  /** A solid colour for the window behind the page: the backdrop's first stop. */
  window: string
  /** The backdrop gradient, from top left to bottom right. */
  backdrop: readonly [string, string, string]
  /** Two soft glows laid over the backdrop. */
  glow: readonly [string, string]
  /** Glass surfaces (panels, cards). */
  surface: string
  surfaceAlpha: number
  /** Raised glass (dialogs, menus, the command palette). */
  surfaceRaised: string
  surfaceRaisedAlpha: number
  /** Hairline borders. */
  border: string
  borderAlpha: number
  /** The inner highlight along a surface's top edge. */
  highlight: string
  highlightAlpha: number
  /** The colour soft depth shadows are drawn in. */
  shadow: string
  /** Text: body, secondary and the quietest level that still meets contrast. */
  text: string
  textMuted: string
  textSubtle: string
  /** The brand accent as a fill, the text drawn on it, and accent-coloured text on surfaces. */
  accent: string
  onAccent: string
  accentText: string
  /** The second accent. */
  accent2: string
  success: string
  warning: string
  danger: string
  info: string
  /** The keyboard focus ring. */
  focus: string
  /** Categorical chart colours, in order of use. */
  chart: readonly string[]
}

export interface Palette {
  id: PaletteId
  /** The name in Settings → Appearance. */
  name: string
  /** One line about the theme. */
  description: string
  day: ModeTokens
  night: ModeTokens
}

const burgundy: Palette = {
  id: 'burgundy',
  name: 'Burgundy & Slate',
  description: 'Deep oxblood into slate, with a rose-crimson accent. The default.',
  day: {
    scheme: 'light',
    window: '#f7f1f4',
    backdrop: ['#f7f1f4', '#f3e8ee', '#eef1f6'],
    glow: ['#f2c6d4', '#d7deea'],
    surface: '#ffffff',
    surfaceAlpha: 0.66,
    surfaceRaised: '#ffffff',
    surfaceRaisedAlpha: 0.9,
    border: '#6b2a43',
    borderAlpha: 0.14,
    highlight: '#ffffff',
    highlightAlpha: 0.85,
    shadow: '#4a1027',
    text: '#22121a',
    textMuted: '#5b4651',
    textSubtle: '#76626c',
    accent: '#9f1239',
    onAccent: '#ffffff',
    accentText: '#9f1239',
    accent2: '#475569',
    success: '#15803d',
    warning: '#b45309',
    danger: '#b91c1c',
    info: '#1d4ed8',
    focus: '#be123c',
    chart: ['#9f1239', '#475569', '#0f766e', '#b45309', '#6d28d9', '#0369a1', '#be185d', '#4d7c0f']
  },
  night: {
    scheme: 'dark',
    window: '#1a0610',
    backdrop: ['#1a0610', '#2a0a18', '#0f1724'],
    glow: ['#9f1239', '#334155'],
    surface: '#2a1220',
    surfaceAlpha: 0.48,
    surfaceRaised: '#2b1421',
    surfaceRaisedAlpha: 0.9,
    border: '#f5d0dc',
    borderAlpha: 0.12,
    highlight: '#ffffff',
    highlightAlpha: 0.08,
    shadow: '#000000',
    text: '#f6eef2',
    textMuted: '#cdb8c2',
    textSubtle: '#a8919c',
    accent: '#be123c',
    onAccent: '#ffffff',
    accentText: '#fb7f9b',
    accent2: '#94a3b8',
    success: '#4ade80',
    warning: '#fbbf24',
    danger: '#f87171',
    info: '#60a5fa',
    focus: '#fda4af',
    chart: ['#fb7185', '#94a3b8', '#2dd4bf', '#fbbf24', '#a78bfa', '#38bdf8', '#f472b6', '#a3e635']
  }
}

const sapphire: Palette = {
  id: 'sapphire',
  name: 'Sapphire',
  description: 'Midnight navy with a clear sapphire accent.',
  day: {
    scheme: 'light',
    window: '#f2f5fb',
    backdrop: ['#f2f5fb', '#e8eef9', '#eef2f7'],
    glow: ['#c7d7f5', '#dbe4f0'],
    surface: '#ffffff',
    surfaceAlpha: 0.66,
    surfaceRaised: '#ffffff',
    surfaceRaisedAlpha: 0.9,
    border: '#1e3a8a',
    borderAlpha: 0.14,
    highlight: '#ffffff',
    highlightAlpha: 0.85,
    shadow: '#0b1e4f',
    text: '#0f172a',
    textMuted: '#3f4a5e',
    textSubtle: '#5b6578',
    accent: '#1d4ed8',
    onAccent: '#ffffff',
    accentText: '#1d4ed8',
    accent2: '#0f766e',
    success: '#15803d',
    warning: '#b45309',
    danger: '#b91c1c',
    info: '#0369a1',
    focus: '#2563eb',
    chart: ['#1d4ed8', '#0f766e', '#b45309', '#9f1239', '#6d28d9', '#475569', '#0369a1', '#4d7c0f']
  },
  night: {
    scheme: 'dark',
    window: '#06122a',
    backdrop: ['#06122a', '#0b1e3f', '#0f1724'],
    glow: ['#1d4ed8', '#0f766e'],
    surface: '#13254a',
    surfaceAlpha: 0.48,
    surfaceRaised: '#14284f',
    surfaceRaisedAlpha: 0.9,
    border: '#bfdbfe',
    borderAlpha: 0.12,
    highlight: '#ffffff',
    highlightAlpha: 0.08,
    shadow: '#000000',
    text: '#eef3fb',
    textMuted: '#b8c4d8',
    textSubtle: '#91a0b8',
    accent: '#2563eb',
    onAccent: '#ffffff',
    accentText: '#7fb0ff',
    accent2: '#2dd4bf',
    success: '#4ade80',
    warning: '#fbbf24',
    danger: '#f87171',
    info: '#38bdf8',
    focus: '#93c5fd',
    chart: ['#60a5fa', '#2dd4bf', '#fbbf24', '#fb7185', '#a78bfa', '#94a3b8', '#38bdf8', '#a3e635']
  }
}

const emerald: Palette = {
  id: 'emerald',
  name: 'Emerald & Gold',
  description: 'Forest green with antique gold.',
  day: {
    scheme: 'light',
    window: '#f1f6f3',
    backdrop: ['#f1f6f3', '#e7f1eb', '#f5f2e8'],
    glow: ['#c4e3d2', '#efe2bf'],
    surface: '#ffffff',
    surfaceAlpha: 0.66,
    surfaceRaised: '#ffffff',
    surfaceRaisedAlpha: 0.9,
    border: '#064e3b',
    borderAlpha: 0.14,
    highlight: '#ffffff',
    highlightAlpha: 0.85,
    shadow: '#05281e',
    text: '#0f1f18',
    textMuted: '#3d5047',
    textSubtle: '#58695f',
    accent: '#047857',
    onAccent: '#ffffff',
    accentText: '#047857',
    accent2: '#8a6514',
    success: '#15803d',
    warning: '#b45309',
    danger: '#b91c1c',
    info: '#1d4ed8',
    focus: '#059669',
    chart: ['#047857', '#8a6514', '#1d4ed8', '#9f1239', '#6d28d9', '#475569', '#0369a1', '#c2410c']
  },
  night: {
    scheme: 'dark',
    window: '#03140f',
    backdrop: ['#03140f', '#062a1f', '#0f1724'],
    glow: ['#047857', '#a16207'],
    surface: '#0d2a20',
    surfaceAlpha: 0.48,
    surfaceRaised: '#0f2e23',
    surfaceRaisedAlpha: 0.9,
    border: '#bbf7d0',
    borderAlpha: 0.12,
    highlight: '#ffffff',
    highlightAlpha: 0.08,
    shadow: '#000000',
    text: '#eef7f1',
    textMuted: '#b9cfc2',
    textSubtle: '#93ab9d',
    accent: '#059669',
    onAccent: '#ffffff',
    accentText: '#5fd4a4',
    accent2: '#e0b44c',
    success: '#4ade80',
    warning: '#fbbf24',
    danger: '#f87171',
    info: '#60a5fa',
    focus: '#6ee7b7',
    chart: ['#34d399', '#e0b44c', '#60a5fa', '#fb7185', '#a78bfa', '#94a3b8', '#38bdf8', '#fb923c']
  }
}

const graphite: Palette = {
  id: 'graphite',
  name: 'Graphite & Copper',
  description: 'Charcoal and warm copper.',
  day: {
    scheme: 'light',
    window: '#f4f3f1',
    backdrop: ['#f4f3f1', '#eceae6', '#f1efec'],
    glow: ['#e7d2c2', '#dcdcdc'],
    surface: '#ffffff',
    surfaceAlpha: 0.68,
    surfaceRaised: '#ffffff',
    surfaceRaisedAlpha: 0.92,
    border: '#292524',
    borderAlpha: 0.14,
    highlight: '#ffffff',
    highlightAlpha: 0.85,
    shadow: '#1c1917',
    text: '#1c1917',
    textMuted: '#4a4542',
    textSubtle: '#66605c',
    accent: '#a2490f',
    onAccent: '#ffffff',
    accentText: '#a2490f',
    accent2: '#44403c',
    success: '#15803d',
    warning: '#a16207',
    danger: '#b91c1c',
    info: '#1d4ed8',
    focus: '#c2410c',
    chart: ['#a2490f', '#44403c', '#0f766e', '#1d4ed8', '#9f1239', '#6d28d9', '#a16207', '#4d7c0f']
  },
  night: {
    scheme: 'dark',
    window: '#111214',
    backdrop: ['#111214', '#1c1d21', '#16181c'],
    glow: ['#b45309', '#3f3f46'],
    surface: '#26272b',
    surfaceAlpha: 0.52,
    surfaceRaised: '#28292e',
    surfaceRaisedAlpha: 0.92,
    border: '#fde4d0',
    borderAlpha: 0.11,
    highlight: '#ffffff',
    highlightAlpha: 0.07,
    shadow: '#000000',
    text: '#f4f2ef',
    textMuted: '#c4bfba',
    textSubtle: '#a19b95',
    accent: '#c2560f',
    onAccent: '#ffffff',
    accentText: '#f59e5b',
    accent2: '#a8a29e',
    success: '#4ade80',
    warning: '#fbbf24',
    danger: '#f87171',
    info: '#60a5fa',
    focus: '#fdba74',
    chart: ['#f59e5b', '#a8a29e', '#2dd4bf', '#60a5fa', '#fb7185', '#a78bfa', '#fbbf24', '#a3e635']
  }
}

const indigo: Palette = {
  id: 'indigo',
  name: 'Indigo',
  description: 'Ink-blue indigo with a violet glow.',
  day: {
    scheme: 'light',
    window: '#f3f3fb',
    backdrop: ['#f3f3fb', '#ebeafb', '#eff1f7'],
    glow: ['#d3d0f7', '#dfe3f0'],
    surface: '#ffffff',
    surfaceAlpha: 0.66,
    surfaceRaised: '#ffffff',
    surfaceRaisedAlpha: 0.9,
    border: '#312e81',
    borderAlpha: 0.14,
    highlight: '#ffffff',
    highlightAlpha: 0.85,
    shadow: '#1e1b4b',
    text: '#14122e',
    textMuted: '#45436a',
    textSubtle: '#5f5d82',
    accent: '#4f46e5',
    onAccent: '#ffffff',
    accentText: '#4338ca',
    accent2: '#0e7490',
    success: '#15803d',
    warning: '#b45309',
    danger: '#b91c1c',
    info: '#1d4ed8',
    focus: '#6366f1',
    chart: ['#4f46e5', '#0e7490', '#b45309', '#9f1239', '#15803d', '#475569', '#7c3aed', '#c2410c']
  },
  night: {
    scheme: 'dark',
    window: '#0d0b24',
    backdrop: ['#0d0b24', '#1e1b4b', '#0f1724'],
    glow: ['#4f46e5', '#0e7490'],
    surface: '#1d1a45',
    surfaceAlpha: 0.48,
    surfaceRaised: '#201d4a',
    surfaceRaisedAlpha: 0.9,
    border: '#c7d2fe',
    borderAlpha: 0.12,
    highlight: '#ffffff',
    highlightAlpha: 0.08,
    shadow: '#000000',
    text: '#f0f0fb',
    textMuted: '#bdbde0',
    textSubtle: '#9998c0',
    accent: '#5b54e8',
    onAccent: '#ffffff',
    accentText: '#a5b4fc',
    accent2: '#22d3ee',
    success: '#4ade80',
    warning: '#fbbf24',
    danger: '#f87171',
    info: '#60a5fa',
    focus: '#a5b4fc',
    chart: ['#818cf8', '#22d3ee', '#fbbf24', '#fb7185', '#4ade80', '#94a3b8', '#c084fc', '#fb923c']
  }
}

export const PALETTES: Readonly<Record<PaletteId, Palette>> = Object.freeze({ burgundy, sapphire, emerald, graphite, indigo })

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && (PALETTE_IDS as readonly string[]).includes(value)
}

export function paletteFor(id: PaletteId | string | null | undefined): Palette {
  return isPaletteId(id) ? PALETTES[id] : PALETTES[DEFAULT_PALETTE]
}

export function tokensFor(id: PaletteId | string | null | undefined, mode: ResolvedMode): ModeTokens {
  return paletteFor(id)[mode]
}
