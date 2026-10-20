/**
 * Whether movement should be reduced: the app's Reduce motion setting or the
 * computer's. Works outside a ThemeProvider too (then it reads <html>).
 */
import { useContext } from 'react'
import { ThemeContext } from './context'

export function useReducedMotion(): boolean {
  const theme = useContext(ThemeContext)
  if (theme) return theme.reducedMotion
  return typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduce'
}

/** Whether the pointer highlight and other Full-only touches may run (Full effects, motion and transparency on). */
export function useFullEffects(): boolean {
  const theme = useContext(ThemeContext)
  if (!theme) return false
  return theme.prefs.effects === 'full' && !theme.reducedMotion && !theme.reducedTransparency
}
