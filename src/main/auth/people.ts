/**
 * Settings → People: who can sign in, and what a partner can change about
 * them. Partners only. A partner never changes their own role or access,
 * never removes themselves and never resets their own password here (that is
 * Settings → Your sign-in), so the practice always keeps a partner who can
 * sign in.
 *
 *  - Role: partner, manager or staff.
 *  - Access off / on: off ends their sessions at once and stops sign-in,
 *    keeping every record that names them.
 *  - Unlock: after LOCK_AFTER_FAILURES wrong passwords.
 *  - Reset password: the partner sets a temporary password (their own
 *    password confirmed in the last few minutes); the person chooses their
 *    own at next sign-in.
 *  - Remove: refused while clients or past work are under the person
 *    (person-links.ts) — turn access off instead.
 *  - The practice's idle sign-out.
 */
import {
  IDLE_GRACE_SECONDS,
  LOCK_AFTER_FAILURES,
  idleLabel,
  isIdleChoice,
  type DirectoryPerson,
  type PeopleOverview,
  type Person,
  type RemovalCheck
} from '@shared/contracts/auth'
import { ROLE_LABELS, isRole, type Actor, type Role } from '@shared/domain/roles'
import { changedFields, recordChange } from '../access/audit'
import { requireRole } from '../access/policy'
import type { Db } from '../db/connection'
import { setSetting } from '../db/settings'
import { UserFacingError, invalid } from '../ipc/errors'
import { record, requiredId, requiredText } from '../ipc/input'
import { listInvites, roleNoun } from './invites'
import { lockInfo } from './lockout'
import { hashPassword, type ScryptCost } from './passwords'
import { personLinks } from './person-links'
import { checkNewPassword, checkOptionalEmail } from './service'
import { endPersonSessions, idleMinutesFor, practiceIdleMinutes } from './sessions'

interface PersonRow {
  id: number
  username: string
  name: string
  email: string | null
  role: Role
  active: number
  locked_at: string | null
  must_change_password: number
  failed_sign_ins: number
  last_sign_in_at: string | null
  created_at: string
  idle_minutes: number | null
  password_hash: string | null
  assigned: number
  responsible: number
  open_seen: string | null
}

const SELECT_PEOPLE = `
  SELECT u.id, u.username, u.name, u.email, u.role, u.active, u.locked_at, u.must_change_password, u.failed_sign_ins,
    u.last_sign_in_at, u.created_at, u.idle_minutes, u.password_hash,
    (SELECT count(*) FROM clients c WHERE c.assigned_to = u.id) AS assigned,
    (SELECT count(*) FROM clients c WHERE c.partner_id = u.id) AS responsible,
    (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id AND s.ended_at IS NULL) AS open_seen
  FROM users u`

function toPerson(db: Db, row: PersonRow, actor: Actor, now: Date): Person {
  const lock = lockInfo(db, row, now)
  const idleMs = idleMinutesFor(db, row.idle_minutes) * 60_000 + IDLE_GRACE_SECONDS * 1000
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active === 1,
    locked: lock.locked,
    lockedAt: lock.locked ? row.locked_at : null,
    selfUnlocksAt: lock.locked && lock.selfUnlocksAt ? lock.selfUnlocksAt.toISOString() : null,
    mustChangePassword: row.must_change_password === 1,
    failedSignIns: lock.lapsed ? 0 : row.failed_sign_ins,
    lastSignInAt: row.last_sign_in_at,
    createdAt: row.created_at,
    signedIn: row.open_seen !== null && now.getTime() - Date.parse(row.open_seen) <= idleMs,
    clients: { assigned: row.assigned, responsible: row.responsible },
    isYou: row.id === actor.id
  }
}

const requirePartner = (actor: Actor | null): Actor => requireRole(actor, 'partner', 'manage people')

function personRow(db: Db, id: number): PersonRow {
  const row = db.prepare(`${SELECT_PEOPLE} WHERE u.id = ?`).get(id) as PersonRow | undefined
  if (!row) throw new UserFacingError('not_found', 'That person is no longer in the practice.')
  return row
}

export function personById(db: Db, actor: Actor, id: number, now: Date = new Date()): Person {
  return toPerson(db, personRow(db, id), actor, now)
}

/** Everyone, active people first, then by name; and the invitations waiting. */
export function listPeople(db: Db, actor: Actor | null, now: Date = new Date()): PeopleOverview {
  const partner = requirePartner(actor)
  const rows = db.prepare(`${SELECT_PEOPLE} ORDER BY u.active DESC, u.name COLLATE NOCASE, u.id`).all() as PersonRow[]
  return {
    people: rows.map((r) => toPerson(db, r, partner, now)),
    invites: listInvites(db, now),
    idle: { practiceMinutes: practiceIdleMinutes(db) },
    lockAfter: LOCK_AFTER_FAILURES
  }
}

/** Active people by name, for pickers (who looks after a client, who does a task). */
export function directory(db: Db): DirectoryPerson[] {
  return db.prepare('SELECT id, name, role FROM users WHERE active = 1 AND password_hash IS NOT NULL ORDER BY name COLLATE NOCASE, id').all() as DirectoryPerson[]
}

function target(db: Db, partner: Actor, body: Record<string, unknown>, selfMessage: string | null): PersonRow {
  const id = requiredId(body.id, 'id', 'The person')
  if (selfMessage && id === partner.id) throw new UserFacingError('forbidden', selfMessage)
  return personRow(db, id)
}

/** True when a partner other than `userId` can sign in. */
function anotherActivePartner(db: Db, userId: number): boolean {
  return !!db.prepare("SELECT 1 FROM users WHERE role = 'partner' AND active = 1 AND password_hash IS NOT NULL AND id <> ? LIMIT 1").get(userId)
}

function guardLastPartner(db: Db, row: PersonRow, what: string): void {
  if (row.role === 'partner' && row.active === 1 && !anotherActivePartner(db, row.id)) {
    throw new UserFacingError('conflict', `${row.name} is the only partner who can sign in, so you can’t ${what}. Make someone else a partner first.`)
  }
}

export function updatePerson(db: Db, actor: Actor | null, input: unknown, now: Date = new Date()): Person {
  const partner = requirePartner(actor)
  const body = record(input)
  const row = target(db, partner, body, null)
  const name = requiredText(body.name, 'name', 'Their name', { max: 120 })
  const email = Object.prototype.hasOwnProperty.call(body, 'email') ? checkOptionalEmail(body.email) : row.email
  const diff = changedFields({ name: row.name, email: row.email }, { name, email })
  if (Object.keys(diff).length === 0) return toPerson(db, row, partner, now)
  db.transaction(() => {
    db.prepare('UPDATE users SET name = ?, email = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(name, email, now.toISOString(), partner.id, row.id)
    recordChange(
      db,
      partner,
      {
        action: 'people.update',
        entity: 'user',
        entityId: row.id,
        summary: `Changed ${row.name}’s details`,
        before: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.before])),
        after: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.after]))
      },
      now
    )
  })()
  return personById(db, partner, row.id, now)
}

export function setRole(db: Db, actor: Actor | null, input: unknown, now: Date = new Date()): Person {
  const partner = requirePartner(actor)
  const body = record(input)
  const row = target(db, partner, body, 'You can’t change your own role. Another partner can.')
  if (!isRole(body.role)) throw invalid('Choose a role: partner, manager or staff.', 'role')
  const role = body.role
  if (role === row.role) return toPerson(db, row, partner, now)
  if (row.role === 'partner') guardLastPartner(db, row, 'change their role')
  db.transaction(() => {
    db.prepare('UPDATE users SET role = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(role, now.toISOString(), partner.id, row.id)
    recordChange(
      db,
      partner,
      { action: 'people.setRole', entity: 'user', entityId: row.id, summary: `Made ${row.name} ${roleNoun(role)} (was ${ROLE_LABELS[row.role].toLowerCase()})`, before: { role: row.role }, after: { role } },
      now
    )
  })()
  return personById(db, partner, row.id, now)
}

export function setAccess(db: Db, actor: Actor | null, input: unknown, now: Date = new Date()): Person {
  const partner = requirePartner(actor)
  const body = record(input)
  if (typeof body.active !== 'boolean') throw invalid('Say whether their access is on or off.', 'active')
  const active = body.active
  const row = target(db, partner, body, active ? null : 'You can’t turn off your own access. Another partner can.')
  if ((row.active === 1) === active) return toPerson(db, row, partner, now)
  if (!active) guardLastPartner(db, row, 'turn their access off')
  db.transaction(() => {
    db.prepare('UPDATE users SET active = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(active ? 1 : 0, now.toISOString(), partner.id, row.id)
    const ended = active ? 0 : endPersonSessions(db, row.id, 'access_removed', now)
    recordChange(
      db,
      partner,
      {
        action: 'people.setAccess',
        entity: 'user',
        entityId: row.id,
        summary: active ? `Turned ${row.name}’s access back on` : `Turned off ${row.name}’s access`,
        before: { active: row.active === 1 },
        after: { active, ...(ended ? { sessionsEnded: ended } : {}) }
      },
      now
    )
  })()
  return personById(db, partner, row.id, now)
}

export function unlockPerson(db: Db, actor: Actor | null, input: unknown, now: Date = new Date()): Person {
  const partner = requirePartner(actor)
  const row = target(db, partner, record(input), null)
  if (!row.locked_at && row.failed_sign_ins === 0) return toPerson(db, row, partner, now)
  db.transaction(() => {
    db.prepare('UPDATE users SET locked_at = NULL, failed_sign_ins = 0, updated_at = ?, updated_by = ? WHERE id = ?').run(now.toISOString(), partner.id, row.id)
    recordChange(
      db,
      partner,
      {
        action: 'people.unlock',
        entity: 'user',
        entityId: row.id,
        summary: row.locked_at ? `Unlocked ${row.name}’s account` : `Cleared ${row.name}’s wrong passwords`,
        before: { locked: !!row.locked_at, failedSignIns: row.failed_sign_ins },
        after: { locked: false, failedSignIns: 0 }
      },
      now
    )
  })()
  return personById(db, partner, row.id, now)
}

/** A temporary password the person must replace at their next sign-in. The handler checks the partner's password was confirmed. */
export function resetPassword(db: Db, actor: Actor | null, input: unknown, now: Date = new Date(), cost?: ScryptCost): Person {
  const partner = requirePartner(actor)
  const body = record(input)
  const row = target(db, partner, body, 'Change your own password in Settings → Your sign-in.')
  const password = checkNewPassword(body.temporaryPassword, { username: row.username, name: row.name }, 'temporaryPassword')
  const hash = hashPassword(password, cost)
  db.transaction(() => {
    db.prepare(
      'UPDATE users SET password_hash = ?, must_change_password = 1, locked_at = NULL, failed_sign_ins = 0, updated_at = ?, updated_by = ? WHERE id = ?'
    ).run(hash, now.toISOString(), partner.id, row.id)
    const ended = endPersonSessions(db, row.id, 'signed_out', now)
    recordChange(
      db,
      partner,
      {
        action: 'people.resetPassword',
        entity: 'user',
        entityId: row.id,
        summary: `Set a temporary password for ${row.name}`,
        before: { mustChangePassword: row.must_change_password === 1, locked: !!row.locked_at },
        after: { mustChangePassword: true, locked: false, ...(ended ? { sessionsEnded: ended } : {}) }
      },
      now
    )
  })()
  return personById(db, partner, row.id, now)
}

function removalAnswer(db: Db, partner: Actor, row: PersonRow): RemovalCheck {
  if (row.id === partner.id) return { canRemove: false, links: [], reason: 'You can’t remove yourself. Another partner can.' }
  if (row.role === 'partner' && row.active === 1 && !anotherActivePartner(db, row.id)) {
    return { canRemove: false, links: [], reason: `${row.name} is the only partner who can sign in.` }
  }
  const links = personLinks(db, row.id)
  if (links.length) {
    return {
      canRemove: false,
      links,
      reason: `${row.name} can’t be removed while there are records under them: ${links.map((l) => l.label).join(', ')}. Turn their access off instead; their records stay as they are.`
    }
  }
  return { canRemove: true, links: [], reason: null }
}

export function removalCheck(db: Db, actor: Actor | null, input: unknown): RemovalCheck {
  const partner = requirePartner(actor)
  return removalAnswer(db, partner, target(db, partner, record(input), null))
}

const isForeignKeyError = (err: unknown): boolean => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_FOREIGNKEY'

export function removePerson(db: Db, actor: Actor | null, input: unknown, now: Date = new Date()): void {
  const partner = requirePartner(actor)
  const row = target(db, partner, record(input), 'You can’t remove yourself. Another partner can.')
  const answer = removalAnswer(db, partner, row)
  if (!answer.canRemove) throw new UserFacingError('conflict', answer.reason ?? 'They can’t be removed. Turn their access off instead.')
  try {
    db.transaction(() => {
      endPersonSessions(db, row.id, 'access_removed', now)
      db.prepare('DELETE FROM users WHERE id = ?').run(row.id)
      recordChange(
        db,
        partner,
        {
          action: 'people.remove',
          entity: 'user',
          entityId: row.id,
          summary: `Removed ${row.name} from the practice`,
          before: { username: row.username, name: row.name, email: row.email, role: row.role, active: row.active === 1 }
        },
        now
      )
    })()
  } catch (err) {
    if (isForeignKeyError(err)) {
      throw new UserFacingError('conflict', `${row.name} still has records in the practice, so they can’t be removed. Turn their access off instead; their records stay as they are.`)
    }
    throw err
  }
}

export function setIdlePolicy(db: Db, actor: Actor | null, input: unknown, now: Date = new Date()): void {
  const partner = requirePartner(actor)
  const minutes = record(input).minutes
  if (!isIdleChoice(minutes)) throw invalid('Choose how long from the list.', 'minutes')
  const before = practiceIdleMinutes(db)
  if (before === minutes) return
  db.transaction(() => {
    setSetting(db, 'auth', 'idleMinutes', minutes, partner.id)
    recordChange(
      db,
      partner,
      { action: 'people.setIdlePolicy', entity: 'setting', entityId: 'auth.idleMinutes', summary: `Set sign-out after ${idleLabel(minutes)} without use`, before: { idleMinutes: before }, after: { idleMinutes: minutes } },
      now
    )
  })()
}
