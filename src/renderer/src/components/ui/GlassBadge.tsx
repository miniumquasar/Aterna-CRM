import type { HTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cx } from '../../lib/cx'
import { DOT_TONE, SOFT_TONE, type Tone } from './tones'

export type BadgeTone = Tone

/**
 * A small label for a status or count: 'Overdue', 'Partner', '3'. A status
 * is a dot and its word in a soft pill — never a coloured row, never colour
 * alone.
 *
 * @prop tone 'neutral' (default) | 'accent' | 'success' | 'warning' | 'danger' | 'info'.
 * @prop size 'sm' | 'md' (default).
 * @prop icon A lucide icon before the text.
 * @prop dot  A small dot in the tone before the text instead of an icon (the status pill).
 * Colour is never the only signal: the text says what the tone means.
 */
export interface GlassBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  size?: 'sm' | 'md'
  icon?: LucideIcon
  dot?: boolean
  children?: ReactNode
}

export function GlassBadge({ tone = 'neutral', size = 'md', icon: Icon, dot = false, className, children, ...rest }: GlassBadgeProps): JSX.Element {
  return (
    <span
      className={cx(
        'inline-flex max-w-full items-center whitespace-nowrap rounded-full border font-medium leading-none',
        size === 'sm' ? 'h-5 gap-1 px-2 text-[11px]' : 'h-6 gap-1.5 px-2.5 text-xs',
        SOFT_TONE[tone],
        className
      )}
      {...rest}
    >
      {dot && <span className={cx('shrink-0 rounded-full', size === 'sm' ? 'h-1.5 w-1.5' : 'h-[7px] w-[7px]', DOT_TONE[tone])} aria-hidden />}
      {Icon && <Icon size={size === 'sm' ? 11 : 12} aria-hidden strokeWidth={2.2} className={tone === 'accent' ? 'text-accent-text' : undefined} />}
      <span className="truncate">{children}</span>
    </span>
  )
}
