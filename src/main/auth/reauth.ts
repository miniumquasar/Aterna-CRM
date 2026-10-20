/**
 * Password re-entry for protected actions (printing the recovery sheet,
 * opening the vault, resetting someone's password).
 *
 * auth.reauth checks the password and leaves a proof here, in the main
 * process only, bound to the session that gave it and good for
 * REAUTH_MINUTES. Signing in (or choosing a password) counts too, since the
 * password was just typed. A protected handler calls requireRecentReauth():
 *
 *   handle('backup.printRecoverySheet', (req, ctx) => {
 *     requireRecentReauth(ctx, 'print the recovery sheet')
 *     …
 *   })
 *
 * Without a recent proof it refuses with { code: 'forbidden', field: 'reauth' }
 * (REAUTH_REQUIRED_FIELD); the renderer then asks for the password
 * (components/session/reauth.ts) and tries again. A proof ends with its
 * session, at sign-out, and when the password changes.
 */
import { REAUTH_MINUTES, REAUTH_REQUIRED_FIELD } from '@shared/contracts/auth'
import { UserFacingError } from '../ipc/errors'

const proofs = new Map<string, number>()

function prune(now: number): void {
  for (const [id, until] of proofs) if (until <= now) proofs.delete(id)
}

/** Records that the session's person has just given their password. Returns when the proof ends. */
export function grantReauth(sessionId: string, now: Date = new Date()): Date {
  prune(now.getTime())
  const until = now.getTime() + REAUTH_MINUTES * 60_000
  proofs.set(sessionId, until)
  return new Date(until)
}

/** When the session's proof ends, or null when there is none (or it has ended). */
export function reauthUntil(sessionId: string | null | undefined, now: Date = new Date()): Date | null {
  if (!sessionId) return null
  const until = proofs.get(sessionId)
  if (until === undefined) return null
  if (until <= now.getTime()) {
    proofs.delete(sessionId)
    return null
  }
  return new Date(until)
}

/** Ends the session's proof (sign-out, a new password, the session ending). */
export function clearReauth(sessionId: string | null | undefined): void {
  if (sessionId) proofs.delete(sessionId)
}

/** Forgets every proof (tests). */
export function clearAllReauth(): void {
  proofs.clear()
}

/** The part of a handler's context requireRecentReauth reads. */
export interface ReauthContext {
  readonly session: { readonly id: string | null }
  now(): Date
}

/**
 * Refuses unless the person on this window confirmed their password in the
 * last REAUTH_MINUTES. `action` finishes the sentence: 'print the recovery
 * sheet' → "For your security, enter your password again to print the
 * recovery sheet."
 */
export function requireRecentReauth(ctx: ReauthContext, action = 'do that'): void {
  if (!reauthUntil(ctx.session.id, ctx.now())) {
    throw new UserFacingError('forbidden', `For your security, enter your password again to ${action}.`, REAUTH_REQUIRED_FIELD)
  }
}
