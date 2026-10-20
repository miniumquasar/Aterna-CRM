import { cx } from '../../lib/cx'
import { initials } from '../../lib/format'

/**
 * A person's initials in a soft circle, coloured from their name.
 *
 * @prop name        The person's name (used for the initials, the colour and the accessible name).
 * @prop size        'xs' | 'sm' | 'md' (default) | 'lg'.
 * @prop src         A picture instead of initials.
 * @prop decorative  Hide from screen readers when the name is already beside it.
 */
export interface AvatarProps {
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  src?: string
  decorative?: boolean
  className?: string
}

const SIZE = { xs: 'h-6 w-6 text-[10px]', sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-[13px]', lg: 'h-12 w-12 text-base' } as const

function hue(name: string): number {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return (h % 8) + 1
}

export function Avatar({ name, size = 'md', src, decorative = false, className }: AvatarProps): JSX.Element {
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': name }
  const n = hue(name)
  return (
    <span
      {...a11y}
      className={cx('inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold ring-1 ring-line/20', SIZE[size], className)}
      style={{ backgroundColor: `rgb(var(--chart-${n}) / 0.22)`, color: `rgb(var(--text))` }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  )
}
