/**
 * Sign-in, sessions and the first partner: the minimum the app needs to run
 * end to end. The auth domain extends this (lockout, invites, people, idle
 * sign-out, re-entry of the password for sensitive actions).
 */
import { randomBytes } from 'node:crypto'
import type { AuthStatus, FirstPartnerInput, SignInInput } from '@shared/contracts/auth'
import type { Actor } from '@shared/domain/roles'
import { recordChange } from '../access/audit'
import { requireRole } from '../access/policy'
import type { Db } from '../db/connection'
import { getSetting, setSetting } from '../db/settings'
import { UserFacingError, invalid } from '../ipc/errors'
import { optionalText, record, requiredText } from '../ipc/input'
import { decoyHash, hashPassword, passwordProblem, verifyPassword, type ScryptCost } from './passwords'

const USERNAME = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/

export function hasUsers(db: Db): boolean {
  return !!db.prepare('SELECT 1 FROM users WHERE password_hash IS NOT NULL AND active = 1 LIMIT 1').get()
}

export function firmName(db: Db): string | null {
  const row = db.prepare('SELECT name FROM firm WHERE id = 1').get() as { name: string } | undefined
  return row?.name ?? null
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

function actorById(db: Db, id: number): Actor {
  return db.prepare('SELECT id, username, name, role FROM users WHERE id = ?').get(id) as Actor
}

function checkNewUsername(value: unknown): string {
  const username = requiredText(value, 'username', 'A username', { max: 64 })
  if (!USERNAME.test(username)) {
    throw invalid('Use 3 to 64 letters, numbers, dots, hyphens or underscores for the username, starting with a letter or number.', 'username')
  }
  return username
}

export interface SignedIn {
  actor: Actor
  sessionId: string
}

/**
 * While nobody can sign in: saves the firm's name, creates the first partner
 * and starts their session, all in one transaction.
 */
export function createFirstPartner(db: Db, req: FirstPartnerInput, now: Date = new Date(), cost?: ScryptCost): SignedIn {
  const body = record(req)
  const firm = requiredText(body.firmName, 'firmName', 'The firm’s name', { max: 200 })
  const name = requiredText(body.name, 'name', 'Your name', { max: 120 })
  const username = checkNewUsername(body.username)
  const password = typeof body.password === 'string' ? body.password : ''
  const problem = passwordProblem(password)
  if (problem) throw invalid(problem, 'password')
  const hash = hashPassword(password, cost)

  return db.transaction((): SignedIn => {
    if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
      throw new UserFacingError('conflict', 'The first partner has already been set up. Sign in instead.')
    }
    const at = now.toISOString()
    const id = Number(
      db
        .prepare(
          `INSERT INTO users (username, name, role, password_hash, password_changed_at, created_at, updated_at)
           VALUES (?, ?, 'partner', ?, ?, ?, ?)`
        )
        .run(username, name, hash, at, at, at).lastInsertRowid
    )
    const actor = actorById(db, id)
    db.prepare(
      `INSERT INTO firm (id, name, created_at, updated_at, updated_by) VALUES (1, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).run(firm, at, at, id)
    recordChange(db, actor, { action: 'setup.createFirstPartner', entity: 'user', entityId: id, summary: 'Created the first partner', after: { username, name, role: 'partner' } }, now)
    recordChange(db, actor, { action: 'firm.update', entity: 'firm', entityId: 1, summary: 'Named the firm', after: { name: firm } }, now)
    const sessionId = createSession(db, id, now)
    db.prepare('UPDATE users SET last_sign_in_at = ? WHERE id = ?').run(at, id)
    db.prepare("INSERT INTO sign_in_events (username, user_id, outcome, created_at) VALUES (?, ?, 'success', ?)").run(username, id, at)
    return { actor, sessionId }
  })()
}

const WRONG = 'That username and password don’t match. Check them and try again.'

/** Checks the password and starts a session. Unknown names and wrong passwords get the same answer. */
export function signIn(db: Db, req: SignInInput, now: Date = new Date()): SignedIn {
  const body = record(req)
  const username = optionalText(body.username, 'username', 'The username', { max: 64 }) ?? ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!username || !password) throw invalid('Enter your username and password.', username ? 'password' : 'username')

  const user = db
    .prepare('SELECT id, username, name, role, password_hash, active, locked_at FROM users WHERE username = ?')
    .get(username) as { id: number; username: string; name: string; role: Actor['role']; password_hash: string | null; active: number; locked_at: string | null } | undefined
  const at = now.toISOString()
  const event = (outcome: string, userId: number | null): void => {
    db.prepare('INSERT INTO sign_in_events (username, user_id, outcome, created_at) VALUES (?, ?, ?, ?)').run(username, userId, outcome, at)
  }

  if (!user || !user.password_hash) {
    verifyPassword(password, decoyHash())
    event('unknown_user', user?.id ?? null)
    throw new UserFacingError('invalid', WRONG)
  }
  if (!verifyPassword(password, user.password_hash)) {
    event('wrong_password', user.id)
    db.prepare('UPDATE users SET failed_sign_ins = failed_sign_ins + 1 WHERE id = ?').run(user.id)
    throw new UserFacingError('invalid', WRONG)
  }
  if (!user.active) {
    event('access_off', user.id)
    throw new UserFacingError('forbidden', 'Your access to AETERNA CRM is turned off. Ask a partner to turn it back on.')
  }
  if (user.locked_at) {
    event('locked', user.id)
    throw new UserFacingError('locked', 'Your account is locked after too many attempts. Ask a partner to unlock it.')
  }
  return db.transaction((): SignedIn => {
    db.prepare('UPDATE users SET failed_sign_ins = 0, last_sign_in_at = ? WHERE id = ?').run(at, user.id)
    event('success', user.id)
    return { actor: { id: user.id, username: user.username, name: user.name, role: user.role }, sessionId: createSession(db, user.id, now) }
  })()
}

/** A partner finishes the first-run wizard. Finishing twice changes nothing. */
export function finishSetup(db: Db, actor: Actor | null, now: Date = new Date()): void {
  const partner = requireRole(actor, 'partner', 'finish setting up the practice')
  if (!firmName(db)) throw invalid('Enter the firm’s name before finishing.', 'firmName')
  db.transaction(() => {
    if (setupComplete(db)) return
    const at = now.toISOString()
    setSetting(db, 'setup', 'completedAt', at, partner.id)
    recordChange(db, partner, { action: 'setup.finish', entity: 'setup', summary: 'Finished setting up the practice', after: { completedAt: at } }, now)
  })()
}
