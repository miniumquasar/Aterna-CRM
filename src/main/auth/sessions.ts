/**
 * Sessions after sign-in: who the window's session belongs to, idle
 * sign-out and the last time each person used the app.
 *
 *  - The session resolver (installed with setSessionResolver() when the auth
 *    handlers register) turns the window's session into the person, ending
 *    it when their access has been turned off, or when they have not used
 *    the app for their idle time (plus IDLE_GRACE_SECONDS, so the renderer's
 *    own warning and sign-out always come first).
 *  - "Using the app" is input: the renderer reports it (auth.activity) at
 *    most every ACTIVITY_REPORT_SECONDS. Background reads (the notification
 *    bell, a screen refreshing) don't count, so they never keep a session
 *    open. sessions.last_seen_at holds the last report.
 *  - The idle time is the practice's (a partner chooses it; 30 minutes by
 *    default), or the person's own if shorter.
 *  - A background job ends idle sessions too, and tells the window, so the
 *    screen goes back to sign-in even if nothing on it asks the main process
 *    anything.
 */
import {
  DEFAULT_IDLE_MINUTES,
  IDLE_GRACE_SECONDS,
  effectiveIdleMinutes,
  isIdleChoice,
  type SessionInfo
} from '@shared/contracts/auth'
import type { Actor, Role } from '@shared/domain/roles'
import type { Db } from '../db/connection'
import { getSetting } from '../db/settings'
import { endSession, type SessionResolver } from '../ipc/context'
import { intervalJob, registerJob, registeredJobs, type JobContext } from '../jobs'
import { clearReauth, reauthUntil } from './reauth'

export type SessionEndReason = Parameters<typeof endSession>[2]

/** The practice's idle sign-out, in minutes. */
export function practiceIdleMinutes(db: Db): number {
  const value = getSetting<unknown>(db, 'auth', 'idleMinutes')
  return isIdleChoice(value) ? value : DEFAULT_IDLE_MINUTES
}

/** The idle time for a person whose own choice is `ownMinutes`. */
export function idleMinutesFor(db: Db, ownMinutes: number | null): number {
  return effectiveIdleMinutes(practiceIdleMinutes(db), ownMinutes)
}

// ── Sessions bound to the window ────────────────────────────────────────────

/** Sessions this module bound to the app's window, so the idle job knows when to tell it. */
const windowSessions = new Set<string>()

export function trackWindowSession(sessionId: string): void {
  windowSessions.add(sessionId)
}

/** Ends a session in the database, with its password re-entry proof. */
export function finishSession(db: Db, sessionId: string, reason: SessionEndReason, now: Date): void {
  endSession(db, sessionId, reason, now)
  clearReauth(sessionId)
  windowSessions.delete(sessionId)
}

/** Ends every open session of a person (access turned off, password reset), except `keep`. Returns how many. */
export function endPersonSessions(db: Db, userId: number, reason: SessionEndReason, now: Date, keep: string | null = null): number {
  const open = db.prepare('SELECT id FROM sessions WHERE user_id = ? AND ended_at IS NULL').all(userId) as Array<{ id: string }>
  let ended = 0
  for (const { id } of open) {
    if (id === keep) continue
    finishSession(db, id, reason, now)
    ended += 1
  }
  return ended
}

interface SessionRow {
  user_id: number
  started_at: string
  last_seen_at: string
  username: string
  name: string
  role: Role
  active: number
  idle_minutes: number | null
}

function openSession(db: Db, sessionId: string): SessionRow | undefined {
  return db
    .prepare(
      `SELECT s.user_id, s.started_at, s.last_seen_at, u.username, u.name, u.role, u.active, u.idle_minutes
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.ended_at IS NULL`
    )
    .get(sessionId) as SessionRow | undefined
}

function idleFor(db: Db, row: Pick<SessionRow, 'last_seen_at' | 'idle_minutes'>, now: Date): boolean {
  const limitMs = idleMinutesFor(db, row.idle_minutes) * 60_000 + IDLE_GRACE_SECONDS * 1000
  const seen = Date.parse(row.last_seen_at)
  return Number.isFinite(seen) && now.getTime() - seen > limitMs
}

/**
 * The session resolver: the person, or null when the session has ended,
 * their access is off, or they have been idle too long (which ends it).
 */
export const resolveSession: SessionResolver = (db, sessionId, now) => {
  const row = openSession(db, sessionId)
  if (!row) return null
  if (!row.active) {
    finishSession(db, sessionId, 'access_removed', now)
    return null
  }
  if (idleFor(db, row, now)) {
    finishSession(db, sessionId, 'idle', now)
    return null
  }
  const actor: Actor = { id: row.user_id, username: row.username, name: row.name, role: row.role }
  return actor
}

/** The person used the app: the idle clock starts again. */
export function touchSession(db: Db, sessionId: string, now: Date): void {
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ? AND ended_at IS NULL').run(now.toISOString(), sessionId)
}

export function sessionInfo(db: Db, sessionId: string, now: Date): SessionInfo {
  const row = openSession(db, sessionId)
  if (!row) throw new Error('sessionInfo() needs an open session.')
  return {
    signedInAt: row.started_at,
    lastActiveAt: row.last_seen_at,
    idleMinutes: idleMinutesFor(db, row.idle_minutes),
    reauthUntil: reauthUntil(sessionId, now)?.toISOString() ?? null
  }
}

/** Ends every session idle for longer than its limit. Returns the ids ended, and whether one was the window's. */
export function endIdleSessions(db: Db, now: Date): { ended: string[]; windowSessionEnded: boolean } {
  const rows = db
    .prepare(
      `SELECT s.id, s.last_seen_at, u.idle_minutes FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.ended_at IS NULL`
    )
    .all() as Array<{ id: string; last_seen_at: string; idle_minutes: number | null }>
  const ended: string[] = []
  let windowSessionEnded = false
  for (const row of rows) {
    if (!idleFor(db, row, now)) continue
    if (windowSessions.has(row.id)) windowSessionEnded = true
    finishSession(db, row.id, 'idle', now)
    ended.push(row.id)
  }
  return { ended, windowSessionEnded }
}

export const IDLE_JOB = 'auth.idleSignOut'

/** The background check for idle sessions (start-up step 9 starts it; it never runs in tests). */
export function registerIdleJob(): void {
  if (registeredJobs().includes(IDLE_JOB)) return
  registerJob(
    intervalJob(IDLE_JOB, { firstRunAfterMs: 30_000, everyMs: 30_000 }, (ctx: JobContext) => {
      const { ended, windowSessionEnded } = endIdleSessions(ctx.db, ctx.now())
      if (ended.length) ctx.log.info(`${ended.length} idle session(s) ended`)
      if (windowSessionEnded) ctx.emit('session.ended', { reason: 'idle' })
    })
  )
}
