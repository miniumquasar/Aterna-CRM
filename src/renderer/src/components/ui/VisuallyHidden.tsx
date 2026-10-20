import type { HTMLAttributes } from 'react'

/** Text for screen readers only (a table caption, an icon button's longer name). */
export function VisuallyHidden(props: HTMLAttributes<HTMLSpanElement>): JSX.Element {
  return <span {...props} className="sr-only" />
}
