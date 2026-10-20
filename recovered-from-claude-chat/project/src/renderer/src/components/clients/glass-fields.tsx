import { useId, type ReactNode } from 'react'

const control =
  'w-full h-10 bg-white/[0.03] border border-white/10 rounded-xl text-xs text-white/85 placeholder:text-white/45 focus:outline-none focus:border-aether/60 focus-visible:ring-2 focus-visible:ring-aether/40 transition-colors disabled:opacity-60'

/**
 * A labelled field for the glass dialogs: the label is tied to the control, so
 * clicking it focuses the field and a screen reader reads it out. `type`
 * "select" takes the options as children.
 */
export function GlassField({
  label,
  value,
  onChange,
  type = 'text',
  children,
  icon,
  required,
  disabled,
  autoFocus,
  hint,
  testid
}: {
  label: string
  value: string
  onChange: (val: string) => void
  type?: string
  children?: ReactNode
  icon?: ReactNode
  required?: boolean
  disabled?: boolean
  autoFocus?: boolean
  hint?: string
  testid?: string
}): JSX.Element {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div>
      <label htmlFor={id} className="text-[11px] font-semibold text-white/65 block mb-1.5 ml-1">
        {label}
        {required && (
          <>
            <span aria-hidden className="text-rose-300"> *</span>
            <span className="sr-only"> (needed)</span>
          </>
        )}
      </label>
      <div className="relative group">
        {icon && (
          <div aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/45 group-focus-within:text-aether transition-colors">
            {icon}
          </div>
        )}
        {type === 'select' ? (
          <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-describedby={hintId} className={`${control} px-4`} data-testid={testid}>
            {children}
          </select>
        ) : (
          <input
            id={id}
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            aria-required={required || undefined}
            disabled={disabled}
            autoFocus={autoFocus}
            aria-describedby={hintId}
            className={`${control} ${icon ? 'pl-9' : 'px-4'} pr-4`}
            data-testid={testid}
          />
        )}
      </div>
      {hint && (
        <p id={hintId} className="mt-1 ml-1 text-[11px] text-white/55">
          {hint}
        </p>
      )}
    </div>
  )
}

/** A tick box for the glass dialogs that works from the keyboard (Tab to it, Space to tick) and shows where focus is. */
export function GlassCheckbox({ label, checked, onChange, testid }: { label: string; checked: boolean; onChange: (val: boolean) => void; testid?: string }): JSX.Element {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testid} />
      <span
        aria-hidden
        className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-aether/60 ${
          checked ? 'bg-aether border-aether' : 'bg-white/[0.03] border-white/25 group-hover:border-white/40'
        }`}
      >
        {checked && <span className="w-2 h-2 rounded-sm bg-white" />}
      </span>
      <span className="text-xs text-white/75 group-hover:text-white/90 transition-colors">{label}</span>
    </label>
  )
}
