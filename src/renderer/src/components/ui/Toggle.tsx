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
        <span id={`${id}-label`} className="text-sm text-fg">
          {label}
        </span>
        {description && (
          <span id={`${id}-desc`} className="block text-xs text-fg-subtle">
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
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'border-accent bg-accent' : 'border-line/30 bg-fg/[0.12]'
        )}
      >
        <span
          aria-hidden
          className={cx('inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-200 ease-glass', checked ? 'translate-x-[22px]' : 'translate-x-[2px]')}
        />
      </button>
    </div>
  )
}
