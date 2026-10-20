import { CircleAlert, RefreshCw } from 'lucide-react'
import { errorMessage } from '../../lib/api'
import { cx } from '../../lib/cx'
import { GlassButton } from './GlassButton'

/**
 * What a screen shows when it can't read what it needs: the problem in plain
 * words, and Try again. Never a blank panel or an endless spinner.
 *
 * @prop title     Defaults to 'This couldn’t be loaded'.
 * @prop error     The error (an ApiCallError's message is shown as it stands).
 * @prop message   A sentence, instead of `error`.
 * @prop onRetry   Shows Try again.
 * @prop retrying  Shows Try again as busy.
 * @prop size      'md' (default, a whole panel) | 'sm' (inside a card).
 */
export interface LoadProblemProps {
  title?: string
  error?: unknown
  message?: string
  onRetry?: () => void
  retrying?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function LoadProblem({ title = 'This couldn’t be loaded', error, message, onRetry, retrying = false, size = 'md', className }: LoadProblemProps): JSX.Element {
  const md = size === 'md'
  return (
    <div role="alert" className={cx('flex flex-col items-center text-center', md ? 'glass rounded-2xl px-8 py-12' : 'px-4 py-8', className)}>
      <span className={cx('flex items-center justify-center bg-danger-soft text-danger', md ? 'mb-5 h-12 w-12 rounded-2xl' : 'mb-3 h-10 w-10 rounded-xl')} aria-hidden>
        <CircleAlert size={md ? 24 : 19} strokeWidth={1.7} />
      </span>
      <h2 className={cx('font-serif font-semibold tracking-[-0.01em] text-fg', md ? 'text-[22px] leading-8' : 'text-[17px] leading-6')}>{title}</h2>
      <p className={cx('mt-1.5 max-w-md text-fg-muted', md ? 'text-sm leading-6' : 'text-[13px] leading-5')}>{message ?? errorMessage(error)}</p>
      {onRetry && (
        <GlassButton className={md ? 'mt-6' : 'mt-4'} icon={RefreshCw} onClick={onRetry} loading={retrying}>
          Try again
        </GlassButton>
      )}
    </div>
  )
}
