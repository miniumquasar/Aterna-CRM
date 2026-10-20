import type { SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx } from '../../lib/cx'
import { useFieldControl } from './Field'

export interface SelectOption<V extends string> {
  value: V
  label: string
  disabled?: boolean
}

/**
 * A drop-down list (the system's own, so it is keyboard- and screen-reader-complete).
 *
 * @prop value        The chosen value, or '' for none.
 * @prop onChange     Called with the chosen value.
 * @prop options      The choices.
 * @prop placeholder  A first, empty choice ('Choose a type…'); without it there is no empty choice.
 * @prop invalid      Marks it invalid.
 * @prop size         'sm' | 'md' (default).
 */
export interface SelectProps<V extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'size'> {
  value: V | ''
  onChange: (value: V) => void
  options: readonly SelectOption<V>[]
  placeholder?: string
  invalid?: boolean
  size?: 'sm' | 'md'
}

export function Select<V extends string>({
  value,
  onChange,
  options,
  placeholder,
  invalid,
  size = 'md',
  className,
  id,
  required,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  ...rest
}: SelectProps<V>): JSX.Element {
  const a11y = useFieldControl({ id, required, invalid, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid })
  return (
    <div className={cx('relative', className)}>
      <select
        {...a11y}
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        className={cx('field-control w-full appearance-none rounded-xl pl-3 pr-9', size === 'sm' ? 'h-8 text-[13px]' : 'h-9 text-sm')}
      >
        {placeholder !== undefined && (
          <option value="" disabled={required}>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden />
    </div>
  )
}
