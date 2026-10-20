/**
 * Applies the saved appearance to the whole app and keeps it in step: the
 * database's preferences (appearance.get) are the truth, Auto follows the
 * operating system (prefers-color-scheme and the appearance.osChanged
 * event), and a change is shown at once — cross-fading when the colours
 * change, unless motion is reduced — and then saved.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { MotionConfig } from 'framer-motion'
import { normaliseAppearance, resolveMode, type AppearancePrefs } from '@shared/theme/appearance'
import { paletteFor } from '@shared/theme/palettes'
import { useApiEvent, useApiMutation, useApiQuery } from '../lib/api'
import { useMediaQuery } from '../lib/hooks'
import { toast } from '../components/ui/Toast'
import { applyTheme, morph } from './apply'
import { ThemeContext, type ThemeContextValue } from './context'
import { cacheAppearance, readCachedAppearance } from './storage'

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const saved = useApiQuery('appearance.get', undefined, { staleTime: Infinity })
  const [local, setLocal] = useState<AppearancePrefs | null>(null)
  const prefs = local ?? saved.data ?? readCachedAppearance()

  const mediaDark = useMediaQuery('(prefers-color-scheme: dark)')
  const [eventDark, setEventDark] = useState<boolean | null>(null)
  useApiEvent('appearance.osChanged', ({ dark }) => setEventDark(dark))
  const osDark = eventDark ?? mediaDark
  const systemReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const systemReducedTransparency = useMediaQuery('(prefers-reduced-transparency: reduce)')

  const mode = resolveMode(prefs.mode, osDark)
  const reducedMotion = prefs.reduceMotion || systemReducedMotion
  const reducedTransparency = prefs.reduceTransparency || systemReducedTransparency

  useLayoutEffect(() => {
    applyTheme(document.documentElement, prefs, mode, systemReducedMotion, systemReducedTransparency)
    cacheAppearance(prefs)
  }, [prefs, mode, systemReducedMotion, systemReducedTransparency])

  const save = useApiMutation('appearance.set', { invalidates: [] })
  const { mutate } = save

  const setPrefs = useCallback(
    (patch: Partial<AppearancePrefs>) => {
      const before = prefs
      const next = normaliseAppearance({ ...prefs, ...patch })
      const recolours = next.palette !== before.palette || resolveMode(next.mode, osDark) !== resolveMode(before.mode, osDark)
      // A new palette or mode cross-fades (the update must land inside the transition, hence flushSync).
      if (recolours) morph(() => flushSync(() => setLocal(next)), reducedMotion || next.reduceMotion)
      else setLocal(next)
      mutate(patch, {
        onSuccess: (stored) => setLocal(stored),
        onError: (err) => {
          setLocal(before)
          toast.error('The appearance couldn’t be saved', { description: err.message })
        }
      })
    },
    [prefs, mutate, osDark, reducedMotion]
  )

  // Once the database's copy arrives, it wins over the cached one.
  useEffect(() => {
    if (saved.data && local === null) cacheAppearance(saved.data)
  }, [saved.data, local])

  const value = useMemo<ThemeContextValue>(() => {
    const palette = paletteFor(prefs.palette)
    return { prefs, mode, palette, tokens: palette[mode], reducedMotion, reducedTransparency, osDark, setPrefs }
  }, [prefs, mode, reducedMotion, reducedTransparency, osDark, setPrefs])

  return (
    <ThemeContext.Provider value={value}>
      <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>{children}</MotionConfig>
    </ThemeContext.Provider>
  )
}
