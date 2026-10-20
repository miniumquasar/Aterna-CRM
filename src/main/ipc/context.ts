/**
 * What a handler gets besides its request, and the binding between a window
 * and its session.
 *
 * A session is bound to the window (webContents) that signed in: the
 * renderer never holds a token, so another window, or a page that reloads
 * into a different webContents, has no session. When a window closes, its
 * session ends.
 */
import type { Actor } from '@shared/domain/roles'
import type { ApiEvents, EventName } from '@shared/ipc/events'
import type { Db } from '../db/connection'
import type { Logger } from '../app/logger'
import { UserFacingError } from './errors'

export interface SessionControl {
  /** The session bound to the calling window, or null. */
  readonly id: string | null
  /** Binds a session to the calling window (after signing in). */
  bind(sessionId: string): void
  /** Unbinds the calling window (after signing out). */
  unbind(): void
}

export interface HandlerContext {
  readonly db: Db
  /** The person signed in on the calling window; null on public channels when nobody is. */
  readonly actor: Actor | null
  /** The actor, or an 'unauthenticated' refusal. */
  requireActor(): Actor
  now(): Date
  emit<E extends EventName>(event: E, payload: ApiEvents[E]): void
  readonly session: SessionControl
  readonly log: Logger
  /** The calling window's id (for code that keys state by window). */
  readonly senderId: number
}

// ── window ↔ session ───────────────────────────────────────────────────────

const bindings = new Map<number, string>()

export function boundSession(senderId: number): string | null {
  return bindings.get(senderId) ?? null
}

export function bindSession(senderId: number, sessionId: string): void {
  bindings.set(senderId, sessionId)
}

export function unbindSession(senderId: number): void {
  bindings.delete(senderId)
}

/** Forgets every binding (tests). */
export function clearSessionBindings(): void {
  bindings.clear()
}

/**
 * Turns a session id into the person, or null when the session has ended or
 * the person's access is off. The auth domain may replace it (idle sign-out,
 * last-seen times) with setSessionResolver().
 */
export type SessionResolver = (db: Db, sessionId: string, now: Date) => Actor | null

export const defaultSessionResolver: SessionResolver = (db, sessionId) => {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.ended_at IS NULL AND u.active = 1`
    )
    .get(sessionId) as Actor | undefined
  return row ?? null
}

let resolver: SessionResolver = defaultSessionResolver

export function setSessionResolver(next: SessionResolver): void {
  resolver = next
}

export function resetSessionResolver(): void {
  resolver = defaultSessionResolver
}

/** The person signed in on the window, unbinding a session that has ended. */
export function resolveActor(db: Db, senderId: number, now: Date): Actor | null {
  const sessionId = boundSession(senderId)
  if (!sessionId) return null
  const actor = resolver(db, sessionId, now)
  if (!actor) unbindSession(senderId)
  return actor
}

/** Ends a session in the database. */
export function endSession(db: Db, sessionId: string, reason: 'signed_out' | 'idle' | 'window_closed' | 'expired' | 'access_removed', now: Date = new Date()): void {
  db.prepare('UPDATE sessions SET ended_at = ?, end_reason = ? WHERE id = ? AND ended_at IS NULL').run(now.toISOString(), reason, sessionId)
}

/** A window closed: its session ends. */
export function endSessionForSender(db: Db, senderId: number, now: Date = new Date()): void {
  const sessionId = boundSession(senderId)
  if (!sessionId) return
  unbindSession(senderId)
  endSession(db, sessionId, 'window_closed', now)
}

/** At start-up: sessions left open by the last run can never be used again, so they are closed. */
export function closeAbandonedSessions(db: Db, now: Date = new Date()): number {
  return db.prepare("UPDATE sessions SET ended_at = ?, end_reason = 'app_restarted' WHERE ended_at IS NULL").run(now.toISOString()).changes
}

export interface ContextDeps {
  db: Db
  senderId: number
  actor: Actor | null
  now: () => Date
  emit: <E extends EventName>(event: E, payload: ApiEvents[E]) => void
  log: Logger
}

export function createContext(d: ContextDeps): HandlerContext {
  return {
    db: d.db,
    actor: d.actor,
    requireActor() {
      if (!d.actor) throw new UserFacingError('unauthenticated', 'Sign in to carry on.')
      return d.actor
    },
    now: d.now,
    emit: d.emit,
    log: d.log,
    senderId: d.senderId,
    session: {
      get id() {
        return boundSession(d.senderId)
      },
      bind: (sessionId) => bindSession(d.senderId, sessionId),
      unbind: () => unbindSession(d.senderId)
    }
  }
}
