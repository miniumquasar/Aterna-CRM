/**
 * Settings → Your sign-in, for everyone: your details, your recent sign-ins,
 * changing your password, and your own (shorter) idle sign-out. Also the
 * check behind password re-entry (auth.reauth), which counts towards the
 * same lock as signing in: someone at a PC left signed in can't keep
 * guessing.
 */
import { effectiveIdleMinutes, idleLabel, isIdleChoice, type Account, type SignInEvent } from '@shared/contracts/auth'
import type { Actor, Role } from '@shared/domain/roles'
import { recordChange } from '../access/audit'
import type { Db } from '../db/connection'
import { UserFacingError, invalid } from '../ipc/errors'
import { record } from '../ipc/input'
import { clearFailures, lockInfo, lockedNowMessage, nearLockWarning, recordWrongPassword } from './lockout'
import { hashPassword, verifyPassword, type ScryptCost } from './passwords'
import { grantReauth } from './reauth'
import { checkNewPassword, recordSignInEvent } from './service'
import { endPersonSessions, practiceIdleMinutes } from './sessions'

interface AccountRow {
  id: number
  username: string
  name: string
  email: string | null
  role: Role
  created_at: string
  last_sign_in_at: string | null
  password_changed_at: string | null
  idle_minutes: number | null
  password_hash: string | null
  locked_at: string | null
}

function accountRow(db: Db, id: number): AccountRow {
  const row = db
    .prepare('SELECT id, username, name, email, role, created_at, last_sign_in_at, password_changed_at, idle_minutes, password_hash, locked_at FROM users WHERE id = ?')
    .get(id) as AccountRow | undefined
  if (!row) throw new UserFacingError('unauthenticated', 'Sign in to carry on.')
  return row
}

export function getAccount(db: Db, actor: Actor): Account {
  const row = accountRow(db, actor.id)
  const practice = practiceIdleMinutes(db)
  const recent = db
    .prepare('SELECT id, created_at AS at, username, outcome, detail FROM sign_in_events WHERE user_id = ? ORDER BY id DESC LIMIT 8')
    .all(actor.id) as SignInEvent[]
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    lastSignInAt: row.last_sign_in_at,
    passwordChangedAt: row.password_changed_at,
    idle: { practiceMinutes: practice, ownMinutes: row.idle_minutes, effectiveMinutes: effectiveIdleMinutes(practice, row.idle_minutes) },
    recentSignIns: recent
  }
}

/**
 * Checks the signed-in person's own password. A wrong one counts towards
 * the lock; the one that locks the account also signs them out.
 */
export function confirmOwnPassword(db: Db, actor: Actor, password: unknown, now: Date, field: string, detail: string): void {
  const row = accountRow(db, actor.id)
  if (typeof password !== 'string' || password === '') throw invalid('Enter your password.', field)
  if (verifyPassword(password, row.password_hash)) {
    clearFailures(db, actor.id)
    return
  }
  const wrong = recordWrongPassword(db, actor.id, now)
  if (wrong.lockedNow) {
    recordSignInEvent(db, row.username, row.id, 'wrong_password', now, `${detail}; locked after ${wrong.failures} wrong passwords in a row`)
    endPersonSessions(db, actor.id, 'signed_out', now)
    const info = lockInfo(db, { id: row.id, role: row.role, locked_at: now.toISOString() }, now)
    throw new UserFacingError('locked', lockedNowMessage(info, true))
  }
  recordSignInEvent(db, row.username, row.id, 'wrong_password', now, detail)
  const warning = nearLockWarning(wrong.failures)
  throw invalid(warning ? `That password isn’t right. ${warning}` : 'That password isn’t right. Check it and try again.', field)
}

/** Changes your own password; your other sessions end, and this one may do protected actions for a few minutes. */
export function changeOwnPassword(db: Db, actor: Actor, sessionId: string | null, input: unknown, now: Date = new Date(), cost?: ScryptCost): Account {
  const body = record(input)
  confirmOwnPassword(db, actor, body.currentPassword, now, 'currentPassword', 'Wrong current password when changing it')
  const row = accountRow(db, actor.id)
  const password = checkNewPassword(body.newPassword, { username: row.username, name: row.name }, 'newPassword')
  if (verifyPassword(password, row.password_hash)) throw invalid('That is your current password. Choose a new one.', 'newPassword')
  const hash = hashPassword(password, cost)
  db.transaction(() => {
    const at = now.toISOString()
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(hash, at, at, actor.id, actor.id)
    const ended = endPersonSessions(db, actor.id, 'signed_out', now, sessionId)
    recordChange(db, actor, { action: 'account.changePassword', entity: 'user', entityId: actor.id, summary: 'Changed their password', after: { passwordChanged: true, ...(ended ? { otherSessionsEnded: ended } : {}) } }, now)
  })()
  if (sessionId) grantReauth(sessionId, now)
  return getAccount(db, actor)
}

/** Your own idle sign-out: one of the choices, no longer than the practice's; null for the practice's. */
export function setOwnIdle(db: Db, actor: Actor, input: unknown, now: Date = new Date()): Account {
  const minutes = record(input).minutes
  const practice = practiceIdleMinutes(db)
  if (minutes !== null && !isIdleChoice(minutes)) throw invalid('Choose how long from the list.', 'minutes')
  if (minutes !== null && minutes > practice) throw invalid(`The practice signs everyone out after ${idleLabel(practice)} at most. Choose that or less.`, 'minutes')
  const row = accountRow(db, actor.id)
  const next = minutes === practice ? null : minutes
  if (row.idle_minutes === next) return getAccount(db, actor)
  db.transaction(() => {
    db.prepare('UPDATE users SET idle_minutes = ?, updated_at = ? WHERE id = ?').run(next, now.toISOString(), actor.id)
    recordChange(
      db,
      actor,
      {
        action: 'account.setIdle',
        entity: 'user',
        entityId: actor.id,
        summary: next === null ? 'Chose the practice’s idle sign-out' : `Chose to be signed out after ${idleLabel(next)} without use`,
        before: { idleMinutes: row.idle_minutes },
        after: { idleMinutes: next }
      },
      now
    )
  })()
  return getAccount(db, actor)
}
