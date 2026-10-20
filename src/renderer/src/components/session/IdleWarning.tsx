/**
 * Idle sign-out, as the person sees it. Rendered by the signed-in shell.
 *
 *  - Input (keys, the pointer, the wheel, touch) counts as using the app; it
 *    is reported to the main process at most every ACTIVITY_REPORT_SECONDS,
 *    which keeps the session open there. Background reads never count.
 *  - IDLE_WARNING_SECONDS before the person's idle time runs out, a warning
 *    counts down with Stay signed in. While it shows, only that answer (or
 *    Escape) keeps them signed in.
 *  - At the end, or straight away after the PC wakes from sleep past it,
 *    they are signed out and the sign-in screen says why.
 *
 * It also hosts the password re-entry dialog for the signed-in app.
 * Owned by the auth domain.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Clock3, LogOut } from 'lucide-react'
import { ACTIVITY_REPORT_SECONDS, DEFAULT_IDLE_MINUTES, IDLE_WARNING_SECONDS, idleLabel } from '@shared/contracts/auth'
import { invoke, useApiEvent, useApiQuery } from '../../lib/api'
import { setSignOutNotice, useSignOut } from '../../stores/session'
import { GlassButton, GlassModal, ProgressRing } from '../ui'
import { ReauthHost } from './ReauthDialog'

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const

function countdown(seconds: number): string {
  const s = Math.max(0, seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function IdleWarning(): JSX.Element {
  const queryClient = useQueryClient()
  const session = useApiQuery('auth.session', undefined, { staleTime: 5 * 60_000 })
  const idleMinutes = session.data?.idleMinutes ?? DEFAULT_IDLE_MINUTES
  // react-query keeps `mutate` the same function from render to render.
  const { mutate: signOut } = useSignOut()

  const lastInput = useRef(0)
  const lastReport = useRef(0)
  const reporting = useRef(false)
  const warningOpen = useRef(false)
  const signingOut = useRef(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  // Signing in counts as using the app.
  useEffect(() => {
    lastInput.current = Date.now()
    lastReport.current = Date.now()
  }, [])

  const report = useCallback(async (): Promise<void> => {
    if (reporting.current) return
    reporting.current = true
    lastReport.current = Date.now()
    try {
      const result = await invoke('auth.activity', undefined)
      if (!result.ok && result.error.code === 'unauthenticated') void queryClient.invalidateQueries({ queryKey: ['auth.status'] })
    } finally {
      reporting.current = false
    }
  }, [queryClient])

  // Input counts as using the app (not while the warning asks the question).
  useEffect(() => {
    const onInput = (): void => {
      if (warningOpen.current) return
      const now = Date.now()
      lastInput.current = now
      if (now - lastReport.current >= ACTIVITY_REPORT_SECONDS * 1000) void report()
    }
    for (const name of INPUT_EVENTS) window.addEventListener(name, onInput, { capture: true, passive: true })
    return () => {
      for (const name of INPUT_EVENTS) window.removeEventListener(name, onInput, { capture: true })
    }
  }, [report])

  // The clock: warn, then sign out. Wall-clock time, so sleep is counted.
  useEffect(() => {
    const limit = idleMinutes * 60_000
    const tick = (): void => {
      if (signingOut.current) return
      const left = limit - (Date.now() - lastInput.current)
      if (left <= 0) {
        signingOut.current = true
        warningOpen.current = false
        setSecondsLeft(null)
        setSignOutNotice({ kind: 'idle', minutes: idleMinutes })
        signOut({ reason: 'idle' })
        return
      }
      if (left <= IDLE_WARNING_SECONDS * 1000) {
        warningOpen.current = true
        setSecondsLeft(Math.ceil(left / 1000))
      } else if (warningOpen.current) {
        warningOpen.current = false
        setSecondsLeft(null)
      }
    }
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [idleMinutes, signOut])

  // The main process ended the session itself (idle in the background, locked, access off).
  useApiEvent('session.ended', ({ reason }) => {
    if (reason === 'idle') setSignOutNotice({ kind: 'idle', minutes: idleMinutes })
    else if (reason === 'locked' || reason === 'access_removed' || reason === 'expired') setSignOutNotice({ kind: reason })
  })

  const stay = (): void => {
    lastInput.current = Date.now()
    warningOpen.current = false
    setSecondsLeft(null)
    void report()
  }

  const leaveNow = (): void => {
    signingOut.current = true
    warningOpen.current = false
    setSecondsLeft(null)
    signOut(undefined)
  }

  return (
    <>
      <GlassModal
        open={secondsLeft !== null}
        onClose={stay}
        role="alertdialog"
        size="sm"
        closeOnBackdrop={false}
        hideCloseButton
        title="Are you still there?"
        description={`For the practice’s security, AETERNA CRM signs you out after ${idleLabel(idleMinutes)} without use.`}
        initialFocus="[data-stay]"
        footer={
          <>
            <GlassButton variant="ghost" icon={LogOut} onClick={leaveNow}>
              Sign out now
            </GlassButton>
            <GlassButton variant="primary" onClick={stay} data-stay data-testid="idle-stay">
              Stay signed in
            </GlassButton>
          </>
        }
      >
        <div className="flex items-center gap-4 rounded-xl bg-fg/[0.04] p-4">
          <ProgressRing value={secondsLeft ?? 0} max={IDLE_WARNING_SECONDS} label="Time left before sign-out" size={52} thickness={4} tone="warning" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm text-fg-muted">
              <Clock3 size={14} aria-hidden />
              Signing you out in
            </p>
            <p className="font-display text-2xl font-semibold tabular-nums text-fg" aria-hidden>
              {countdown(secondsLeft ?? 0)}
            </p>
            <p className="sr-only" aria-live="polite">
              {secondsLeft !== null && secondsLeft > 30 ? 'You’ll be signed out in under a minute.' : secondsLeft !== null && secondsLeft <= 10 ? 'Ten seconds left.' : ''}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-fg-subtle">Anything you have saved stays saved. Choose Stay signed in to carry on where you were.</p>
      </GlassModal>
      <ReauthHost />
    </>
  )
}
