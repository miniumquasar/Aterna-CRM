import type { ReactNode } from 'react'
import { Inbox, type LucideIcon } from 'lucide-react'
import { cx } from '../../lib/cx'

/**
 * What a screen shows when there is nothing yet — always with the next step.
 *
 * @prop title   What is empty ('No clients yet').
 * @prop body    What to do about it ('Add your first client, or import the workbook.').
 * @prop icon    A lucide icon (default Inbox).
 * @prop action  A button for the next step.
 * @prop size    'sm' (inside a card) | 'md' (default, a whole panel).
 */
export interface EmptyStateProps {
  title: string
  body?: ReactNode
  icon?: LucideIcon
  action?: ReactNode
  size?: 'sm' | 'md'
  className?: string
}

export function EmptyState({ title, body, icon: Icon = Inbox, action, size = 'md', className }: EmptyStateProps): JSX.Element {
  return (
    <div className={cx('flex flex-col items-center text-center', size === 'md' ? 'glass rounded-2xl px-8 py-14' : 'px-4 py-8', className)}>
      <span className={cx('flex items-center justify-center rounded-2xl bg-accent/10 text-accent-text', size === 'md' ? 'mb-4 h-14 w-14' : 'mb-3 h-10 w-10')} aria-hidden>
        <Icon size={size === 'md' ? 26 : 20} strokeWidth={1.6} />
      </span>
      <h2 className={cx('font-display font-semibold text-fg', size === 'md' ? 'text-lg' : 'text-[15px]')}>{title}</h2>
      {body && <div className="mt-1.5 max-w-md text-sm text-fg-muted">{body}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
