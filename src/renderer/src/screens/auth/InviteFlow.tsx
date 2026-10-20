/**
 * Joining the practice on this PC with an invitation code: type the code a
 * partner gave you, see who it is for, choose a username and password, and
 * you are signed in. A code works once, until it expires. Owned by the auth
 * domain.
 */
import { useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarClock, CircleAlert, UserPlus } from 'lucide-react'
import {
  MIN_PASSWORD_LENGTH,
  ROLE_DESCRIPTIONS,
  normaliseInviteCode,
  passwordProblem,
  usernameProblem,
  type InvitePreview
} from '@shared/contracts/auth'
import { ROLE_LABELS } from '@shared/domain/roles'
import { PasswordField } from '@renderer/components/session/PasswordField'
import { Field, GlassBadge, GlassButton, TextInput } from '@renderer/components/ui'
import { useApiMutation } from '@renderer/lib/api'
import { formatDate } from '@renderer/lib/format'
import { rememberUsername, setSignOutNotice } from '@renderer/stores/session'
import { instantToLondonDate } from '@shared/domain/dates'
import { AuthCard } from './AuthLayout'

export function InviteFlow({ onBack }: { onBack: () => void }): JSX.Element {
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  return preview ? (
    <InviteDetails code={code} preview={preview} onBack={() => setPreview(null)} />
  ) : (
    <InviteCode code={code} setCode={setCode} onChecked={setPreview} onBack={onBack} />
  )
}

function InviteCode({ code, setCode, onChecked, onBack }: { code: string; setCode: (c: string) => void; onChecked: (p: InvitePreview) => void; onBack: () => void }): JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const check = useApiMutation('auth.checkInvite', { onSuccess: (data) => onChecked(data), onError: (err) => setError(err.message) })
  const submit = (): void => {
    if (!normaliseInviteCode(code)) {
      setError('An invitation code has 12 letters and numbers, like ABCD-EFGH-JKMN.')
      return
    }
    setError(null)
    check.mutate({ code })
  }
  return (
    <AuthCard
      id="invite-title"
      eyebrow="Joining the practice"
      title="Enter your invitation code"
      subtitle="The partner who invited you has it. Codes work once, on this PC."
      links={
        <GlassButton variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>
          Back to the sign-in page
        </GlassButton>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Invitation code" hint="12 letters and numbers. Dashes, spaces and capitals don’t matter." error={error}>
          <TextInput
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setError(null)
            }}
            autoFocus
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={24}
            className="font-mono tracking-[0.18em]"
            data-testid="invite-code"
          />
        </Field>
        <GlassButton type="submit" variant="primary" size="lg" icon={ArrowRight} iconPosition="end" loading={check.isPending} fullWidth>
          Check the code
        </GlassButton>
      </form>
    </AuthCard>
  )
}

function InviteDetails({ code, preview, onBack }: { code: string; preview: InvitePreview; onBack: () => void }): JSX.Element {
  const [name, setName] = useState(preview.name)
  const [username, setUsername] = useState(preview.suggestedUsername)
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const accept = useApiMutation('auth.acceptInvite', {
    invalidates: ['auth.status'],
    onSuccess: (_data, req) => {
      rememberUsername(req.username)
      setSignOutNotice(null)
    },
    onError: (err) => setErrors(err.field && err.field !== 'code' ? { [err.field]: err.message } : { form: err.message })
  })
  const submit = (): void => {
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = 'Enter your name.'
    const u = usernameProblem(username)
    if (u) found.username = u
    const p = passwordProblem(password, { username, name })
    if (p) found.password = p
    else if (password !== again) found.again = 'The two passwords don’t match.'
    setErrors(found)
    if (Object.keys(found).length === 0) accept.mutate({ code, name: name.trim(), username: username.trim(), password })
  }
  const who = preview.invitedBy ?? 'A partner'
  const where = preview.firmName ?? 'the practice'
  return (
    <AuthCard
      id="invite-details-title"
      eyebrow={where}
      title={`Welcome, ${preview.name.split(/\s+/)[0]}`}
      subtitle="Choose how you’ll sign in."
      links={
        <GlassButton variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>
          Use a different code
        </GlassButton>
      }
    >
      <div className="mb-5 rounded-xl bg-fg/[0.04] px-4 py-3">
        <p className="text-[13px] leading-5 text-fg">
          {who} invited you to join {where} as <GlassBadge tone="accent" size="sm">{ROLE_LABELS[preview.role]}</GlassBadge>
        </p>
        <p className="mt-1 text-xs text-fg-muted">{ROLE_DESCRIPTIONS[preview.role]}.</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-subtle">
          <CalendarClock size={13} aria-hidden />
          The invitation expires on {formatDate(instantToLondonDate(preview.expiresAt))}.
        </p>
      </div>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Your name" hint="As the practice should show it." error={errors.name}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Username" hint="What you’ll type to sign in." error={errors.username}>
          <TextInput value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="off" spellCheck={false} data-testid="invite-username" />
        </Field>
        <PasswordField
          label="Password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          autoFocus
          strength={{ username, name }}
          error={errors.password}
          testId="invite-password"
        />
        <PasswordField label="Password again" value={again} onChange={setAgain} autoComplete="new-password" error={errors.again} testId="invite-password-again" />
        {errors.form && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2.5 text-[13px] leading-5 text-danger">
            <CircleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
            <span>{errors.form}</span>
          </p>
        )}
        <GlassButton type="submit" variant="primary" size="lg" icon={UserPlus} loading={accept.isPending} fullWidth className="mt-1">
          Create my account
        </GlassButton>
      </form>
    </AuthCard>
  )
}
