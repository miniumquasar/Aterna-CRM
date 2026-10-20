/** Signing in: username and password. Owned by the auth domain. */
import { useState } from 'react'
import { LogIn } from 'lucide-react'
import type { AuthStatus } from '@shared/contracts/auth'
import { PRODUCT_NAME } from '@shared/product'
import { BrandMark } from '@renderer/components/layout/BrandMark'
import { ModeSwitch } from '@renderer/components/layout/ModeSwitch'
import { Field, GlassButton, GlassPanel, TextInput } from '@renderer/components/ui'
import { useApiMutation } from '@renderer/lib/api'

export function SignInScreen({ status }: { status: AuthStatus }): JSX.Element {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const signIn = useApiMutation('auth.signIn', {
    invalidates: ['auth.status'],
    onError: (err) => {
      setError(err.message)
      setPassword('')
    }
  })
  return (
    <div className="relative flex h-full flex-col">
      <div className="app-backdrop" aria-hidden />
      <header className="titlebar relative z-10 flex items-center gap-2.5 pl-5">
        <BrandMark size={22} />
        <span className="font-display text-[13px] font-semibold tracking-[0.18em] text-fg">{PRODUCT_NAME}</span>
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16">
        <GlassPanel tone="raised" padding="lg" as="section" className="w-full max-w-sm" aria-labelledby="sign-in-title">
          <div className="mb-6 flex flex-col items-center text-center">
            <BrandMark size={44} />
            <h1 id="sign-in-title" className="mt-4 font-display text-xl font-semibold text-fg">
              Sign in
            </h1>
            {status.firmName && <p className="mt-1 text-sm text-fg-muted">{status.firmName}</p>}
          </div>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              setError(null)
              if (!username.trim() || !password) return setError('Enter your username and password.')
              signIn.mutate({ username: username.trim(), password })
            }}
          >
            <Field label="Username">
              <TextInput value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" spellCheck={false} data-testid="sign-in-username" />
            </Field>
            <Field label="Password">
              <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" data-testid="sign-in-password" />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <GlassButton type="submit" variant="primary" size="lg" icon={LogIn} loading={signIn.isPending} fullWidth>
              Sign in
            </GlassButton>
          </form>
          <div className="mt-6 flex justify-center">
            <ModeSwitch />
          </div>
        </GlassPanel>
      </main>
    </div>
  )
}
