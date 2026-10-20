/**
 * Writes a theme onto <html>: the palette's tokens as CSS variables (at the
 * chosen glass level), and data attributes the styles key off —
 * data-mode (day | night), data-palette, data-scheme (light | dark),
 * data-effects (full | balanced | lite), data-density (comfortable |
 * compact), data-motion (full | reduce), data-transparency (full | reduce)
 * and data-theme once a theme is on (the page's own background waits for it,
 * so the window's colour shows until then and nothing flashes).
 *
 * Paper always gets the Day tokens with opaque surfaces: a print-only style
 * element carries them, marked important so they win over the screen's.
 */
import { resolveMode, type AppearancePrefs } from '@shared/theme/appearance'
import { tokensFor, type ResolvedMode } from '@shared/theme/palettes'
import { declarations, printVariables, themeVariables } from '@shared/theme/variables'

const PRINT_STYLE_ID = 'aeterna-print-theme'

export function applyTheme(root: HTMLElement, prefs: AppearancePrefs, mode: ResolvedMode, systemReducedMotion = false, systemReducedTransparency = false): void {
  const tokens = tokensFor(prefs.palette, mode)
  const reduceTransparency = prefs.reduceTransparency || systemReducedTransparency
  for (const [name, value] of Object.entries(themeVariables(tokens, { effects: prefs.effects, reduceTransparency }))) root.style.setProperty(name, value)
  root.dataset.mode = mode
  root.dataset.palette = prefs.palette
  root.dataset.scheme = tokens.scheme
  root.dataset.effects = prefs.effects
  root.dataset.density = prefs.density
  root.dataset.motion = prefs.reduceMotion || systemReducedMotion ? 'reduce' : 'full'
  root.dataset.transparency = reduceTransparency ? 'reduce' : 'full'
  root.dataset.theme = 'on'
  root.style.colorScheme = tokens.scheme
  applyPrintTheme(root.ownerDocument, prefs)
}

function applyPrintTheme(doc: Document | null, prefs: AppearancePrefs): void {
  if (!doc?.head) return
  let style = doc.getElementById(PRINT_STYLE_ID)
  if (!style) {
    style = doc.createElement('style')
    style.id = PRINT_STYLE_ID
    style.setAttribute('media', 'print')
    doc.head.appendChild(style)
  }
  const css = `:root { ${declarations(printVariables(tokensFor(prefs.palette, 'day')), true)} color-scheme: light !important; }`
  if (style.textContent !== css) style.textContent = css
}

/** The mode for the first paint, before React runs. */
export function initialMode(prefs: AppearancePrefs): ResolvedMode {
  const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return resolveMode(prefs.mode, !!dark)
}

/** Whether the computer asks for less movement or less transparency (read once, for the first paint). */
export function systemPreference(query: 'motion' | 'transparency'): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(query === 'motion' ? '(prefers-reduced-motion: reduce)' : '(prefers-reduced-transparency: reduce)').matches
}

interface ViewTransitionDocument {
  startViewTransition?: (update: () => void) => { finished: Promise<void> }
}

/**
 * Runs `update` (which must change the DOM synchronously) inside a view
 * transition, so a change of colour theme or mode cross-fades over 240 ms
 * instead of jumping. Skipped under reduced motion, and where the browser
 * has no view transitions.
 */
export function morph(update: () => void, reducedMotion: boolean): void {
  const doc = typeof document === 'undefined' ? null : (document as unknown as ViewTransitionDocument)
  if (reducedMotion || !doc?.startViewTransition) {
    update()
    return
  }
  try {
    doc.startViewTransition(update).finished.catch(() => undefined)
  } catch {
    update()
  }
}
