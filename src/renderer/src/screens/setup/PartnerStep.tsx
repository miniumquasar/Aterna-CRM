/**
 * The first partner's account: who you are, the username you'll type and a
 * password only you know. Creating it signs you in, and the rest of the
 * wizard is yours. Owned by the auth domain.
 */
import { useState } from 'react'
import { ArrowLeft, UserRoundCheck } from 'lucide-react'
import { MIN_PASSWORD_LENGTH, looksLikeEmail, passwordProblem, suggestUsername, usernameProblem } from '@shared/contracts/auth'
import { PasswordField } from '@renderer/components/session/PasswordField'
import { Field, GlassButton, TextInput } from '@renderer/components/ui'
import { useApiMutation } from '@renderer/lib/api'
import { rememberUsername } from '@renderer/stores/session'
import type { SetupStepProps } from './steps'

type Errors = Partial<Record<'name' | 'username' | 'email' | 'password' | 'confirm' | 'form', string>>

export default function PartnerStep({ draft, next, back }: SetupStepProps): JSX.Element {
  const [name, setName] = useState('')
  // Until the person types a username, one is suggested from their name.
  const [typedUsername, setTypedUsername] = useState<string | null>(null)
  const username = typedUsername ?? (name.trim() ? suggestUsername(name) : '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const create = useApiMutation('setup.createFirstPartner', {
    invalidates: ['auth.status', 'setup.status'],
    onSuccess: (_data, req) => {
      rememberUsername(req.username)
      next()
    },
    onError: (err) =>
      setErrors(err.field && err.field !== 'firmName' && ['name', 'username', 'email', 'password'].includes(err.field) ? { [err.field]: err.message } : { form: err.message })
  })

  const submit = (): void => {
    const found: Errors = {}
    if (!name.trim()) found.name = 'Enter your name.'
    const u = usernameProblem(username)
    if (u) found.username = u
    if (email.trim() && !looksLikeEmail(email)) found.email = 'Enter an email address like you@example.co.uk, or leave it empty.'
    const p = passwordProblem(password, { username, name })
    if (p) found.password = p
    else if (password !== confirm) found.confirm = 'The two passwords don’t match.'
    setErrors(found)
    if (Object.keys(found).length) return
    create.mutate({ firmName: draft.firmName.trim() || undefined, name: name.trim(), username: username.trim(), email: email.trim() || null, password })
  }

  const clear = (key: keyof Errors): void => setErrors((e) => (e[key] || e.form ? { ...e, [key]: undefined, form: undefined } : e))

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-fg-muted">
        {draft.firmName.trim() ? (
          <>
            You will be the first partner at <strong className="font-semibold text-fg">{draft.firmName.trim()}</strong>.
          </>
        ) : (
          'You will be the first partner.'
        )}{' '}
        Partners can do everything, including inviting the rest of the practice once setup is done.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Your name" hint="As the practice should show it." error={errors.name} required>
          <TextInput
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              clear('name')
            }}
            autoFocus
            autoComplete="name"
            data-testid="setup-partner-name"
          />
        </Field>
        <Field label="Username" hint="What you will type to sign in." error={errors.username} required>
          <TextInput
            value={username}
            onChange={(e) => {
              setTypedUsername(e.target.value)
              clear('username')
            }}
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            data-testid="setup-partner-username"
          />
        </Field>
      </div>
      <Field label="Email" optional error={errors.email}>
        <TextInput
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            clear('email')
          }}
          autoComplete="email"
          spellCheck={false}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PasswordField
          label="Password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          value={password}
          onChange={(v) => {
            setPassword(v)
            clear('password')
          }}
          autoComplete="new-password"
          strength={{ username, name }}
          error={errors.password}
          required
          testId="setup-partner-password"
        />
        <PasswordField
          label="Password again"
          hint="To be sure it’s what you meant."
          value={confirm}
          onChange={(v) => {
            setConfirm(v)
            clear('confirm')
          }}
          autoComplete="new-password"
          error={errors.confirm}
          required
          testId="setup-partner-confirm"
        />
      </div>
      <p className="text-xs text-fg-subtle">Nobody can see or recover this password, so choose one you’ll remember. Another partner can set you a temporary one if it is ever forgotten.</p>
      {errors.form && (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      )}
      <div className="mt-2 flex justify-between gap-2">
        <GlassButton variant="ghost" icon={ArrowLeft} onClick={back}>
          Back
        </GlassButton>
        <GlassButton type="submit" variant="primary" icon={UserRoundCheck} loading={create.isPending}>
          Create partner account
        </GlassButton>
      </div>
    </form>
  )
}
