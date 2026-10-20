/**
 * The pointer highlight on primary panels (Full effects only, never under
 * reduced motion or Reduce transparency): a 6% radial light follows the
 * pointer across the panel, like light on a glass desk. It writes two CSS
 * variables on the element in an animation frame; nothing re-renders.
 */
import { useEffect, type RefObject } from 'react'
import { useFullEffects } from '../../theme/motion'

export function useSpecular(ref: RefObject<HTMLElement | null>, enabled = true): boolean {
  const full = useFullEffects()
  const on = enabled && full
  useEffect(() => {
    const el = ref.current
    if (!on || !el) return
    const layer = el.querySelector<HTMLElement>(':scope > .specular')
    if (!layer) return
    let frame = 0
    let x = 0
    let y = 0
    const paint = (): void => {
      frame = 0
      layer.style.setProperty('--spec-x', `${x}px`)
      layer.style.setProperty('--spec-y', `${y}px`)
    }
    const move = (event: PointerEvent): void => {
      const rect = el.getBoundingClientRect()
      x = event.clientX - rect.left
      y = event.clientY - rect.top
      layer.dataset.active = 'true'
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const leave = (): void => {
      layer.dataset.active = 'false'
    }
    el.addEventListener('pointermove', move, { passive: true })
    el.addEventListener('pointerleave', leave)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
      layer.dataset.active = 'false'
    }
  }, [ref, on])
  return on
}
