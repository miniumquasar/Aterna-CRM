/**
 * A labelled password box with what people need while typing one: a
 * Show / Hide button, a note when Caps Lock is on, and (for a new password)
 * a strength guide. Used by sign-in, setup, Your sign-in, People and the
 * password re-entry dialog. Owned by the auth domain.
 */
import { useId, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { ArrowBigUpDash, Eye, EyeOff } from 'lucide-react'
import { passwordStrength, type PasswordContext } from '@shared/contracts/auth'
import { Field, GlassButton, TextInput } from '../ui'
import { cx } from '../../lib/cx'

export interface PasswordFieldProps {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  /** 'current-password' to sign in or confirm; 'new-password' when choosing one. */
  autoComplete: 'current-password' | 'new-password'
  hint?: ReactNode
  error?: string | null
  required?: boolean
  autoFocus?: boolean
  labelHidden?: boolean
  /** Shows the strength guide, leaving out the person's own username and name. */
  strength?: PasswordContext
  /** Starts with the password shown (a temporary one a partner is choosing). */
  initiallyShown?: boolean
  inputRef?: Ref<HTMLInputElement>
  testId?: string
  className?: string
}

const BAR_TONE = ['', 'bg-danger', 'bg-warning', 'bg-info', 'bg-success'] as const
const TEXT_TONE = ['text-fg-subtle', 'text-danger', 'text-warning', 'text-info', 'text-success'] as const

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  error,
  required,
  autoFocus,
  labelHidden,
  strength,
  initiallyShown = false,
  inputRef,
  testId,
  className
}: PasswordFieldProps): JSX.Element {
  const id = useId()
  const [shown, setShown] = useState(initiallyShown)
  const [capsLock, setCapsLock] = useState(false)
  const capsId = `${id}-caps`
  const strengthId = `${id}-strength`
  const guide = strength && value ? passwordStrength(value, strength) : null
  const describedBy = [capsLock ? capsId : null, guide ? strengthId : null].filter(Boolean).join(' ') || undefined
  const readCaps = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (typeof e.getModifierState === 'function') setCapsLock(e.getModifierState('CapsLock'))
  }
  return (
    <Field label={label} hint={hint} error={error} required={required} labelHidden={labelHidden} className={className}>
      <TextInput
        ref={inputRef}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={readCaps}
        onKeyUp={readCaps}
        onBlur={() => setCapsLock(false)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        spellCheck={false}
        autoCapitalize="off"
        aria-describedby={describedBy}
        data-testid={testId}
        trailing={
          <GlassButton
            variant="ghost"
            size="sm"
            iconOnly
            icon={shown ? EyeOff : Eye}
            aria-label={shown ? 'Hide password' : 'Show password'}
            aria-pressed={shown}
            onClick={() => setShown((s) => !s)}
            className="-mr-2"
          />
        }
      />
      {capsLock && (
        <p id={capsId} role="status" className="flex items-center gap-1.5 text-xs font-medium text-warning">
          <ArrowBigUpDash size={14} aria-hidden />
          Caps Lock is on.
        </p>
      )}
      {guide && (
        <div id={strengthId} className="flex items-center gap-2.5" aria-live="polite">
          <span className="flex flex-1 gap-1" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={cx('h-1 flex-1 rounded-full transition-colors', n <= guide.score ? BAR_TONE[guide.score] : 'bg-fg/[0.1]')} />
            ))}
          </span>
          <span className={cx('w-24 shrink-0 text-right text-xs font-medium', TEXT_TONE[guide.score])}>
            <span className="sr-only">Password strength: </span>
            {guide.label}
          </span>
        </div>
      )}
    </Field>
  )
}
