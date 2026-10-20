/**
 * The short splash as the app opens: the mark and the name over the colour
 * field, gone in under a second (a click or any key skips it), and none at
 * all under reduced motion. Shown once per start; App.tsx renders it over
 * everything else, and it renders null once it is done.
 */
import { useEffect, useState } from 'react'
import { PRODUCT_NAME } from '@shared/product'
import { useReducedMotion } from '../../theme/motion'
import { BrandMark } from './BrandMark'

/** How long the splash holds, then fades: 900 ms in all. */
export const SPLASH_HOLD_MS = 620
export const SPLASH_FADE_MS = 280

let shownThisStart = false

export function Splash(): JSX.Element | null {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState<'on' | 'leaving' | 'done'>(() => (shownThisStart || reduced ? 'done' : 'on'))

  useEffect(() => {
    if (phase !== 'on') return
    shownThisStart = true
    const leave = (): void => setPhase((p) => (p === 'on' ? 'leaving' : p))
    const hold = setTimeout(leave, SPLASH_HOLD_MS)
    window.addEventListener('keydown', leave)
    window.addEventListener('pointerdown', leave)
    return () => {
      clearTimeout(hold)
      window.removeEventListener('keydown', leave)
      window.removeEventListener('pointerdown', leave)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'leaving') return
    const gone = setTimeout(() => setPhase('done'), SPLASH_FADE_MS)
    return () => clearTimeout(gone)
  }, [phase])

  if (phase === 'done') return null
  return (
    <div
      aria-hidden
      data-testid="splash"
      className="fixed inset-0 z-[90] flex items-center justify-center transition-opacity ease-glass"
      style={{ opacity: phase === 'leaving' ? 0 : 1, transitionDuration: `${SPLASH_FADE_MS}ms`, pointerEvents: phase === 'leaving' ? 'none' : 'auto' }}
    >
      <div className="app-backdrop" />
      <div className="relative flex animate-rise-in flex-col items-center gap-4">
        <BrandMark size={64} />
        <span className="whitespace-nowrap text-[15px] font-semibold tracking-[0.32em] text-fg">{PRODUCT_NAME}</span>
      </div>
    </div>
  )
}
