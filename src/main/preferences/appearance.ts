/**
 * Appearance preferences, saved per OS user in the settings table
 * ('appearance' / the OS user name), so the choice applies on the sign-in
 * screen too. Owned by the design domain; start-up calls readAppearance()
 * and windowColours() for the window's first paint, so keep their signatures.
 */
import { userInfo } from 'node:os'
import { normaliseAppearance, resolveMode, type AppearancePrefs } from '@shared/theme/appearance'
import { tokensFor } from '@shared/theme/palettes'
import type { Db } from '../db/connection'
import { getSetting, setSetting } from '../db/settings'

export const APPEARANCE_GROUP = 'appearance'

/** The OS account using this PC: preferences are kept per person at the computer. */
export function osUserKey(): string {
  try {
    return userInfo().username || 'default'
  } catch {
    return 'default'
  }
}

export function readAppearance(db: Db, user: string = osUserKey()): AppearancePrefs {
  return normaliseAppearance(getSetting(db, APPEARANCE_GROUP, user))
}

export function saveAppearance(db: Db, patch: Partial<AppearancePrefs>, user: string = osUserKey()): AppearancePrefs {
  const next = normaliseAppearance({ ...readAppearance(db, user), ...(patch && typeof patch === 'object' ? patch : {}) })
  setSetting(db, APPEARANCE_GROUP, user, next)
  return next
}

export interface WindowColours {
  /** The window's own background: the backdrop's middle colour, so there is no white flash before the page paints. */
  background: string
  /** The colour of the window controls (minimise, maximise, close) drawn over the title bar. */
  symbol: string
}

export function windowColours(prefs: AppearancePrefs, osPrefersDark: boolean): WindowColours {
  const tokens = tokensFor(prefs.palette, resolveMode(prefs.mode, osPrefersDark))
  return { background: tokens.window, symbol: tokens.text }
}
