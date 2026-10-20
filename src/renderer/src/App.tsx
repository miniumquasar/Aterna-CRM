/**
 * The app's root: data, theme, dialogs and toasts, the splash, and the gate —
 *
 *   nobody can sign in yet, or the first partner hasn't finished setup → the setup wizard
 *   signed out                                                         → sign-in
 *   signed in                                                          → the app shell
 *
 * Opened at #/unlock (by a start-up hook, before the database is open) it is
 * the backup domain's unlock page instead (components/recovery/UnlockApp.tsx).
 *
 * Every screen re-reads its data when the licence changes (read-only begins
 * or ends), and a refusal saying the session has ended sends the person
 * back to sign-in, whether it came from a query or a save.
 */
import { useEffect, useRef } from 'react'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './components/layout/AppShell'
import { FullScreen } from './components/layout/FullScreen'
import { Splash } from './components/layout/Splash'
import { UnlockApp } from './components/recovery/UnlockApp'
import { ConfirmHost, Loading, LoadProblem, Toaster } from './components/ui'
import { ApiCallError, useApiEvent } from './lib/api'
import { SignInScreen } from './screens/auth/SignInScreen'
import { SetupWizard } from './screens/setup/SetupWizard'
import { useRouter } from './stores/router'
import { useAuthStatus } from './stores/session'
import { ThemeProvider } from './theme'

/** Queries that don't belong to the person signed in, kept across sign-out. */
const KEEP_ON_SIGN_OUT = new Set(['auth.status', 'appearance.get', 'system.info', 'system.ping'])

/** A session that ended elsewhere (idle, access removed): back to sign-in. */
function onRefusal(error: unknown): void {
  if (error instanceof ApiCallError && error.code === 'unauthenticated') void queryClient.invalidateQueries({ queryKey: ['auth.status'] })
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onRefusal }),
  mutationCache: new MutationCache({ onError: onRefusal }),
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiCallError) && count < 2,
      refetchOnWindowFocus: false,
      staleTime: 15_000
    },
    mutations: { retry: false }
  }
})

function Gate(): JSX.Element {
  const status = useAuthStatus()
  const actorId = status.data?.actor?.id ?? null
  const previous = useRef<number | null>(actorId)

  useApiEvent('session.ended', () => void queryClient.invalidateQueries({ queryKey: ['auth.status'] }))
  // Read-only began or ended: everything on screen re-reads (buttons that save, banners, the title bar).
  useApiEvent('licence.changed', () => void queryClient.invalidateQueries())

  // Signing out (or in as someone else) forgets the last person's data and route.
  useEffect(() => {
    if (previous.current !== null && previous.current !== actorId) {
      queryClient.removeQueries({ predicate: (q) => !KEEP_ON_SIGN_OUT.has(String(q.queryKey[0])) })
      useRouter.getState().reset()
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
    }
    previous.current = actorId
  }, [actorId])

  if (status.isPending) {
    return (
      <FullScreen>
        <Loading label="Opening AETERNA CRM…" />
      </FullScreen>
    )
  }
  if (status.isError) {
    return (
      <FullScreen>
        <LoadProblem title="AETERNA CRM couldn’t open" error={status.error} onRetry={() => void status.refetch()} retrying={status.isFetching} />
      </FullScreen>
    )
  }
  const s = status.data
  if (s.setupNeeded || (s.signedIn && !s.setupComplete && s.actor?.role === 'partner')) return <SetupWizard status={s} />
  if (!s.signedIn || !s.actor) return <SignInScreen status={s} />
  return <AppShell key={s.actor.id} actor={s.actor} firmName={s.firmName} />
}

/** True when this page was opened to unlock the database (see src/main/backup/startup.ts). */
export function isUnlockPage(hash: string = typeof window === 'undefined' ? '' : window.location.hash): boolean {
  return hash === '#/unlock' || hash.startsWith('#/unlock?')
}

export function App(): JSX.Element {
  const unlock = isUnlockPage()
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {unlock ? <UnlockApp /> : <Gate />}
        <ConfirmHost />
        <Toaster />
        {!unlock && <Splash />}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
