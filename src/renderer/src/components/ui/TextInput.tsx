import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { useFieldControl } from './Field'

/**
 * A text box. Inside a Field it is labelled and described automatically.
 *
 * @prop invalid   Marks it invalid (a Field with an error does this for you).
 * @prop leading   Something inside, before the text (an icon, '£').
 * @prop trailing  Something inside, after the text (a button, a unit).
 * @prop size      'sm' | 'md' (default).
 * Every input attribute passes through (value, onChange, type, placeholder…).
 */
export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  invalid?: boolean
  leading?: ReactNode
  trailing?: ReactNode
  size?: 'sm' | 'md'
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { invalid, leading, trailing, size = 'md', className, disabled, id, required, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...rest },
  ref
) {
  const a11y = useFieldControl({ id, required, invalid, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid })
  return (
    <div
      className={cx('field-control flex items-center gap-2 rounded-xl px-3', size === 'sm' ? 'h-8 text-[13px]' : 'h-9 text-sm', className)}
      data-invalid={a11y['aria-invalid'] ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
    >
      {leading && <span className="flex shrink-0 items-center text-fg-subtle">{leading}</span>}
      <input ref={ref} disabled={disabled} {...a11y} {...rest} className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed" />
      {trailing && <span className="flex shrink-0 items-center text-fg-subtle">{trailing}</span>}
    </div>
  )
})
