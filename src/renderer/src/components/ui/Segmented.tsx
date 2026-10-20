import { useRef, type KeyboardEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cx } from '../../lib/cx'
import { Tooltip } from './Tooltip'

export interface SegmentedOption<V extends string> {
  value: V
  label: string
  icon?: LucideIcon
  disabled?: boolean
  /** A longer hint for the tooltip of an icon-only choice ('Auto: follows Windows'); the label stays its name. */
  hint?: string
}

/**
 * A row of mutually exclusive choices (role="radiogroup"): ← → move and
 * choose, Tab leaves the group.
 *
 * @prop value     The chosen value.
 * @prop onChange  Called with the new value.
 * @prop options   The choices, each with a label and an optional icon.
 * @prop label     The group's name for screen readers ('Theme mode').
 * @prop iconOnly  Show icons only; labels become tooltips and accessible names.
 * @prop size      'sm' | 'md' (default).
 * @prop fullWidth Stretch the choices across the container.
 * @prop tooltipSide Where an icon-only choice's tooltip shows: 'top' | 'bottom' (default).
 */
export interface SegmentedProps<V extends string> {
  value: V
  onChange: (value: V) => void
  options: readonly SegmentedOption<V>[]
  label: string
  iconOnly?: boolean
  size?: 'sm' | 'md'
  fullWidth?: boolean
  tooltipSide?: 'top' | 'bottom'
  className?: string
}

export function Segmented<V extends string>({ value, onChange, options, label, iconOnly = false, size = 'md', fullWidth = false, tooltipSide = 'bottom', className }: SegmentedProps<V>): JSX.Element {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0)
  const current = Math.max(0, options.findIndex((o) => o.value === value))

  const move = (event: KeyboardEvent<HTMLButtonElement>, from: number): void => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
    let next: number | undefined
    if (event.key in keys) {
      const at = enabled.indexOf(from)
      next = enabled[(at + keys[event.key] + enabled.length) % enabled.length]
    } else if (event.key === 'Home') next = enabled[0]
    else if (event.key === 'End') next = enabled[enabled.length - 1]
    if (next === undefined) return
    event.preventDefault()
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} className={cx('glass-sunken inline-flex gap-0.5 rounded-xl p-[3px]', fullWidth && 'flex w-full', className)}>
      {options.map((o, i) => {
        const selected = i === current
        const Icon = o.icon
        const button = (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={iconOnly ? o.label : undefined}
            tabIndex={selected ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => move(e, i)}
            className={cx(
              'inline-flex items-center justify-center gap-1.5 rounded-[9px] font-medium transition duration-150 ease-glass',
              'focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-40',
              size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
              iconOnly ? (fullWidth ? 'w-full' : size === 'sm' ? 'w-8' : 'w-9') : size === 'sm' ? 'px-2.5' : 'px-3.5',
              fullWidth && 'flex-1',
              selected ? 'segment-on' : 'text-fg-muted hover:bg-fg/[0.05] hover:text-fg'
            )}
          >
            {Icon && <Icon size={size === 'sm' ? 14 : 15} aria-hidden strokeWidth={1.9} className="shrink-0" />}
            {!iconOnly && o.label}
          </button>
        )
        return iconOnly ? (
          <Tooltip key={o.value} content={o.hint ?? o.label} describe={false} side={tooltipSide} className={fullWidth ? 'flex-1' : undefined}>
            {button}
          </Tooltip>
        ) : (
          button
        )
      })}
    </div>
  )
}
