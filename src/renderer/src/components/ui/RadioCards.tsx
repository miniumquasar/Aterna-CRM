import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cx } from '../../lib/cx'

export interface RadioCardOption<V extends string> {
  value: V
  label: string
  description?: ReactNode
  /** A picture of the choice above its label (a theme preview, a swatch). */
  preview?: ReactNode
  disabled?: boolean
}

/**
 * Choices shown as cards (role="radiogroup"): the chosen one is tinted with
 * a check in its corner. ← → ↑ ↓ move and choose, Home and End jump, Tab
 * leaves the group.
 *
 * @prop value      The chosen value.
 * @prop onChange   Called with the new value.
 * @prop options    The choices: label, description, an optional preview.
 * @prop label      The group's name for screen readers ('Colour theme'); or `labelledBy`.
 * @prop labelledBy The id of a visible heading that names the group.
 * @prop columns    Cards per row at full width: 2, 3 (default), 4 or 5 (fewer on narrow windows).
 * @prop choiceAttribute  A data attribute carrying each card's value ('data-palette-choice'), for tests.
 */
export interface RadioCardsProps<V extends string> {
  value: V
  onChange: (value: V) => void
  options: readonly RadioCardOption<V>[]
  label?: string
  labelledBy?: string
  columns?: 2 | 3 | 4 | 5
  choiceAttribute?: `data-${string}`
  className?: string
}

const COLUMNS = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 xl:grid-cols-4', 5: 'grid-cols-3 xl:grid-cols-5' } as const

export function RadioCards<V extends string>({ value, onChange, options, label, labelledBy, columns = 3, choiceAttribute, className }: RadioCardsProps<V>): JSX.Element {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0)
  const current = Math.max(0, options.findIndex((o) => o.value === value))

  const move = (event: KeyboardEvent<HTMLButtonElement>, from: number): void => {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
    let next: number | undefined
    if (event.key in steps) {
      const at = enabled.indexOf(from)
      next = enabled[(at + steps[event.key] + enabled.length) % enabled.length]
    } else if (event.key === 'Home') next = enabled[0]
    else if (event.key === 'End') next = enabled[enabled.length - 1]
    if (next === undefined) return
    event.preventDefault()
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} className={cx('grid gap-3', COLUMNS[columns], className)}>
      {options.map((o, i) => {
        const selected = i === current
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => move(e, i)}
            {...(choiceAttribute ? { [choiceAttribute]: o.value } : {})}
            className={cx(
              'glass relative flex flex-col rounded-2xl p-2.5 text-left transition duration-200 ease-glass',
              'disabled:cursor-not-allowed disabled:opacity-50',
              selected ? 'tint-accent ring-1 ring-accent/45' : 'lift'
            )}
          >
            {o.preview !== undefined && <span className="relative mb-2.5 block overflow-hidden rounded-xl">{o.preview}</span>}
            <span className="block px-1 text-[13.5px] font-semibold leading-5 text-fg">{o.label}</span>
            {o.description !== undefined && <span className="mt-0.5 block px-1 pb-0.5 text-xs leading-[1.125rem] text-fg-muted">{o.description}</span>}
            {selected && (
              <span
                className={cx(
                  'absolute flex h-6 w-6 items-center justify-center rounded-full text-white ring-2 ring-white/80',
                  'bg-black/40 shadow-[0_2px_8px_-2px_rgb(0_0_0/0.45)] backdrop-blur-sm',
                  o.preview !== undefined ? 'right-[18px] top-[18px]' : 'right-3 top-3'
                )}
                aria-hidden
              >
                <Check size={13} strokeWidth={3.2} className="check-draw" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
