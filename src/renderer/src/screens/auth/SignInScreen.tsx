/**
 * Signing in: username and password, on a calm glass card with the firm's
 * name. Clear answers when something stops it (wrong password, the lock
 * nearing, a locked account, access turned off), a Caps Lock note and a
 * Show password button; why the person was signed out, if they didn't ask
 * to be; choosing their own password in place of a temporary one; and
 * joining the practice with an invitation code. Owned by the auth domain.
 */
import { useRef, useState } from 'react'
import { CircleAlert, Clock3, KeyRound, LockKeyhole, LogIn, MailOpen, ShieldOff, UserX } from 'lucide-react'
import { idleLabel, type AuthStatus, type PasswordChangeNeeded } from '@shared/contracts/auth'
import { PasswordField } from '@renderer/components/session/PasswordField'
import { Field, GlassButton, TextInput } from '@renderer/components/ui'
import { useApiMutation, useApiQuery } from '@renderer/lib/api'
import { lastUsername, rememberUsername, setSignOutNotice, useSignOutNotice, type SignOutNotice } from '@renderer/stores/session'
import { AuthCard, AuthLayout, AuthNotice } from './AuthLayout'
import { InviteFlow } from './InviteFlow'
import { NewPasswordForm } from './NewPasswordForm'

type Mode = { kind: 'signIn' } | { kind: 'newPassword'; person: PasswordChangeNeeded; currentPassword: string } | { kind: 'invite' }

export function SignInScreen({ status }: { status: AuthStatus }): JSX.Element {
  const [mode, setMode] = useState<Mode>({ kind: 'signIn' })
  return (
    <AuthLayout>
      {mode.kind === 'signIn' && (
        <SignInCard
          firmName={status.firmName}
          onPasswordChange={(person, currentPassword) => setMode({ kind: 'newPassword', person, currentPassword })}
          onInvite={() => setMode({ kind: 'invite' })}
        />
      )}
      {mode.kind === 'newPassword' && <NewPasswordForm person={mode.person} currentPassword={mode.currentPassword} onBack={() => setMode({ kind: 'signIn' })} />}
      {mode.kind === 'invite' && <InviteFlow onBack={() => setMode({ kind: 'signIn' })} />}
    </AuthLayout>
  )
}

function noticeFor(notice: SignOutNotice): { icon: typeof Clock3; tone: 'info' | 'warning'; text: string } {
  switch (notice.kind) {
    case 'idle':
      return {
        icon: Clock3,
        tone: 'info',
        text: notice.minutes ? `You were signed out after ${idleLabel(notice.minutes)} without use. Sign in to carry on.` : 'You were signed out after a while without use. Sign in to carry on.'
      }
    case 'locked':
      return { icon: LockKeyhole, tone: 'warning', text: 'You were signed out after too many wrong passwords, and the account is locked. A partner can unlock it in Settings → People.' }
    case 'access_removed':
      return { icon: UserX, tone: 'warning', text: 'You were signed out because your access was turned off.' }
    case 'expired':
      return { icon: Clock3, tone: 'info', text: 'Your session ended. Sign in again to carry on.' }
  }
}

interface Problem {
  code: string
  message: string
  field?: string
}

function SignInCard({
  firmName,
  onPasswordChange,
  onInvite
}: {
  firmName: string | null
  onPasswordChange: (person: PasswordChangeNeeded, currentPassword: string) => void
  onInvite: () => void
}): JSX.Element {
  const remembered = useState(() => lastUsername())[0]
  const dev = useApiQuery('dev.firstUser', undefined, { enabled: import.meta.env.DEV && !remembered, staleTime: Infinity, retry: false })
  // null until the person types: until then the box offers the username last used here.
  const [typed, setTyped] = useState<string | null>(null)
  const username = typed ?? (remembered || dev.data?.username || '')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const notice = useSignOutNotice((s) => s.notice)
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const signIn = useApiMutation('auth.signIn', {
    invalidates: ['auth.status'],
    onSuccess: (data, req) => {
      if (data.passwordChange) {
        onPasswordChange(data.passwordChange, req.password)
        return
      }
      rememberUsername(req.username)
      setSignOutNotice(null)
    },
    onError: (err) => {
      setProblem({ code: err.code, message: err.message, field: err.field })
      setPassword('')
      if (err.field === 'username') usernameRef.current?.focus()
      else passwordRef.current?.focus()
    }
  })

  const submit = (): void => {
    const name = username.trim()
    if (!name || !password) {
      setProblem({ code: 'invalid', message: 'Enter your username and password.', field: name ? 'password' : 'username' })
      ;(name ? passwordRef : usernameRef).current?.focus()
      return
    }
    setProblem(null)
    signIn.mutate({ username: name, password })
  }

  const blocked = problem && (problem.code === 'locked' || problem.code === 'forbidden')
  const shownNotice = notice && !problem ? noticeFor(notice) : null

  return (
    <AuthCard
      id="sign-in-title"
      eyebrow={firmName ? 'AETERNA CRM' : undefined}
      title={firmName ?? 'Sign in'}
      subtitle={firmName ? 'Sign in to carry on.' : 'Welcome to AETERNA CRM.'}
      links={
        <>
          <GlassButton variant="ghost" size="sm" icon={KeyRound} aria-expanded={helpOpen} aria-controls="forgotten-help" onClick={() => setHelpOpen((o) => !o)}>
            Forgotten your password?
          </GlassButton>
          <GlassButton variant="ghost" size="sm" icon={MailOpen} onClick={onInvite} data-testid="sign-in-invite">
            I have an invitation code
          </GlassButton>
        </>
      }
    >
      {shownNotice && (
        <AuthNotice tone={shownNotice.tone} icon={shownNotice.icon}>
          {shownNotice.text}
        </AuthNotice>
      )}
      {blocked && (
        <AuthNotice alert tone={problem.code === 'locked' ? 'warning' : 'danger'} icon={problem.code === 'locked' ? LockKeyhole : ShieldOff} strong>
          {problem.message}
        </AuthNotice>
      )}
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Username" error={problem?.field === 'username' ? problem.message : null}>
          <TextInput
            ref={usernameRef}
            value={username}
            onChange={(e) => {
              setTyped(e.target.value)
              if (problem) setProblem(null)
            }}
            autoFocus={!username}
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            data-testid="sign-in-username"
          />
        </Field>
        <PasswordField
          label="Password"
          value={password}
          onChange={(v) => {
            setPassword(v)
            if (problem && problem.code === 'invalid' && problem.field) setProblem(null)
          }}
          autoComplete="current-password"
          autoFocus={!!username}
          inputRef={passwordRef}
          error={problem?.field === 'password' ? problem.message : null}
          testId="sign-in-password"
        />
        {problem && !blocked && !problem.field && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2.5 text-[13px] leading-5 text-danger">
            <CircleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
            <span>{problem.message}</span>
          </p>
        )}
        {helpOpen && (
          <p id="forgotten-help" className="rounded-xl bg-fg/[0.04] px-3 py-2.5 text-[13px] leading-5 text-fg-muted">
            Ask a partner at your practice to set a temporary password for you in Settings → People. You’ll choose your own as soon as you sign in with it.
          </p>
        )}
        <GlassButton type="submit" variant="primary" size="lg" icon={LogIn} loading={signIn.isPending} fullWidth className="mt-1">
          Sign in
        </GlassButton>
      </form>
    </AuthCard>
  )
}
