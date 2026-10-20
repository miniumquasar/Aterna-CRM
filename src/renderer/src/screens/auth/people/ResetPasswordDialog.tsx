/**
 * A partner sets a temporary password for someone who has forgotten theirs
 * (or is locked out). The person chooses their own as soon as they sign in
 * with it. The partner's own password is asked for first if it hasn't been
 * confirmed in the last few minutes. Owned by the auth domain.
 */
import { useState } from 'react'
import { Copy, KeyRound, Sparkles } from 'lucide-react'
import { passwordProblem, type Person } from '@shared/contracts/auth'
import { PasswordField } from '@renderer/components/session/PasswordField'
import { ReauthCancelled, withReauth } from '@renderer/components/session/reauth'
import { GlassButton, GlassModal, toast } from '@renderer/components/ui'
import { errorMessage, useApiMutation } from '@renderer/lib/api'
import { copyText, suggestTemporaryPassword } from './people-ui'

export function ResetPasswordDialog({ person, open, onClose }: { person: Person; open: boolean; onClose: () => void }): JSX.Element {
  return (
    <GlassModal
      open={open}
      onClose={onClose}
      size="sm"
      closeOnBackdrop={false}
      title={`A temporary password for ${person.name}`}
      description="Give it to them yourself. They choose their own as soon as they sign in with it."
    >
      {open && <ResetForm person={person} onClose={onClose} />}
    </GlassModal>
  )
}

function ResetForm({ person, onClose }: { person: Person; onClose: () => void }): JSX.Element {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const reset = useApiMutation('people.resetPassword', { invalidates: ['people.list'] })

  const submit = async (): Promise<void> => {
    const problem = passwordProblem(password, { username: person.username, name: person.name })
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      await withReauth(() => reset.mutateAsync({ id: person.id, temporaryPassword: password }), { action: 'set a temporary password' })
      setDone(true)
      toast.success(`Temporary password set for ${person.name}`)
    } catch (err) {
      if (!(err instanceof ReauthCancelled)) setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4 pt-1">
        <div className="glass-sunken flex items-center justify-between gap-3 rounded-xl px-4 py-3">
          <span className="select-all font-mono text-lg font-semibold tracking-wider text-fg">{password}</span>
          <GlassButton size="sm" icon={Copy} onClick={() => void copyText(password, 'Password')}>
            Copy
          </GlassButton>
        </div>
        <p className="text-[13px] text-fg-muted">
          {person.name} signs in with <span className="font-medium text-fg">{person.username}</span> and this password, then chooses their own. Any session they had open has ended
          {person.locked ? ', and their account is unlocked' : ''}.
        </p>
        <div className="hairline -mx-6 mt-2 flex justify-end border-t px-6 pb-4 pt-4">
          <GlassButton variant="primary" onClick={onClose} data-autofocus>
            Done
          </GlassButton>
        </div>
      </div>
    )
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-3 pt-1"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <PasswordField
        label="Temporary password"
        hint="At least 10 characters. Easy to read out is best: they replace it straight away."
        value={password}
        onChange={(v) => {
          setPassword(v)
          setError(null)
        }}
        autoComplete="new-password"
        autoFocus
        initiallyShown
        error={error}
        testId="temporary-password"
      />
      <div>
        <GlassButton
          variant="ghost"
          size="sm"
          icon={Sparkles}
          onClick={() => {
            setPassword(suggestTemporaryPassword())
            setError(null)
          }}
        >
          Suggest one
        </GlassButton>
      </div>
      <div className="hairline -mx-6 mt-2 flex justify-end gap-2 border-t px-6 pb-4 pt-4">
        <GlassButton variant="ghost" onClick={onClose}>
          Cancel
        </GlassButton>
        <GlassButton type="submit" variant="primary" icon={KeyRound} loading={busy}>
          Set temporary password
        </GlassButton>
      </div>
    </form>
  )
}
