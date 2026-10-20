import { useSyncExternalStore } from 'react'
import { useUiStore } from '@renderer/stores/ui'

/**
 * How much movement the screens may use:
 *   none  the computer asks for reduced motion, or Visual effects is Lite
 *   calm  short fades and slides (Standard)
 *   full  the richer transitions, blur included (Rich)
 */
export type MotionLevel = 'none' | 'calm' | 'full'

const REDUCE = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * Whether the computer asks for reduced motion — kept up to date while the app
 * is open (framer-motion's own hook reads it once, when a screen first draws).
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCE).matches,
    () => false
  )
}

export function useMotionLevel(): MotionLevel {
  const reduce = usePrefersReducedMotion()
  const tier = useUiStore((s) => s.hardwareTier)
  if (reduce || tier === 'LITE') return 'none'
  return tier === 'SOVEREIGN' ? 'full' : 'calm'
}

