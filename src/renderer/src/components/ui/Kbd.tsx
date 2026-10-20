import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

/**
 * A keyboard key, or a combination: <Kbd>Esc</Kbd>, <Kbd keys={['Ctrl', 'K']} />.
 *
 * @prop keys      Keys pressed together, shown joined.
 * @prop children  A single key.
 */
export interface KbdProps {
  keys?: readonly string[]
  children?: ReactNode
  className?: string
}

const keyClass =
  'inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-b-2 border-line/20 bg-fg/[0.05] px-1.5 font-sans text-[11px] font-medium leading-none text-fg-muted'

export function Kbd({ keys, children, className }: KbdProps): JSX.Element {
  if (keys?.length) {
    return (
      <span className={cx('inline-flex items-center gap-0.5', className)}>
        {keys.map((k) => (
          <kbd key={k} className={keyClass}>
            {k}
          </kbd>
        ))}
      </span>
    )
  }
  return <kbd className={cx(keyClass, className)}>{children}</kbd>
}
