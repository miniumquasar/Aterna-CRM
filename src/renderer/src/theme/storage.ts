/**
 * A copy of the appearance preferences in this browser profile, so the
 * first paint uses the saved theme with no flash. The database copy
 * (appearance.get) is the truth; this is only a cache, and works without it.
 */
import { DEFAULT_APPEARANCE, normaliseAppearance, type AppearancePrefs } from '@shared/theme/appearance'

const KEY = 'aeterna.appearance'

export function readCachedAppearance(): AppearancePrefs {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? normaliseAppearance(JSON.parse(raw)) : { ...DEFAULT_APPEARANCE }
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

export function cacheAppearance(prefs: AppearancePrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // Storage can be unavailable; the database still has the preference.
  }
}
