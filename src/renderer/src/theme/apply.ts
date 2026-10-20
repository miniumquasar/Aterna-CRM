/**
 * Writes a theme onto <html>: the palette's tokens as CSS variables, and
 * data attributes the styles key off — data-mode (day | night), data-palette,
 * data-scheme (light | dark), data-effects, data-motion, data-transparency.
 */
import { resolveMode, type AppearancePrefs } from '@shared/theme/appearance'
import { tokensFor, type ResolvedMode } from '@shared/theme/palettes'
import { themeVariables } from '@shared/theme/variables'

export function applyTheme(root: HTMLElement, prefs: AppearancePrefs, mode: ResolvedMode, systemReducedMotion = false): void {
  const tokens = tokensFor(prefs.palette, mode)
  for (const [name, value] of Object.entries(themeVariables(tokens))) root.style.setProperty(name, value)
  root.dataset.mode = mode
  root.dataset.palette = prefs.palette
  root.dataset.scheme = tokens.scheme
  root.dataset.effects = prefs.effects
  root.dataset.motion = prefs.reduceMotion || systemReducedMotion ? 'reduce' : 'full'
  root.dataset.transparency = prefs.reduceTransparency ? 'reduce' : 'full'
  root.style.colorScheme = tokens.scheme
}

/** The mode for the first paint, before React runs. */
export function initialMode(prefs: AppearancePrefs): ResolvedMode {
  const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return resolveMode(prefs.mode, !!dark)
}
