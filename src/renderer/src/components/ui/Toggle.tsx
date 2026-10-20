import { useId, type ReactNode } from 'react'
import { cx } from '../../lib/cx'

/**
 * An on/off switch for a setting that applies at once (role="switch").
 *
 * @prop checked      On or off.
 * @prop onChange     Called with the new state.
 * @prop label        What it switches; always given (hidden with `labelHidden`).
 * @prop description  A line under the label.
 * @prop labelHidden  Keeps the label for screen readers only.
 */
export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
  labelHidden?: boolean
  className?: string
}

export function Toggle({ checked, onChange, label, description, disabled, labelHidden = false, className }: ToggleProps): JSX.Element {
  const id = useId()
  return (
    <div className={cx('flex items-start justify-between gap-4', className)}>
      <div className={cx('min-w-0', labelHidden && 'sr-only')}>
        <span id={`${id}-label`} className="text-sm font-medium leading-5 text-fg">
          {label}
        </span>
        {description && (
          <span id={`${id}-desc`} className="mt-0.5 block text-[13px] leading-5 text-fg-muted">
            {description}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full border transition-colors duration-200',
          'disabled:cursor-not-allowed disabled:opacity-50',
          // Off is an outline with a muted knob (as Windows draws it), so the switch stands out at 3:1 either way.
          checked ? 'border-accent-text bg-gradient-to-r from-accent-from to-accent shadow-[inset_0_1px_2px_0_rgb(0_0_0/0.18)]' : 'border-fg-faint bg-surface-sunken/50 hover:bg-fg/[0.06]'
        )}
      >
        <span
          aria-hidden
          className={cx(
            'inline-block rounded-full transition duration-200 ease-glass',
            checked ? 'h-5 w-5 translate-x-[22px] bg-accent-fg shadow-[0_1px_3px_0_rgb(0_0_0/0.3),0_0_0_0.5px_rgb(0_0_0/0.06)]' : 'h-4 w-4 translate-x-[4px] bg-fg-muted'
          )}
        />
      </button>
    </div>
  )
}
