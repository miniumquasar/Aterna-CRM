import { createContext, useContext } from 'react'
import type { AppearancePrefs } from '@shared/theme/appearance'
import type { ModeTokens, Palette, ResolvedMode } from '@shared/theme/palettes'

export interface ThemeContextValue {
  /** What the person chose (Auto included). */
  prefs: AppearancePrefs
  /** Day or Night, after Auto has followed the operating system. */
  mode: ResolvedMode
  palette: Palette
  /** The current palette's tokens for the current mode (hex and rgba strings, e.g. for chart libraries). */
  tokens: ModeTokens
  /** Whether movement should be reduced (the app's setting or the computer's). */
  reducedMotion: boolean
  /** Whether surfaces are opaque (the app's setting or the computer's). */
  reducedTransparency: boolean
  /** Whether the operating system is in dark mode (what Auto follows). */
  osDark: boolean
  /** Changes and saves some preferences; the screen updates at once. */
  setPrefs(patch: Partial<AppearancePrefs>): void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

/** The current theme. Must be used inside <ThemeProvider>. */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme() needs a <ThemeProvider> above it.')
  return value
}
