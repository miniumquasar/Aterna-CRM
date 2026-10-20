/**
 * After signing in with a temporary password (a partner reset it): the
 * person chooses their own before anything else, then is signed in. Owned
 * by the auth domain.
 */
import { useState } from 'react'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { MIN_PASSWORD_LENGTH, passwordProblem, type PasswordChangeNeeded } from '@shared/contracts/auth'
import { PasswordField } from '@renderer/components/session/PasswordField'
import { GlassButton } from '@renderer/components/ui'
import { useApiMutation } from '@renderer/lib/api'
import { rememberUsername, setSignOutNotice } from '@renderer/stores/session'
import { AuthCard, AuthNotice } from './AuthLayout'

export function NewPasswordForm({ person, currentPassword, onBack }: { person: PasswordChangeNeeded; currentPassword: string; onBack: () => void }): JSX.Element {
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [errors, setErrors] = useState<{ password?: string; again?: string; form?: string }>({})
  const context = { username: person.username, name: person.name }
  const change = useApiMutation('auth.completePasswordChange', {
    invalidates: ['auth.status'],
    onSuccess: () => {
      rememberUsername(person.username)
      setSignOutNotice(null)
    },
    onError: (err) => setErrors(err.field === 'newPassword' ? { password: err.message } : { form: err.message })
  })

  const submit = (): void => {
    const found: typeof errors = {}
    const problem = passwordProblem(password, context)
    if (problem) found.password = problem
    else if (password !== again) found.again = 'The two passwords don’t match.'
    setErrors(found)
    if (Object.keys(found).length === 0) change.mutate({ username: person.username, currentPassword, newPassword: password })
  }

  return (
    <AuthCard
      id="new-password-title"
      eyebrow={person.name}
      title="Choose your own password"
      subtitle="A partner set a temporary password for you. Choose one only you know to carry on."
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
        <PasswordField
          label="New password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. A few words that mean something to you work well.`}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          autoFocus
          strength={context}
          error={errors.password}
          testId="new-password"
        />
        <PasswordField label="New password again" value={again} onChange={setAgain} autoComplete="new-password" error={errors.again} testId="new-password-again" />
        {errors.form && (
          <AuthNotice alert tone="danger" icon={KeyRound}>
            {errors.form}
          </AuthNotice>
        )}
        <GlassButton type="submit" variant="primary" size="lg" icon={KeyRound} loading={change.isPending} fullWidth className="mt-1">
          Save my password
        </GlassButton>
      </form>
    </AuthCard>
  )
}
