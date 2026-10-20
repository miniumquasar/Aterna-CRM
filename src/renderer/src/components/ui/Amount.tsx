import { cx } from '../../lib/cx'

/**
 * An amount of money, set the way accountants read it: tabular figures,
 * the £ a little smaller, the pence quieter, and a negative in brackets
 * rather than in red — '£1,250.00', '(£12.50)'.
 *
 * @prop pence     Whole pence, or null for no amount (shows the fallback).
 * @prop whole     Round to whole pounds and hide the pence ('£1,250').
 * @prop symbol    Show the £ (default true); turn off in a column headed '£'.
 * @prop negative  'brackets' (default) or 'minus' ('−£12.50').
 * @prop fallback  What no amount shows; defaults to '—'.
 */
export interface AmountProps {
  pence: number | null | undefined
  whole?: boolean
  symbol?: boolean
  negative?: 'brackets' | 'minus'
  fallback?: string
  className?: string
}

const grouped = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

export function Amount({ pence, whole = false, symbol = true, negative = 'brackets', fallback = '—', className }: AmountProps): JSX.Element {
  if (pence === null || pence === undefined || !Number.isFinite(pence)) return <span className={cx('tabular text-fg-subtle', className)}>{fallback}</span>
  const rounded = whole ? Math.round(pence / 100) * 100 : Math.round(pence)
  const abs = Math.abs(rounded)
  const pounds = grouped.format(Math.floor(abs / 100))
  const p = String(abs % 100).padStart(2, '0')
  const minus = rounded < 0
  const spoken = `${minus ? 'minus ' : ''}£${pounds}${whole ? '' : `.${p}`}`
  return (
    <span className={cx('tabular whitespace-nowrap', className)}>
      <span className="sr-only">{spoken}</span>
      <span aria-hidden>
        {minus && (negative === 'brackets' ? '(' : '−')}
        {symbol && <span className="mr-[0.04em] text-[0.85em]">£</span>}
        {pounds}
        {!whole && <span className="text-fg-muted">.{p}</span>}
        {minus && negative === 'brackets' && ')'}
      </span>
    </span>
  )
}
