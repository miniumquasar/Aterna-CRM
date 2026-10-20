/**
 * Asking for the password again before a protected action, for any screen.
 *
 * Protected channels (the recovery sheet, the vault, resetting someone's
 * password) refuse with { code: 'forbidden', field: 'reauth' } unless the
 * password was confirmed in the last few minutes. Two ways to use it:
 *
 *   // Ask first, only if needed:
 *   if (!(await ensureRecentReauth({ action: 'print the recovery sheet' }))) return
 *   print.mutate(…)
 *
 *   // Or try, and ask only when refused:
 *   await withReauth(() => print.mutateAsync(…), { action: 'print the recovery sheet' })
 *
 * The dialog itself (ReauthDialog.tsx) is mounted by the signed-in shell
 * (through IdleWarning) and by the setup wizard.
 */
import { create } from 'zustand'
import { REAUTH_REQUIRED_FIELD } from '@shared/contracts/auth'
import { ApiCallError, invoke } from '../../lib/api'

export interface ReauthOptions {
  /** Finishes "To …, enter your password again.": 'print the recovery sheet'. */
  action?: string
}

interface Pending {
  id: number
  options: ReauthOptions
  resolve: (confirmed: boolean) => void
}

interface ReauthState {
  pending: Pending | null
  open(p: Pending): void
  close(id: number): void
}

export const useReauthStore = create<ReauthState>((set) => ({
  pending: null,
  open: (p) => set({ pending: p }),
  close: (id) => set((s) => (s.pending?.id === id ? { pending: null } : s))
}))

let nextId = 1

/** Asks for the password. Resolves true once it is confirmed, false if the person cancels. */
export function requestReauth(options: ReauthOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const state = useReauthStore.getState()
    // Only one question at a time: an earlier one is answered "no".
    state.pending?.resolve(false)
    state.open({ id: nextId++, options, resolve })
  })
}

/** Confirmed recently enough for the action to finish (20 seconds to spare)? Otherwise asks. */
export async function ensureRecentReauth(options: ReauthOptions = {}): Promise<boolean> {
  const session = await invoke('auth.session', undefined)
  if (session.ok && session.data.reauthUntil && Date.parse(session.data.reauthUntil) - Date.now() > 20_000) return true
  return requestReauth(options)
}

/** True for a refusal that asks for the password again. */
export function isReauthRequired(error: unknown): boolean {
  return error instanceof ApiCallError && error.code === 'forbidden' && error.field === REAUTH_REQUIRED_FIELD
}

/** Thrown by withReauth() when the person cancels the password question. */
export class ReauthCancelled extends Error {
  constructor() {
    super('The password wasn’t confirmed, so nothing was changed.')
    this.name = 'ReauthCancelled'
  }
}

/** Runs `run`; if it is refused for want of the password, asks for it and runs it once more. */
export async function withReauth<T>(run: () => Promise<T>, options: ReauthOptions = {}): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (!isReauthRequired(err)) throw err
    if (!(await requestReauth(options))) throw new ReauthCancelled()
    return run()
  }
}
