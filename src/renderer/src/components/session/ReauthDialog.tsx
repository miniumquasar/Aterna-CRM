/**
 * The password question before a protected action (reauth.ts asks it).
 * <ReauthHost /> is mounted once by the signed-in shell (IdleWarning) and
 * once by the setup wizard; it shows the question that is waiting, if any.
 * Owned by the auth domain.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { GlassButton, GlassModal } from '../ui'
import { ApiCallError, invoke } from '../../lib/api'
import { setSignOutNotice } from '../../stores/session'
import { PasswordField } from './PasswordField'
import { useReauthStore } from './reauth'

export function ReauthHost(): JSX.Element | null {
  const pending = useReauthStore((s) => s.pending)
  const close = useReauthStore((s) => s.close)
  if (!pending) return null
  const answer = (confirmed: boolean): void => {
    close(pending.id)
    pending.resolve(confirmed)
  }
  return <ReauthQuestion key={pending.id} action={pending.options.action} onAnswer={answer} />
}

function ReauthQuestion({ action, onAnswer }: { action?: string; onAnswer: (confirmed: boolean) => void }): JSX.Element {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const queryClient = useQueryClient()

  const submit = async (): Promise<void> => {
    if (!password) {
      setError('Enter your password.')
      return
    }
    setBusy(true)
    const result = await invoke('auth.reauth', { password })
    setBusy(false)
    if (result.ok) {
      onAnswer(true)
      return
    }
    setPassword('')
    if (result.error.code === 'locked' || result.error.code === 'unauthenticated') {
      // The session has ended: back to sign-in, saying why.
      if (result.error.code === 'locked') setSignOutNotice({ kind: 'locked' })
      onAnswer(false)
      void queryClient.invalidateQueries({ queryKey: ['auth.status'] })
      return
    }
    setError(new ApiCallError(result.error, 'auth.reauth').message)
  }

  return (
    <GlassModal
      open
      onClose={() => onAnswer(false)}
      size="sm"
      closeOnBackdrop={false}
      title="Enter your password again"
      description={action ? `To ${action}, confirm it’s you.` : 'To carry on, confirm it’s you.'}
      onSubmit={() => void submit()}
      footer={
        <>
          <GlassButton variant="ghost" onClick={() => onAnswer(false)}>
            Cancel
          </GlassButton>
          <GlassButton type="submit" variant="primary" icon={ShieldCheck} loading={busy}>
            Confirm
          </GlassButton>
        </>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <PasswordField
          label="Your password"
          value={password}
          onChange={(v) => {
            setPassword(v)
            setError(null)
          }}
          autoComplete="current-password"
          autoFocus
          error={error}
          testId="reauth-password"
        />
        <p className="text-xs text-fg-subtle">You won’t be asked again for the next five minutes.</p>
      </div>
    </GlassModal>
  )
}
