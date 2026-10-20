import type { ReactNode } from 'react'
import { Inbox, type LucideIcon } from 'lucide-react'
import { cx } from '../../lib/cx'
import { ICON_TILE_TONE, type Tone } from './tones'

/**
 * What a screen shows when there is nothing yet — always with the next step.
 *
 * @prop title   What is empty ('No clients yet').
 * @prop body    What to do about it ('Add your first client, or import the workbook.').
 * @prop icon    A lucide icon (default Inbox).
 * @prop action  A button for the next step.
 * @prop size    'sm' (inside a card) | 'md' (default, a whole panel).
 * @prop tone    The icon tile's tone: 'accent' (default) or another tone ('success' for “all done”).
 */
export interface EmptyStateProps {
  title: string
  body?: ReactNode
  icon?: LucideIcon
  action?: ReactNode
  size?: 'sm' | 'md'
  tone?: Tone
  className?: string
}

export function EmptyState({ title, body, icon: Icon = Inbox, action, size = 'md', tone = 'accent', className }: EmptyStateProps): JSX.Element {
  const md = size === 'md'
  return (
    <div className={cx('flex flex-col items-center text-center', md ? 'glass rounded-2xl px-8 py-14' : 'px-4 py-8', className)}>
      <span
        className={cx('relative flex items-center justify-center shadow-[inset_0_1px_0_0_rgb(var(--highlight)/var(--highlight-alpha))]', ICON_TILE_TONE[tone], md ? 'mb-5 h-14 w-14 rounded-2xl' : 'mb-3 h-10 w-10 rounded-xl')}
        aria-hidden
      >
        <Icon size={md ? 26 : 19} strokeWidth={1.6} />
      </span>
      <h2 className={cx('font-serif font-semibold tracking-[-0.01em] text-fg', md ? 'text-[22px] leading-8' : 'text-[17px] leading-6')}>{title}</h2>
      {body && <div className={cx('mt-1.5 max-w-md text-fg-muted', md ? 'text-sm leading-6' : 'text-[13px] leading-5')}>{body}</div>}
      {action && <div className={cx('flex flex-wrap justify-center gap-2', md ? 'mt-6' : 'mt-4')}>{action}</div>}
    </div>
  )
}
