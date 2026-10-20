import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Check, Minus } from 'lucide-react'
import { cx } from '../../lib/cx'

/**
 * A tick box (the system's own input underneath, so Space and screen readers work).
 *
 * @prop checked        Ticked or not.
 * @prop onChange       Called with the new state.
 * @prop label          Text beside the box; without it, give an aria-label.
 * @prop description    A second line under the label.
 * @prop indeterminate  Shows a dash: some, not all, of a group is ticked.
 */
export interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: ReactNode
  description?: ReactNode
  indeterminate?: boolean
  disabled?: boolean
  id?: string
  name?: string
  'aria-label'?: string
  className?: string
}

export function Checkbox({ checked, onChange, label, description, indeterminate = false, disabled, id, name, 'aria-label': ariaLabel, className }: CheckboxProps): JSX.Element {
  const auto = useId()
  const inputId = id ?? `cb-${auto}`
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  const on = checked || indeterminate
  const box = (
    <span className="relative inline-flex h-[18px] w-[18px] shrink-0">
      <input
        ref={ref}
        id={inputId}
        name={name}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label ? undefined : ariaLabel}
        aria-describedby={description ? `${inputId}-desc` : undefined}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-[5px] disabled:cursor-not-allowed"
      />
      <span
        aria-hidden
        className={cx(
          'pointer-events-none flex h-full w-full items-center justify-center rounded-[5px] border transition-colors duration-150',
          on ? 'border-accent-text bg-accent text-accent-fg shadow-[inset_0_1px_0_0_rgb(255_255_255/0.2)]' : 'border-fg-faint bg-surface-sunken/50 peer-hover:border-fg-muted',
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
          disabled && 'opacity-50'
        )}
      >
        {indeterminate ? <Minus size={13} strokeWidth={3} /> : checked ? <Check size={13} strokeWidth={3} className="check-draw" /> : null}
      </span>
    </span>
  )
  if (!label) return <span className={className}>{box}</span>
  return (
    <div className={cx('flex items-start gap-2.5', className)}>
      <span className="mt-0.5">{box}</span>
      <span className="min-w-0">
        <label htmlFor={inputId} className={cx('text-sm leading-5 text-fg', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
          {label}
        </label>
        {description && (
          <span id={`${inputId}-desc`} className="block text-xs leading-5 text-fg-muted">
            {description}
          </span>
        )}
      </span>
    </div>
  )
}
