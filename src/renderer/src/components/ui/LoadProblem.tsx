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
 */
export interface LoadProblemProps {
  title?: string
  error?: unknown
  message?: string
  onRetry?: () => void
  retrying?: boolean
  className?: string
}

export function LoadProblem({ title = 'This couldn’t be loaded', error, message, onRetry, retrying = false, className }: LoadProblemProps): JSX.Element {
  return (
    <div role="alert" className={cx('glass flex flex-col items-center rounded-2xl px-8 py-12 text-center', className)}>
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/[0.12] text-danger" aria-hidden>
        <CircleAlert size={24} strokeWidth={1.7} />
      </span>
      <h2 className="font-display text-lg font-semibold text-fg">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-fg-muted">{message ?? errorMessage(error)}</p>
      {onRetry && (
        <GlassButton className="mt-5" icon={RefreshCw} onClick={onRetry} loading={retrying}>
          Try again
        </GlassButton>
      )}
    </div>
  )
}
