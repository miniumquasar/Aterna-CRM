/**
 * A labelled form field: label, the control, a hint and an error, wired for
 * screen readers. Controls inside (TextInput, TextArea, Select, DateInput,
 * MoneyInput) pick up the field's id, aria-describedby, aria-invalid and
 * required from it, so
 *
 *   <Field label="Company number" hint="8 characters" error={error}>
 *     <TextInput value={v} onChange={(e) => setV(e.target.value)} />
 *   </Field>
 *
 * is labelled, described and marked invalid with no ids to wire by hand.
 */
import { createContext, useContext, useId, type AriaAttributes, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { cx } from '../../lib/cx'

interface FieldContextValue {
  id: string
  describedBy: string | undefined
  invalid: boolean
  required: boolean
}

const FieldContext = createContext<FieldContextValue | null>(null)

export interface ControlA11yProps {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: AriaAttributes['aria-invalid']
  required?: boolean
  invalid?: boolean
}

/** Merges a control's own props with its Field's (the control's own win). */
export function useFieldControl(props: ControlA11yProps): { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; required?: boolean } {
  const field = useContext(FieldContext)
  const own = props['aria-invalid']
  const invalid = props.invalid ?? (own !== undefined && own !== false && own !== 'false' ? true : (field?.invalid ?? false))
  return {
    id: props.id ?? field?.id,
    'aria-describedby': [props['aria-describedby'], field?.describedBy].filter(Boolean).join(' ') || undefined,
    'aria-invalid': invalid || undefined,
    required: props.required ?? (field?.required || undefined)
  }
}

/**
 * @prop label       What the field is ('Company number').
 * @prop hint        Help under the label ('8 characters, e.g. 01234567').
 * @prop error       A plain sentence about what's wrong; marks the control invalid.
 * @prop warning     A note that doesn't stop saving (a reference that fails its check).
 * @prop required    Marks the control required (shown as the absence of “optional”).
 * @prop optional    Shows “(optional)” after the label.
 * @prop labelHidden Keeps the label for screen readers only.
 * @prop id          The control's id, if you need it; otherwise one is made.
 */
export interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  warning?: string | null
  required?: boolean
  optional?: boolean
  labelHidden?: boolean
  id?: string
  className?: string
  children: ReactNode
}

export function Field({ label, hint, error, warning, required = false, optional = false, labelHidden = false, id: givenId, className, children }: FieldProps): JSX.Element {
  const auto = useId()
  const id = givenId ?? `field-${auto}`
  const hintId = hint ? `${id}-hint` : undefined
  const messageId = error || warning ? `${id}-message` : undefined
  const describedBy = [hintId, messageId].filter(Boolean).join(' ') || undefined
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: !!error, required }}>
      <div className={cx('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className={cx('text-[13px] font-medium leading-5 text-fg', labelHidden && 'sr-only')}>
          {label}
          {optional && <span className="ml-1 font-normal text-fg-muted">(optional)</span>}
        </label>
        {hint && (
          <p id={hintId} className="-mt-1 text-xs leading-5 text-fg-muted">
            {hint}
          </p>
        )}
        {children}
        {(error || warning) && (
          <p id={messageId} className={cx('flex items-start gap-1.5 text-xs leading-5', error ? 'text-danger' : 'text-warning')} aria-live="polite">
            <CircleAlert size={13} className="mt-[3px] shrink-0" aria-hidden />
            <span>{error ?? warning}</span>
          </p>
        )}
      </div>
    </FieldContext.Provider>
  )
}
