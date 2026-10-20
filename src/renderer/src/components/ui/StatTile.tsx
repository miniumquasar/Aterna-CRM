import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from 'lucide-react'
import { cx } from '../../lib/cx'
import { TEXT_TONE, type Tone } from './tones'

/**
 * One figure with its label: 'Overdue deadlines 12'. Figures are always real.
 *
 * @prop label    What the figure counts.
 * @prop value    The figure, already formatted ('£12,400.00', '1,250').
 * @prop hint     A line under it ('3 due this week').
 * @prop icon     A lucide icon.
 * @prop tone     Colours the icon and value: 'neutral' (default) | 'accent' | 'success' | 'warning' | 'danger' | 'info'.
 * @prop trend    A change: direction, a label ('+4 on last month'), and whether that is good.
 * @prop onClick  Makes the tile a button that opens the detail.
 * @prop loading  Shows a placeholder instead of the value.
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
  className?: string
}

export function StatTile({ label, value, hint, icon: Icon, tone = 'neutral', trend, onClick, loading = false, className }: StatTileProps): JSX.Element {
  const TrendIcon = trend?.direction === 'up' ? ArrowUpRight : trend?.direction === 'down' ? ArrowDownRight : ArrowRight
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-fg-muted">{label}</span>
        {Icon && <Icon size={17} aria-hidden className={TEXT_TONE[tone]} strokeWidth={1.8} />}
      </div>
      <div className={cx('tabular mt-2 font-display text-[28px] font-semibold leading-none tracking-tight', tone === 'neutral' ? 'text-fg' : TEXT_TONE[tone])}>
        {loading ? <span className="inline-block h-7 w-20 animate-pulse rounded-md bg-fg/10" aria-label="Loading" /> : value}
      </div>
      {(hint || trend) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
          {trend && (
            <span className={cx('inline-flex items-center gap-0.5 font-medium', trend.good === undefined ? 'text-fg-muted' : trend.good ? 'text-success' : 'text-danger')}>
              <TrendIcon size={13} aria-hidden />
              {trend.label}
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </>
  )
  const base = cx('glass block w-full rounded-2xl p-4 text-left', className)
  return onClick ? (
    <button type="button" onClick={onClick} className={cx(base, 'transition duration-200 ease-glass hover:-translate-y-px hover:shadow-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus')}>
      {inner}
    </button>
  ) : (
    <div className={base}>{inner}</div>
  )
}
