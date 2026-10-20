/**
 * The signed-in person, as the renderer knows them: read from auth.status
 * (the session itself stays in the main process). Owned by the auth domain.
 */
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

export type { AuthStatus }
