/**
 * Locking an account after repeated wrong passwords.
 *
 *  - LOCK_AFTER_FAILURES wrong passwords in a row (at sign-in, or when the
 *    password is asked for again while signed in) lock the account; a
 *    partner unlocks it in Settings → People.
 *  - A lock no other partner could lift (the only partner who can sign in)
 *    lifts by itself SELF_UNLOCK_MINUTES after it began, so a practice can't
 *    lock itself out for good.
 *  - A good password clears the count.
 */
import { LOCK_AFTER_FAILURES, SELF_UNLOCK_MINUTES, WARN_FROM_FAILURE } from '@shared/contracts/auth'
import { londonDateTime } from '@shared/domain/dates'
import type { Role } from '@shared/domain/roles'
import type { Db } from '../db/connection'

export interface LockInfo {
  locked: boolean
  /** When the lock lifts by itself, for a lock nobody else could lift; else null. */
  selfUnlocksAt: Date | null
  /** The lock has lifted by itself: clear it with clearFailures() when the person signs in. */
  lapsed: boolean
}

/** True when another partner who can sign in could unlock this person. */
export function anotherPartnerCanUnlock(db: Db, userId: number): boolean {
  return !!db
    .prepare("SELECT 1 FROM users WHERE role = 'partner' AND active = 1 AND locked_at IS NULL AND password_hash IS NOT NULL AND id <> ? LIMIT 1")
    .get(userId)
}

export function lockInfo(db: Db, user: { id: number; role: Role; locked_at: string | null }, now: Date): LockInfo {
  if (!user.locked_at) return { locked: false, selfUnlocksAt: null, lapsed: false }
  if (user.role === 'partner' && !anotherPartnerCanUnlock(db, user.id)) {
    const at = new Date(Date.parse(user.locked_at) + SELF_UNLOCK_MINUTES * 60_000)
    return now.getTime() >= at.getTime() ? { locked: false, selfUnlocksAt: at, lapsed: true } : { locked: true, selfUnlocksAt: at, lapsed: false }
  }
  return { locked: true, selfUnlocksAt: null, lapsed: false }
}

/** '15:42' in UK time. */
export function clockTime(at: Date): string {
  const t = londonDateTime(at)
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`
}

function whatNext(info: Pick<LockInfo, 'selfUnlocksAt'>): string {
  return info.selfUnlocksAt
    ? `As no other partner can unlock it, it unlocks by itself at ${clockTime(info.selfUnlocksAt)}.`
    : 'Ask a partner to unlock it in Settings → People.'
}

/** The answer for a sign-in to an account that is already locked. */
export function lockedMessage(info: Pick<LockInfo, 'selfUnlocksAt'>): string {
  return `This account is locked after too many wrong passwords. ${whatNext(info)}`
}

/** The answer for the wrong password that locked the account. */
export function lockedNowMessage(info: Pick<LockInfo, 'selfUnlocksAt'>, signedOut = false): string {
  const first = signedOut
    ? `That was the ${ordinal(LOCK_AFTER_FAILURES)} wrong password in a row, so you have been signed out and the account is locked.`
    : `That was the ${ordinal(LOCK_AFTER_FAILURES)} wrong password in a row, so the account is now locked.`
  return `${first} ${whatNext(info)}`
}

function ordinal(n: number): string {
  const words: Record<number, string> = { 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth' }
  return words[n] ?? `${n}th`
}

/** What to add to a wrong-password answer once the lock is near: '2 more wrong passwords will lock the account.' */
export function nearLockWarning(failures: number): string | null {
  if (failures < WARN_FROM_FAILURE || failures >= LOCK_AFTER_FAILURES) return null
  const left = LOCK_AFTER_FAILURES - failures
  return left === 1 ? 'One more wrong password will lock the account.' : `${left} more wrong passwords will lock the account.`
}

export interface WrongPassword {
  /** Wrong passwords in a row, this one included. */
  failures: number
  /** This one locked the account. */
  lockedNow: boolean
}

/** Counts a wrong password, locking the account at the limit. */
export function recordWrongPassword(db: Db, userId: number, now: Date): WrongPassword {
  const row = db
    .prepare('UPDATE users SET failed_sign_ins = failed_sign_ins + 1 WHERE id = ? RETURNING failed_sign_ins AS failures, locked_at AS lockedAt')
    .get(userId) as { failures: number; lockedAt: string | null }
  if (row.failures >= LOCK_AFTER_FAILURES && !row.lockedAt) {
    db.prepare('UPDATE users SET locked_at = ? WHERE id = ?').run(now.toISOString(), userId)
    return { failures: row.failures, lockedNow: true }
  }
  return { failures: row.failures, lockedNow: false }
}

/** A good password: the count starts again (and a lapsed lock is cleared). */
export function clearFailures(db: Db, userId: number): void {
  db.prepare('UPDATE users SET failed_sign_ins = 0, locked_at = NULL WHERE id = ? AND (failed_sign_ins <> 0 OR locked_at IS NOT NULL)').run(userId)
}
