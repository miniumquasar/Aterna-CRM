/**
 * Signing in, the first partner, and finishing setup.
 *
 *  - Username and password only; passwords hashed with scrypt (passwords.ts).
 *  - An unknown username and a wrong password get the same answer, and take
 *    the same time (a decoy hash is checked for unknown names).
 *  - LOCK_AFTER_FAILURES wrong passwords in a row lock the account until a
 *    partner unlocks it (lockout.ts); the answer warns as the lock nears.
 *  - A locked account is refused whatever password is typed, so a lock
 *    can't be used to test guesses.
 *  - A temporary password (a partner reset it) starts no session: the person
 *    chooses their own first (auth.completePasswordChange).
 *  - Every attempt goes into sign_in_events, for Security → Sign-in history.
 */
import { randomBytes } from 'node:crypto'
import {
  WARN_FROM_FAILURE,
  looksLikeEmail,
  usernameProblem,
  type AuthStatus,
  type CompletePasswordChangeInput,
  type FirstPartnerInput,
  type PasswordChangeNeeded,
  type SignInInput,
  type SignInOutcome
} from '@shared/contracts/auth'
import type { Actor, Role } from '@shared/domain/roles'
import { recordChange } from '../access/audit'
import { requireRole } from '../access/policy'
import type { Db } from '../db/connection'
import { getSetting, setSetting } from '../db/settings'
import { UserFacingError, invalid } from '../ipc/errors'
import { optionalText, record, requiredText } from '../ipc/input'
import { firmName as storedFirmName, saveFirm } from './firm'
import { clearFailures, lockInfo, lockedMessage, lockedNowMessage, nearLockWarning, recordWrongPassword } from './lockout'
import { decoyHash, hashPassword, passwordProblem, verifyPassword, type ScryptCost } from './passwords'
import { setupProgressStates } from './setup-state'

export function hasUsers(db: Db): boolean {
  return !!db.prepare('SELECT 1 FROM users WHERE password_hash IS NOT NULL AND active = 1 LIMIT 1').get()
}

export function firmName(db: Db): string | null {
  return storedFirmName(db)
}

export function setupComplete(db: Db): boolean {
  return getSetting<string>(db, 'setup', 'completedAt') !== undefined
}

export function authStatus(db: Db, actor: Actor | null): AuthStatus {
  const users = hasUsers(db)
  return {
    setupNeeded: !users,
    setupComplete: users && setupComplete(db),
    signedIn: actor !== null,
    actor,
    firmName: firmName(db)
  }
}

/** A new session for the user; the id stays in the main process. */
export function createSession(db: Db, userId: number, now: Date = new Date()): string {
  const id = randomBytes(32).toString('hex')
  const at = now.toISOString()
  db.prepare('INSERT INTO sessions (id, user_id, started_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?)').run(id, userId, at, at, at)
  return id
}

export function actorById(db: Db, id: number): Actor {
  const actor = db.prepare('SELECT id, username, name, role FROM users WHERE id = ?').get(id) as Actor | undefined
  if (!actor) throw new UserFacingError('not_found', 'That person is no longer in the practice.')
  return actor
}

/** A new username: the right shape, and nobody else's. */
export function checkNewUsername(db: Db, value: unknown, field = 'username'): string {
  const username = requiredText(value, field, 'A username', { max: 64 })
  const problem = usernameProblem(username)
  if (problem) throw invalid(problem, field)
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    throw new UserFacingError('conflict', `The username ${username} is taken. Choose another.`, field)
  }
  return username
}

/** A new password: the rules in passwordProblem(), with the person's username and name. */
export function checkNewPassword(value: unknown, context: { username?: string | null; name?: string | null }, field = 'password'): string {
  const password = typeof value === 'string' ? value : ''
  const problem = passwordProblem(password, context)
  if (problem) throw invalid(problem, field)
  return password
}

/** An optional email address: tidied, or refused with a plain sentence. */
export function checkOptionalEmail(value: unknown, field = 'email', label = 'The email address'): string | null {
  const email = optionalText(value, field, label, { max: 200 })
  if (email && !looksLikeEmail(email)) throw invalid('Enter an email address like name@example.co.uk, or leave it empty.', field)
  return email
}

export function recordSignInEvent(db: Db, username: string, userId: number | null, outcome: SignInOutcome, now: Date, detail: string | null = null): void {
  db.prepare('INSERT INTO sign_in_events (username, user_id, outcome, detail, created_at) VALUES (?, ?, ?, ?, ?)').run(username, userId, outcome, detail, now.toISOString())
}

/** A session begins: the sign-in time, the wrong-password count cleared, and the history. */
export function startSession(db: Db, user: { id: number; username: string }, now: Date, detail: string | null = null): string {
  const sessionId = createSession(db, user.id, now)
  db.prepare('UPDATE users SET last_sign_in_at = ? WHERE id = ?').run(now.toISOString(), user.id)
  clearFailures(db, user.id)
  recordSignInEvent(db, user.username, user.id, 'success', now, detail)
  return sessionId
}

export interface SignedIn {
  actor: Actor
  sessionId: string
}

/**
 * While nobody can sign in: saves the firm's name (when given), creates the
 * first partner and starts their session, all in one transaction.
 */
export function createFirstPartner(db: Db, req: FirstPartnerInput, now: Date = new Date(), cost?: ScryptCost): SignedIn {
  const body = record(req)
  const firm = optionalText(body.firmName, 'firmName', 'The firm’s name', { max: 200 })
  if (!firm && !storedFirmName(db)) throw invalid('Enter the firm’s name.', 'firmName')
  const name = requiredText(body.name, 'name', 'Your name', { max: 120 })
  const username = requiredText(body.username, 'username', 'A username', { max: 64 })
  const usernameIssue = usernameProblem(username)
  if (usernameIssue) throw invalid(usernameIssue, 'username')
  const email = checkOptionalEmail(body.email, 'email', 'Your email address')
  const password = checkNewPassword(body.password, { username, name })
  const hash = hashPassword(password, cost)

  return db.transaction((): SignedIn => {
    if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
      throw new UserFacingError('conflict', 'The first partner has already been set up. Sign in instead.')
    }
    const at = now.toISOString()
    const id = Number(
      db
        .prepare(
          `INSERT INTO users (username, name, email, role, password_hash, password_changed_at, created_at, updated_at)
           VALUES (?, ?, ?, 'partner', ?, ?, ?, ?)`
        )
        .run(username, name, email, hash, at, at, at).lastInsertRowid
    )
    const actor = actorById(db, id)
    recordChange(db, actor, { action: 'setup.createFirstPartner', entity: 'user', entityId: id, summary: 'Created the first partner', after: { username, name, email, role: 'partner' } }, now)
    if (firm) saveFirm(db, actor, { name: firm }, now, { summary: 'Named the firm' })
    const sessionId = startSession(db, { id, username }, now, 'The first partner, while setting up')
    return { actor, sessionId }
  })()
}

const WRONG = 'That username and password don’t match. Check them and try again.'
const UNKNOWN_HINT = 'If you’re not sure of your username, a partner can see it in Settings → People.'

export interface UserRow {
  id: number
  username: string
  name: string
  role: Role
  password_hash: string | null
  active: number
  locked_at: string | null
  must_change_password: number
  failed_sign_ins: number
}

/** Unknown names typed in the last hour, this one included (for the same warning a real account gets). */
function recentUnknown(db: Db, username: string, now: Date): number {
  const since = new Date(now.getTime() - 60 * 60_000).toISOString()
  const row = db
    .prepare("SELECT count(*) AS n FROM sign_in_events WHERE username = ? COLLATE NOCASE AND outcome = 'unknown_user' AND created_at > ?")
    .get(username, since) as { n: number }
  return row.n
}

export type Authenticated = { kind: 'ok'; user: UserRow } | { kind: 'passwordChange'; user: UserRow }

/**
 * Checks a username and password, recording the attempt when it fails and
 * throwing the answer to give. On success nothing is recorded yet: the
 * caller starts the session (or asks for a new password first).
 */
export function authenticate(db: Db, usernameInput: unknown, passwordInput: unknown, now: Date): Authenticated {
  const username = optionalText(usernameInput, 'username', 'The username', { max: 64 }) ?? ''
  const password = typeof passwordInput === 'string' ? passwordInput : ''
  if (!username || !password) throw invalid('Enter your username and password.', username ? 'password' : 'username')

  const user = db
    .prepare('SELECT id, username, name, role, password_hash, active, locked_at, must_change_password, failed_sign_ins FROM users WHERE username = ?')
    .get(username) as UserRow | undefined

  if (!user || !user.password_hash) {
    verifyPassword(password, decoyHash())
    recordSignInEvent(db, username, user?.id ?? null, 'unknown_user', now)
    const n = recentUnknown(db, username, now)
    throw new UserFacingError('invalid', n >= WARN_FROM_FAILURE ? `${WRONG} ${UNKNOWN_HINT}` : WRONG)
  }

  const right = verifyPassword(password, user.password_hash)
  const lock = lockInfo(db, user, now)
  if (lock.locked) {
    recordSignInEvent(db, user.username, user.id, 'locked', now, right ? 'The right password, but the account is locked' : null)
    throw new UserFacingError('locked', lockedMessage(lock))
  }
  if (lock.lapsed) clearFailures(db, user.id)

  if (!right) {
    const wrong = recordWrongPassword(db, user.id, now)
    if (wrong.lockedNow) {
      const info = lockInfo(db, { ...user, locked_at: now.toISOString() }, now)
      recordSignInEvent(db, user.username, user.id, 'wrong_password', now, `Locked after ${wrong.failures} wrong passwords in a row`)
      throw new UserFacingError('locked', lockedNowMessage(info))
    }
    recordSignInEvent(db, user.username, user.id, 'wrong_password', now)
    const warning = nearLockWarning(wrong.failures)
    throw new UserFacingError('invalid', warning ? `${WRONG} ${warning}` : WRONG)
  }
  if (!user.active) {
    recordSignInEvent(db, user.username, user.id, 'access_off', now)
    throw new UserFacingError('forbidden', 'Your access to AETERNA CRM is turned off. Ask a partner if you need it back.')
  }
  return user.must_change_password ? { kind: 'passwordChange', user } : { kind: 'ok', user }
}

export type SignInAnswer = { kind: 'signedIn'; actor: Actor; sessionId: string } | { kind: 'passwordChange'; person: PasswordChangeNeeded }

/** Checks the password and starts a session, or says a new password is needed first. */
export function signIn(db: Db, req: SignInInput, now: Date = new Date()): SignInAnswer {
  const body = record(req)
  // Not one transaction: a wrong password must stay recorded although the call is refused.
  const result = authenticate(db, body.username, body.password, now)
  const { user } = result
  if (result.kind === 'passwordChange') return { kind: 'passwordChange', person: { username: user.username, name: user.name } }
  const sessionId = db.transaction(() => startSession(db, user, now, user.locked_at ? 'The lock had lifted by itself' : null))()
  return { kind: 'signedIn', actor: { id: user.id, username: user.username, name: user.name, role: user.role }, sessionId }
}

/** A temporary password swapped for the person's own; then they are signed in. */
export function completePasswordChange(db: Db, req: CompletePasswordChangeInput, now: Date = new Date(), cost?: ScryptCost): SignedIn {
  const body = record(req)
  const result = authenticate(db, body.username, body.currentPassword, now)
  const { user } = result
  if (result.kind !== 'passwordChange') {
    throw new UserFacingError('conflict', 'That account doesn’t need a new password. Sign in as usual.')
  }
  const password = checkNewPassword(body.newPassword, { username: user.username, name: user.name }, 'newPassword')
  if (user.password_hash && verifyPassword(password, user.password_hash)) {
    throw invalid('Choose a password of your own, not the temporary one.', 'newPassword')
  }
  const hash = hashPassword(password, cost)
  return db.transaction((): SignedIn => {
    const at = now.toISOString()
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = ?, updated_at = ? WHERE id = ?').run(hash, at, at, user.id)
    const actor: Actor = { id: user.id, username: user.username, name: user.name, role: user.role }
    recordChange(
      db,
      actor,
      { action: 'account.changePassword', entity: 'user', entityId: user.id, summary: 'Chose a new password in place of a temporary one', after: { mustChangePassword: false } },
      now
    )
    const sessionId = startSession(db, user, now, 'Chose a new password in place of a temporary one')
    return { actor, sessionId }
  })()
}

/**
 * A partner finishes the first-run wizard. Steps not done are recorded as
 * left for later, in the one audit entry. Finishing twice changes nothing.
 */
export function finishSetup(db: Db, actor: Actor | null, now: Date = new Date()): void {
  const partner = requireRole(actor, 'partner', 'finish setting up the practice')
  if (!firmName(db)) throw invalid('Enter the firm’s name before finishing.', 'firmName')
  db.transaction(() => {
    if (setupComplete(db)) return
    const at = now.toISOString()
    const states = setupProgressStates(db)
    setSetting(db, 'setup', 'completedAt', at, partner.id)
    recordChange(
      db,
      partner,
      {
        action: 'setup.finish',
        entity: 'setup',
        summary: 'Finished setting up the practice',
        after: {
          completedAt: at,
          steps: Object.fromEntries(states.filter((s) => s.id !== 'done').map((s) => [s.id, s.state === 'done' ? 'done' : s.state === 'passed' ? 'gone through' : 'left for later']))
        }
      },
      now
    )
  })()
}
