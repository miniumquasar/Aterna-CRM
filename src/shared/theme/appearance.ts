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
/** Full glass; Balanced (lighter blur); Lite (no blur, for modest PCs). */
export type EffectsLevel = (typeof EFFECTS_LEVELS)[number]

export interface AppearancePrefs {
  mode: ThemeMode
  palette: PaletteId
  effects: EffectsLevel
  reduceMotion: boolean
  reduceTransparency: boolean
}

export const DEFAULT_APPEARANCE: Readonly<AppearancePrefs> = Object.freeze({
  mode: 'auto',
  palette: DEFAULT_PALETTE,
  effects: 'full',
  reduceMotion: false,
  reduceTransparency: false
})

export const MODE_LABELS: Record<ThemeMode, string> = { day: 'Day', night: 'Night', auto: 'Auto' }
export const EFFECTS_LABELS: Record<EffectsLevel, string> = { full: 'Full', balanced: 'Balanced', lite: 'Lite' }

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value)
}

export function isEffectsLevel(value: unknown): value is EffectsLevel {
  return typeof value === 'string' && (EFFECTS_LEVELS as readonly string[]).includes(value)
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
    reduceMotion: typeof v.reduceMotion === 'boolean' ? v.reduceMotion : base.reduceMotion,
    reduceTransparency: typeof v.reduceTransparency === 'boolean' ? v.reduceTransparency : base.reduceTransparency
  }
}

/** Day or Night: Auto follows the operating system. */
export function resolveMode(mode: ThemeMode, osPrefersDark: boolean): ResolvedMode {
  if (mode === 'auto') return osPrefersDark ? 'night' : 'day'
  return mode
}
