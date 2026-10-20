/**
 * Appearance handlers. Owned by the design domain. Saving also recolours the
 * window behind the page and its window controls; a job tells the renderer
 * when Windows switches between light and dark, for Auto.
 */
import { nativeTheme } from 'electron'
import { isEffectsLevel, isThemeMode } from '@shared/theme/appearance'
import { isPaletteId } from '@shared/theme/palettes'
import { applyWindowTheme } from '../app/window'
import { registerJob } from '../jobs'
import { readAppearance, saveAppearance, windowColours } from '../preferences/appearance'
import { invalid } from './errors'
import { handle } from './registry'

/** Whether Windows (or the OS) is in dark mode; false where Electron isn't running (tests). */
export function osPrefersDark(): boolean {
  return nativeTheme?.shouldUseDarkColors ?? false
}

export function registerAppearanceHandlers(): void {
  handle('appearance.get', (_req, ctx) => readAppearance(ctx.db))

  handle('appearance.set', (req, ctx) => {
    const patch = req && typeof req === 'object' ? req : {}
    if (patch.mode !== undefined && !isThemeMode(patch.mode)) throw invalid('Choose Day, Night or Auto.', 'mode')
    if (patch.palette !== undefined && !isPaletteId(patch.palette)) throw invalid('That colour theme isn’t available.', 'palette')
    if (patch.effects !== undefined && !isEffectsLevel(patch.effects)) throw invalid('Choose Full, Balanced or Lite effects.', 'effects')
    const prefs = saveAppearance(ctx.db, patch)
    applyWindowTheme(windowColours(prefs, osPrefersDark()))
    return prefs
  })

  registerJob({
    name: 'appearance.osTheme',
    start({ db, emit }) {
      const onUpdated = (): void => {
        const dark = osPrefersDark()
        emit('appearance.osChanged', { dark })
        applyWindowTheme(windowColours(readAppearance(db), dark))
      }
      nativeTheme.on('updated', onUpdated)
      return () => nativeTheme.off('updated', onUpdated)
    }
  })
}
