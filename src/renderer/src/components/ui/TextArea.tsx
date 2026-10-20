import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'
import { useFieldControl } from './Field'

/**
 * A multi-line text box. Inside a Field it is labelled automatically.
 *
 * @prop invalid Marks it invalid.
 * @prop rows    Visible lines (default 4).
 * Every textarea attribute passes through.
 */
export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { invalid, className, rows = 4, id, required, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...rest },
  ref
) {
  const a11y = useFieldControl({ id, required, invalid, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid })
  return <textarea ref={ref} rows={rows} {...a11y} {...rest} className={cx('field-control w-full resize-y rounded-xl px-3 py-2 text-sm leading-6', className)} />
})
