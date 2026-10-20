import { cloneElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { cx } from '../../lib/cx'

/**
 * A short hint on hover and on keyboard focus; Escape hides it. The hint
 * describes the element it wraps (aria-describedby) unless `describe` is
 * false — use that when the hint repeats the element's accessible name.
 *
 * @prop content   The hint.
 * @prop children  One element that can take focus (a button); hover and focus inside it show the hint.
 * @prop side      'top' | 'bottom' (default) | 'left' | 'right'.
 * @prop delayMs   Wait before showing on hover (default 350 ms; focus shows at once).
 * @prop describe  Default true.
 * @prop disabled  Never show.
 */
export interface TooltipProps {
  content: ReactNode
  children: ReactElement<Record<string, unknown>>
  side?: 'top' | 'bottom' | 'left' | 'right'
  delayMs?: number
  describe?: boolean
  disabled?: boolean
}

const SIDE: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2'
}

export function Tooltip({ content, children, side = 'bottom', delayMs = 350, describe = true, disabled = false }: TooltipProps): JSX.Element {
  const id = useId()
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = (): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (disabled) return children
  const show = (now: boolean): void => {
    clear()
    if (now) setOpen(true)
    else timer.current = setTimeout(() => setOpen(true), delayMs)
  }
  const hide = (): void => {
    clear()
    setOpen(false)
  }
  const child = describe
    ? cloneElement(children, {
        'aria-describedby': open ? [children.props['aria-describedby'], id].filter(Boolean).join(' ') : children.props['aria-describedby']
      })
    : children
  return (
    <span className="relative inline-flex" onMouseEnter={() => show(false)} onMouseLeave={hide} onFocus={() => show(true)} onBlur={hide}>
      {child}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cx(
            'glass-raised pointer-events-none absolute z-[80] w-max max-w-xs animate-fade-in rounded-lg px-2.5 py-1.5 text-xs font-medium text-fg',
            SIDE[side]
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}
