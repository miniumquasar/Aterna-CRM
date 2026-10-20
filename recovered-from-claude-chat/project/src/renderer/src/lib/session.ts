import { useAuthStore } from '@renderer/stores/crm/auth'

/** Set before a reload that should not show the launch splash again. */
export const SKIP_SPLASH = 'aeterna:skip-splash'
/** Why the last person was signed out, shown once on the sign-in screen. */
export const SIGNED_OUT_REASON = 'aeterna:signed-out-reason'

/**
 * Signs out and starts the window afresh. Reloading is what guarantees the
 * next person sees nothing of the last one's: every list, search box and
 * cached client goes with the page, not just the screens someone remembered
 * to clear.
 */
export async function signOut(reason?: string): Promise<void> {
  try {
    await window.api.logout()
  } finally {
    useAuthStore.getState().clear()
    try {
      sessionStorage.clear()
      sessionStorage.setItem(SKIP_SPLASH, '1')
      if (reason) sessionStorage.setItem(SIGNED_OUT_REASON, reason)
    } catch {
      /* storage unavailable: the reload still clears the page */
    }
    window.location.reload()
  }
}
