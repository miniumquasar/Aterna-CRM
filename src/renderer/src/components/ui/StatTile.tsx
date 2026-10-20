import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight, type LucideIcon } from 'lucide-react'
import { cx } from '../../lib/cx'
import { useReducedMotion } from '../../theme/motion'
import { figureAt, hasCounted, markCounted, readFigure } from './countUp'
import { ICON_TILE_TONE, TEXT_TONE, type Tone } from './tones'

/**
 * One figure with its label: 'Overdue deadlines 12'. Figures are always real.
 * The figure counts up from nought the first time the tile shows it in a
 * session (never under reduced motion); screen readers hear the figure.
 *
 * @prop label    What the figure counts.
 * @prop value    The figure, already formatted ('£12,400.00', '1,250').
 * @prop hint     A line under it ('3 due this week').
 * @prop icon     A lucide icon.
 * @prop tone     Colours the icon and value: 'neutral' (default) | 'accent' | 'success' | 'warning' | 'danger' | 'info'.
 * @prop trend    A change: direction, a label ('+4 on last month'), and whether that is good.
 * @prop onClick  Makes the tile a button that opens the detail.
 * @prop loading  Shows a placeholder instead of the value.
 * @prop countUp  Default true; false shows the figure as it is at once.
 */
export interface StatTileProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: Tone
  trend?: { direction: 'up' | 'down' | 'flat'; label: string; good?: boolean }
  onClick?: () => void
  loading?: boolean
  countUp?: boolean
  className?: string
}

export function StatTile({ label, value, hint, icon: Icon, tone = 'neutral', trend, onClick, loading = false, countUp = true, className }: StatTileProps): JSX.Element {
  const TrendIcon = trend?.direction === 'up' ? ArrowUpRight : trend?.direction === 'down' ? ArrowDownRight : ArrowRight
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="pt-0.5 text-[13px] font-medium leading-5 text-fg-muted">{label}</span>
        {Icon && (
          <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]', ICON_TILE_TONE[tone])} aria-hidden>
            <Icon size={16} strokeWidth={1.9} />
          </span>
        )}
      </div>
      <div className={cx('mt-1.5 text-[30px] font-semibold leading-[1.1] tracking-[-0.02em]', tone === 'neutral' ? 'text-fg' : TEXT_TONE[tone])}>
        {loading ? (
          <span className="block h-[33px] w-24 animate-shimmer rounded-lg bg-[linear-gradient(90deg,rgb(var(--text)/0.06),rgb(var(--text)/0.13),rgb(var(--text)/0.06))] bg-[length:200%_100%]" role="status" aria-label={`Loading ${label}`} />
        ) : typeof value === 'string' && countUp ? (
          <CountedFigure text={value} id={label} />
        ) : (
          value
        )}
      </div>
      {(hint || trend) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-fg-muted">
          {trend && (
            <span
              className={cx(
                'inline-flex items-center gap-0.5 rounded-full px-1.5 font-medium',
                trend.good === undefined ? 'bg-fg/[0.07] text-fg-muted' : trend.good ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
              )}
            >
              <TrendIcon size={13} aria-hidden />
              {trend.label}
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </>
  )
  const base = cx('glass relative block w-full rounded-2xl p-pad-md text-left', className)
  return onClick ? (
    <button type="button" onClick={onClick} className={cx(base, 'lift group')}>
      {inner}
      <ChevronRight size={15} aria-hidden className="absolute bottom-4 right-4 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  ) : (
    <div className={base}>{inner}</div>
  )
}

/** The figure, counting up the first time this tile shows one in the session. */
function CountedFigure({ text, id }: { text: string; id: string }): JSX.Element {
  const figure = useMemo(() => readFigure(text), [text])
  const reduced = useReducedMotion()
  const [shown, setShown] = useState<string | null>(() => (figure && figure.value > 0 && !reduced && !hasCounted(id) ? figureAt(figure, 0) : null))
  const animating = shown !== null

  useEffect(() => {
    if (!animating || !figure) return
    markCounted(id)
    const start = performance.now()
    let frame = requestAnimationFrame(function tick(now: number) {
      const t = (now - start) / 600
      if (t >= 1) {
        setShown(null)
        return
      }
      setShown(figureAt(figure, t))
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [animating, figure, id])

  if (!animating) return <>{text}</>
  return (
    <>
      <span aria-hidden className="tabular">
        {shown}
      </span>
      <span className="sr-only">{text}</span>
    </>
  )
}
