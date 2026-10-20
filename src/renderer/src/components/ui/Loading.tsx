import { LoaderCircle } from 'lucide-react'
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

export function Loading({ label = 'Loading…', size = 'md', inline = false, className }: LoadingProps): JSX.Element {
  const px = size === 'sm' ? 14 : size === 'lg' ? 26 : 18
  return (
    <div role="status" aria-live="polite" className={cx(inline ? 'inline-flex' : 'flex w-full justify-center py-10', 'items-center gap-2.5 text-sm text-fg-muted', className)}>
      <LoaderCircle size={px} className="animate-spin text-accent-text" aria-hidden />
      <span>{label}</span>
    </div>
  )
}
