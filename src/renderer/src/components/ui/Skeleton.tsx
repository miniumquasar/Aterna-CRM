import { cx } from '../../lib/cx'

/**
 * A quiet placeholder in the shape of what is loading (a line, a figure, a
 * row), shimmering gently (still under reduced motion). Decorative: pair it
 * with a Loading or a labelled status so screen readers hear what is on its way.
 *
 * @prop lines   How many lines of text to suggest (default 1).
 * @prop width   The last line's width ('60%').
 * @prop height  Each line's height in pixels (default 12).
 */
export interface SkeletonProps {
  lines?: number
  width?: string
  height?: number
  className?: string
}

export function Skeleton({ lines = 1, width = '60%', height = 12, className }: SkeletonProps): JSX.Element {
  return (
    <span aria-hidden className={cx('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className="block animate-shimmer rounded-md bg-[linear-gradient(90deg,rgb(var(--text)/0.06),rgb(var(--text)/0.12),rgb(var(--text)/0.06))] bg-[length:200%_100%]"
          style={{ height, width: i === lines - 1 ? width : '100%' }}
        />
      ))}
    </span>
  )
}
