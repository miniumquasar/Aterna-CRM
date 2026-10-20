import { forwardRef, type InputHTMLAttributes } from 'react'
import { CalendarDays } from 'lucide-react'
import { isCivilDate, type CivilDate } from '@shared/domain/dates'
import { TextInput } from './TextInput'

/**
 * A date box: the system's date picker, holding a civil date 'YYYY-MM-DD'
 * (no time, no time zone). Shown in the computer's date order (day first on
 * UK Windows).
 *
 * @prop value     'YYYY-MM-DD', or null for none.
 * @prop onChange  Called with 'YYYY-MM-DD', or null when cleared.
 * @prop min, max  Earliest and latest allowed, 'YYYY-MM-DD'.
 * @prop invalid   Marks it invalid.
 */
export interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'size'> {
  value: CivilDate | null
  onChange: (value: CivilDate | null) => void
  min?: CivilDate
  max?: CivilDate
  invalid?: boolean
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput({ value, onChange, ...rest }, ref) {
  return (
    <TextInput
      ref={ref}
      type="date"
      value={value ?? ''}
      onChange={(e) => onChange(isCivilDate(e.target.value) ? e.target.value : null)}
      trailing={<CalendarDays size={15} aria-hidden className="pointer-events-none" />}
      {...rest}
    />
  )
})
