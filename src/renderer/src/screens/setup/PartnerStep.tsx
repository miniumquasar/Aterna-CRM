/**
 * The first partner's account. Saving it also saves the firm's name and
 * signs the partner in. Owned by the auth domain.
 */
import { useState } from 'react'
import { ArrowLeft, UserRoundCheck } from 'lucide-react'
import { Field, GlassButton, TextInput } from '@renderer/components/ui'
import { useApiMutation } from '@renderer/lib/api'
import type { SetupStepProps } from './steps'

const MIN = 10

export default function PartnerStep({ draft, next, back }: SetupStepProps): JSX.Element {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const create = useApiMutation('setup.createFirstPartner', { invalidates: ['auth.status'], onSuccess: () => next() })

  const submit = (): void => {
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = 'Enter your name.'
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(username.trim())) found.username = 'Use 3 to 64 letters, numbers, dots, hyphens or underscores.'
    if (password.length < MIN) found.password = `Use a password of at least ${MIN} characters.`
    else if (password !== confirm) found.confirm = 'The two passwords don’t match.'
    setErrors(found)
    if (Object.keys(found).length) return
    create.mutate(
      { firmName: draft.firmName, name: name.trim(), username: username.trim(), password },
      { onError: (err) => setErrors(err.field ? { [err.field === 'firmName' ? 'name' : err.field]: err.message } : { form: err.message }) }
    )
  }

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
        You will be the first partner at <strong className="font-semibold text-fg">{draft.firmName}</strong>. Partners can do everything, including inviting the rest of the practice.
      </p>
      <Field label="Your name" error={errors.name} required>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="name" data-testid="setup-partner-name" />
      </Field>
      <Field label="Username" hint="What you will type to sign in." error={errors.username} required>
        <TextInput value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" spellCheck={false} data-testid="setup-partner-username" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Password" hint={`At least ${MIN} characters.`} error={errors.password} required>
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" data-testid="setup-partner-password" />
        </Field>
        <Field label="Password again" error={errors.confirm} required>
          <TextInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" data-testid="setup-partner-confirm" />
        </Field>
      </div>
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
