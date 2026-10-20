/**
 * Appearance preferences: what Settings → Appearance saves for the person
 * using this PC. Shared, so the main process (window colours) and the
 * renderer (CSS variables) read them the same way.
 */
import { DEFAULT_PALETTE, isPaletteId, type PaletteId, type ResolvedMode } from './palettes'

export const THEME_MODES = ['day', 'night', 'auto'] as const
/** Day, Night, or Auto (follows Windows). */
export type ThemeMode = (typeof THEME_MODES)[number]

export const EFFECTS_LEVELS = ['full', 'balanced', 'lite'] as const
/** Full glass (deeper blur, grain, the pointer highlight); Balanced (the default); Lite (little blur, for modest PCs and remote sessions). */
export type EffectsLevel = (typeof EFFECTS_LEVELS)[number]

export const DENSITY_LEVELS = ['comfortable', 'compact'] as const
/** Comfortable (44px table rows) or Compact (32px rows and a third less card padding, for big ledgers). */
export type Density = (typeof DENSITY_LEVELS)[number]

export interface AppearancePrefs {
  mode: ThemeMode
  palette: PaletteId
  effects: EffectsLevel
  density: Density
  reduceMotion: boolean
  reduceTransparency: boolean
}

/** Burgundy & Slate, Auto and Balanced: the palette study's defaults. */
export const DEFAULT_APPEARANCE: Readonly<AppearancePrefs> = Object.freeze({
  mode: 'auto',
  palette: DEFAULT_PALETTE,
  effects: 'balanced',
  density: 'comfortable',
  reduceMotion: false,
  reduceTransparency: false
})

export const MODE_LABELS: Record<ThemeMode, string> = { day: 'Day', night: 'Night', auto: 'Auto' }
/** The line under each mode on its card, as in the brief. */
export const MODE_TAGLINES: Record<ThemeMode, string> = { day: 'Bright and crisp', night: 'Easy on the eyes', auto: 'Follows Windows' }
export const EFFECTS_LABELS: Record<EffectsLevel, string> = { full: 'Full', balanced: 'Balanced', lite: 'Lite' }
export const EFFECTS_TAGLINES: Record<EffectsLevel, string> = {
  full: 'Deeper glass, fine grain and a soft highlight that follows the pointer',
  balanced: 'Glass with a lighter blur, right for most PCs',
  lite: 'Little blur and no grain, for older PCs and remote desktops'
}
export const DENSITY_LABELS: Record<Density, string> = { comfortable: 'Comfortable', compact: 'Compact' }
export const DENSITY_TAGLINES: Record<Density, string> = {
  comfortable: 'Roomy rows that are easy to scan',
  compact: 'More rows on screen, for big ledgers and time sheets'
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value)
}

export function isEffectsLevel(value: unknown): value is EffectsLevel {
  return typeof value === 'string' && (EFFECTS_LEVELS as readonly string[]).includes(value)
}

export function isDensity(value: unknown): value is Density {
  return typeof value === 'string' && (DENSITY_LEVELS as readonly string[]).includes(value)
}

/**
 * A complete, valid preference set from anything stored or sent: known
 * fields are kept, anything missing or unrecognised falls back to `base`.
 */
export function normaliseAppearance(input: unknown, base: AppearancePrefs = DEFAULT_APPEARANCE): AppearancePrefs {
  const v = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  return {
    mode: isThemeMode(v.mode) ? v.mode : base.mode,
    palette: isPaletteId(v.palette) ? v.palette : base.palette,
    effects: isEffectsLevel(v.effects) ? v.effects : base.effects,
    density: isDensity(v.density) ? v.density : base.density,
    reduceMotion: typeof v.reduceMotion === 'boolean' ? v.reduceMotion : base.reduceMotion,
    reduceTransparency: typeof v.reduceTransparency === 'boolean' ? v.reduceTransparency : base.reduceTransparency
  }
}

/** Day or Night: Auto follows the operating system. */
export function resolveMode(mode: ThemeMode, osPrefersDark: boolean): ResolvedMode {
  if (mode === 'auto') return osPrefersDark ? 'night' : 'day'
  return mode
}
