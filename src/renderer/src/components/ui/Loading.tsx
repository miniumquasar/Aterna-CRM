import { cx } from '../../lib/cx'

/**
 * Something is on its way (role="status", announced politely).
 *
 * @prop label   What is loading ('Loading clients…'); defaults to 'Loading…'.
 * @prop size    'sm' | 'md' (default) | 'lg'.
 * @prop inline  Sit in a line of text instead of centring in its space.
 */
export interface LoadingProps {
  label?: string
  size?: 'sm' | 'md' | 'lg'
  inline?: boolean
  className?: string
}

const RING = { sm: 'h-3.5 w-3.5 border-[1.5px]', md: 'h-[18px] w-[18px] border-2', lg: 'h-7 w-7 border-[2.5px]' } as const

export function Loading({ label = 'Loading…', size = 'md', inline = false, className }: LoadingProps): JSX.Element {
  return (
    <div role="status" aria-live="polite" className={cx(inline ? 'inline-flex' : 'flex w-full justify-center py-12', 'items-center gap-2.5 text-sm text-fg-muted', className)}>
      <span aria-hidden className={cx('inline-block shrink-0 animate-spin rounded-full border-accent-text/25 border-t-accent-text', RING[size])} />
      <span>{label}</span>
    </div>
  )
}
