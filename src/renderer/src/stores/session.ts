/**
 * The signed-in person, as the renderer knows them: read from auth.status
 * (the session itself stays in the main process). Owned by the auth domain.
 *
 * Also the note the sign-in screen shows after a sign-out the person didn't
 * ask for (idle, locked, access turned off), and the username last used on
 * this PC, so the sign-in screen can offer it.
 */
import { create } from 'zustand'
import type { AuthStatus } from '@shared/contracts/auth'
import type { Actor } from '@shared/domain/roles'
import { useApiMutation, useApiQuery } from '../lib/api'

export function useAuthStatus(): ReturnType<typeof useApiQuery<'auth.status'>> {
  return useApiQuery('auth.status', undefined, { staleTime: 60_000 })
}

/** The person signed in, or null. */
export function useActor(): Actor | null {
  return useAuthStatus().data?.actor ?? null
}

/** Signs out of this window; every query refreshes for the sign-in screen. */
export function useSignOut(): ReturnType<typeof useApiMutation<'auth.signOut'>> {
  return useApiMutation('auth.signOut', { invalidates: ['auth.status'] })
}

// ── Why the person is back at sign-in ──────────────────────────────────────

export type SignOutNotice =
  | { kind: 'idle'; minutes: number | null }
  | { kind: 'locked' }
  | { kind: 'access_removed' }
  | { kind: 'expired' }

interface NoticeState {
  notice: SignOutNotice | null
  setNotice(notice: SignOutNotice | null): void
}

export const useSignOutNotice = create<NoticeState>((set) => ({
  notice: null,
  setNotice: (notice) => set({ notice })
}))

export function setSignOutNotice(notice: SignOutNotice | null): void {
  useSignOutNotice.getState().setNotice(notice)
}

// ── The username last used on this PC ──────────────────────────────────────

const LAST_USERNAME = 'aeterna.lastUsername'

export function lastUsername(): string {
  try {
    return window.localStorage.getItem(LAST_USERNAME) ?? ''
  } catch {
    return ''
  }
}

export function rememberUsername(username: string | null): void {
  try {
    if (username) window.localStorage.setItem(LAST_USERNAME, username)
    else window.localStorage.removeItem(LAST_USERNAME)
  } catch {
    // Storage may be unavailable; the username just isn't offered next time.
  }
}

export type { AuthStatus }
