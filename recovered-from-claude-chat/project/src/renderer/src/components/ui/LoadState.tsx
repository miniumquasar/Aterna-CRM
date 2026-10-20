import { RefreshCw } from 'lucide-react'

/** What a screen shows while it reads: words, announced politely, not a bare spinner. */
export function Loading({ children, className = '' }: { children: string; className?: string }): JSX.Element {
  return (
    <p role="status" aria-busy="true" className={`flex items-center gap-2 p-6 text-sm text-white/60 ${className}`} data-testid="loading">
      <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white/80" />
      {children}
    </p>
  )
}

/**
 * What a screen shows when it couldn't read what it needs: what failed, in
 * words, and a way to try again. `what` completes "… couldn’t be read".
 */
export function LoadProblem({ what, detail, onRetry, className = '' }: { what: string; detail?: string | null; onRetry?: () => void; className?: string }): JSX.Element {
  return (
    <div role="alert" className={`m-6 max-w-xl rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 ${className}`} data-testid="load-problem">
      <p className="font-medium">{what.charAt(0).toUpperCase() + what.slice(1)} couldn’t be read.</p>
      <p className="mt-1 text-rose-100/80">{detail || 'Try again. If it keeps happening, restart the app; your records are safe.'}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-200/30 px-3 py-1.5 text-xs text-rose-50 hover:bg-rose-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-200"
        >
          <RefreshCw aria-hidden size={12} /> Try again
        </button>
      )}
    </div>
  )
}
