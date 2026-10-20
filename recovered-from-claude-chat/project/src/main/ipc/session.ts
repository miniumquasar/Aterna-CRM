/**
 * session.ts — the signed-in person as an Actor, and the two reply shapes the
 * screens expect. Messages written for people (UserFacingError, AuthError) pass
 * through; anything else is logged here and replaced with a plain sentence, so
 * no stack trace or SQL ever reaches a screen.
 */
import type { IpcResult } from '@shared/types'
import { AuthError } from '../auth/service'
import { UserFacingError, type Actor } from '../access/policy'
import { getCurrentUser } from './auth'

/** The person signed in. Throws "Sign in first." when nobody is. */
export function actor(): Actor {
  const user = getCurrentUser()
  if (!user) throw new UserFacingError('Sign in first.')
  return { id: user.id, name: user.name, role: user.role }
}

function message(scope: string, err: unknown): string {
  if (err instanceof UserFacingError || err instanceof AuthError) return err.message
  console.error(`[${scope}]`, err)
  return 'Something went wrong. Nothing was changed.'
}

/** `{ success: true, ...data }` or `{ success: false, error }` — the older screens' shape. */
export function reply<T extends object>(scope: string, fn: () => T): ({ success: true } & T) | { success: false; error: string } {
  try {
    return { success: true, ...fn() }
  } catch (err) {
    return { success: false, error: message(scope, err) }
  }
}

/** reply(), for work that waits (a save dialog, printing). */
export async function replyAsync<T extends object>(scope: string, fn: () => Promise<T>): Promise<({ success: true } & T) | { success: false; error: string }> {
  try {
    return { success: true, ...(await fn()) }
  } catch (err) {
    return { success: false, error: message(scope, err) }
  }
}

/** `{ ok: true, data }` or `{ ok: false, error }`. */
export function result<T>(scope: string, fn: () => T): IpcResult<T> {
  try {
    return { ok: true, data: fn() }
  } catch (err) {
    return { ok: false, error: message(scope, err) }
  }
}

/** result(), for work that waits (the local AI, a save dialog). */
export async function resultAsync<T>(scope: string, fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    return { ok: false, error: message(scope, err) }
  }
}

/** For lists the screens read directly: the rows, or `fallback` when they can't be read (logged unless it is a refusal). */
export function rows<T>(scope: string, fallback: T, fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    message(scope, err)
    return fallback
  }
}
