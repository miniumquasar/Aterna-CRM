/**
 * Invitations to join the practice, accepted on this PC.
 *
 *  - A partner invites someone by name (email optional), with a role and an
 *    expiry. The app makes a 12-character code (INVITE_ALPHABET, no letters
 *    that are easy to confuse) and shows it once: only its SHA-256 is kept,
 *    so a lost code is replaced with a new one, never shown again.
 *  - On the sign-in screen the invited person types the code, sees who it
 *    is for, chooses a username and password, and is signed in. A code
 *    works once, until it expires or is cancelled.
 *  - Codes that don't match are counted per window: after
 *    INVITE_ATTEMPT_LIMIT in INVITE_ATTEMPT_WINDOW_MS, the window must wait.
 */
import { createHash, randomInt } from 'node:crypto'
import {
  DEFAULT_INVITE_DAYS,
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_EXPIRY_CHOICES,
  formatInviteCode,
  normaliseInviteCode,
  suggestUsername,
  type AcceptInviteInput,
  type InviteCreated,
  type InviteInput,
  type InvitePreview,
  type PendingInvite,
  type RenewInviteInput
} from '@shared/contracts/auth'
import { formatInstant } from '@shared/domain/dates'
import { isRole, type Actor, type Role } from '@shared/domain/roles'
import { recordChange } from '../access/audit'
import { notify } from '../access/notify'
import { requireRole } from '../access/policy'
import type { Db } from '../db/connection'
import { UserFacingError, invalid } from '../ipc/errors'
import { record, requiredId, requiredText } from '../ipc/input'
import { hashPassword, type ScryptCost } from './passwords'
import { checkNewPassword, checkNewUsername, checkOptionalEmail, firmName, startSession, type SignedIn } from './service'

export const INVITE_ATTEMPT_LIMIT = 10
export const INVITE_ATTEMPT_WINDOW_MS = 10 * 60_000
/** Expired invitations stay listed this long, so a partner can renew them. */
const SHOW_EXPIRED_FOR_MS = 30 * 24 * 60 * 60_000

export function newInviteCode(): string {
  let code = ''
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]
  return code
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(`aeterna-invite:${code}`).digest('hex')
}

/** 'a member of staff', 'a manager', 'a partner'. */
export function roleNoun(role: Role): string {
  return role === 'staff' ? 'a member of staff' : `a ${role}`
}

interface InviteRow {
  id: number
  token_hash: string
  name: string
  email: string | null
  username: string | null
  role: Role
  invited_by: number | null
  invited_by_name: string | null
  expires_at: string
  accepted_at: string | null
  accepted_user_id: number | null
  cancelled_at: string | null
  created_at: string
}

const SELECT_INVITE = `SELECT i.*, u.name AS invited_by_name FROM invites i LEFT JOIN users u ON u.id = i.invited_by`

function toPending(row: InviteRow, now: Date): PendingInvite {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    expired: Date.parse(row.expires_at) <= now.getTime()
  }
}

/** Invitations not used: waiting, and those that expired in the last 30 days. Newest first. */
export function listInvites(db: Db, now: Date): PendingInvite[] {
  const since = new Date(now.getTime() - SHOW_EXPIRED_FOR_MS).toISOString()
  const rows = db
    .prepare(`${SELECT_INVITE} WHERE i.accepted_at IS NULL AND i.cancelled_at IS NULL AND i.expires_at > ? ORDER BY i.created_at DESC, i.id DESC`)
    .all(since) as InviteRow[]
  return rows.map((r) => toPending(r, now))
}

function inviteById(db: Db, id: number): InviteRow {
  const row = db.prepare(`${SELECT_INVITE} WHERE i.id = ?`).get(id) as InviteRow | undefined
  if (!row) throw new UserFacingError('not_found', 'That invitation no longer exists.')
  return row
}

function expiryDays(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_INVITE_DAYS
  if (typeof value !== 'number' || !(INVITE_EXPIRY_CHOICES as readonly number[]).includes(value)) throw invalid('Choose how long the invitation lasts from the list.', 'expiresInDays')
  return value
}

const expiresAt = (now: Date, days: number): string => new Date(now.getTime() + days * 24 * 60 * 60_000).toISOString()

export function createInvite(db: Db, actor: Actor | null, input: InviteInput, now: Date = new Date()): InviteCreated {
  const partner = requireRole(actor, 'partner', 'invite people')
  const body = record(input)
  const name = requiredText(body.name, 'name', 'Their name', { max: 120 })
  const email = checkOptionalEmail(body.email)
  if (!isRole(body.role)) throw invalid('Choose their role.', 'role')
  const role = body.role
  const days = expiryDays(body.expiresInDays)
  const waiting = db
    .prepare(
      `SELECT name FROM invites WHERE accepted_at IS NULL AND cancelled_at IS NULL AND expires_at > ?
       AND (lower(trim(name)) = lower(?) OR (? IS NOT NULL AND lower(email) = lower(?)))`
    )
    .get(now.toISOString(), name, email, email) as { name: string } | undefined
  if (waiting) {
    throw new UserFacingError('conflict', `An invitation for ${waiting.name} is already waiting. Make a new code for it, or cancel it first.`, 'name')
  }
  const code = newInviteCode()
  return db.transaction((): InviteCreated => {
    const at = now.toISOString()
    const id = Number(
      db
        .prepare('INSERT INTO invites (token_hash, name, email, role, invited_by, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(hashInviteCode(code), name, email, role, partner.id, expiresAt(now, days), at, at).lastInsertRowid
    )
    const row = inviteById(db, id)
    recordChange(
      db,
      partner,
      { action: 'people.invite', entity: 'invite', entityId: id, summary: `Invited ${name} as ${roleNoun(role)}`, after: { name, email, role, expiresAt: row.expires_at } },
      now
    )
    return { invite: toPending(row, now), code: formatInviteCode(code) }
  })()
}

/** A new code (and a new expiry) for an invitation that is waiting or has expired. The old code stops working. */
export function renewInvite(db: Db, actor: Actor | null, input: RenewInviteInput, now: Date = new Date()): InviteCreated {
  const partner = requireRole(actor, 'partner', 'invite people')
  const body = record(input)
  const row = inviteById(db, requiredId(body.id, 'id', 'The invitation'))
  if (row.accepted_at) throw new UserFacingError('conflict', `${row.name} has already joined, so the invitation can’t be renewed.`)
  if (row.cancelled_at) throw new UserFacingError('conflict', 'That invitation was cancelled. Invite them again instead.')
  const days = expiryDays(body.expiresInDays)
  const code = newInviteCode()
  return db.transaction((): InviteCreated => {
    const at = now.toISOString()
    const until = expiresAt(now, days)
    db.prepare('UPDATE invites SET token_hash = ?, expires_at = ?, updated_at = ? WHERE id = ?').run(hashInviteCode(code), until, at, row.id)
    recordChange(
      db,
      partner,
      { action: 'people.renewInvite', entity: 'invite', entityId: row.id, summary: `Made a new invitation code for ${row.name}`, before: { expiresAt: row.expires_at }, after: { expiresAt: until } },
      now
    )
    return { invite: toPending(inviteById(db, row.id), now), code: formatInviteCode(code) }
  })()
}

export function cancelInvite(db: Db, actor: Actor | null, input: { id: number }, now: Date = new Date()): void {
  const partner = requireRole(actor, 'partner', 'cancel invitations')
  const row = inviteById(db, requiredId(record(input).id, 'id', 'The invitation'))
  if (row.accepted_at) throw new UserFacingError('conflict', `${row.name} has already joined. Turn their access off in People instead.`)
  if (row.cancelled_at) return
  db.transaction(() => {
    const at = now.toISOString()
    db.prepare('UPDATE invites SET cancelled_at = ?, cancelled_by = ?, updated_at = ? WHERE id = ?').run(at, partner.id, at, row.id)
    recordChange(db, partner, { action: 'people.cancelInvite', entity: 'invite', entityId: row.id, summary: `Cancelled ${row.name}’s invitation`, after: { cancelled: true } }, now)
  })()
}

// ── Trying codes ────────────────────────────────────────────────────────────

const attempts = new Map<string, number[]>()

function recent(key: string, now: number): number[] {
  const list = (attempts.get(key) ?? []).filter((t) => now - t < INVITE_ATTEMPT_WINDOW_MS)
  attempts.set(key, list)
  return list
}

function assertCanTry(key: string, now: Date): void {
  if (recent(key, now.getTime()).length >= INVITE_ATTEMPT_LIMIT) {
    throw new UserFacingError('locked', 'Too many codes didn’t match. Wait 10 minutes, then try again with the code exactly as the partner gave it.')
  }
}

function noteMiss(key: string, now: Date): void {
  recent(key, now.getTime()).push(now.getTime())
}

/** Forgets the codes tried (tests). */
export function clearInviteAttempts(): void {
  attempts.clear()
}

/** The open invitation a typed code belongs to, or the reason it can't be used. */
function openInvite(db: Db, rawCode: unknown, key: string, now: Date): InviteRow {
  assertCanTry(key, now)
  const code = typeof rawCode === 'string' ? normaliseInviteCode(rawCode) : null
  if (!code) {
    noteMiss(key, now)
    throw invalid('An invitation code has 12 letters and numbers, like ABCD-EFGH-JKMN.', 'code')
  }
  const row = db.prepare(`${SELECT_INVITE} WHERE i.token_hash = ?`).get(hashInviteCode(code)) as InviteRow | undefined
  if (!row) {
    noteMiss(key, now)
    throw new UserFacingError('not_found', 'That code doesn’t match an invitation. Check it with the partner who gave it to you.', 'code')
  }
  if (row.accepted_at) throw new UserFacingError('conflict', 'That invitation has already been used. Sign in with the username chosen then, or ask a partner for a new invitation.', 'code')
  if (row.cancelled_at) throw new UserFacingError('conflict', 'That invitation was cancelled. Ask a partner for a new one.', 'code')
  if (Date.parse(row.expires_at) <= now.getTime()) {
    throw new UserFacingError('conflict', `That invitation expired on ${formatInstant(row.expires_at, { time: false })}. Ask the partner who invited you for a new code.`, 'code')
  }
  return row
}

/** A username made from the name that nobody has yet: 'jane.smith', then 'jane.smith2'. */
export function freeUsername(db: Db, name: string): string {
  const base = suggestUsername(name).slice(0, 60)
  const taken = (u: string): boolean => !!db.prepare('SELECT 1 FROM users WHERE username = ?').get(u)
  if (!taken(base)) return base
  for (let n = 2; n < 1000; n++) if (!taken(`${base}${n}`)) return `${base}${n}`
  return `${base}${Date.now() % 100000}`
}

export function checkInvite(db: Db, input: { code: string }, key: string, now: Date = new Date()): InvitePreview {
  const row = openInvite(db, record(input).code, key, now)
  return {
    name: row.name,
    email: row.email,
    role: row.role,
    firmName: firmName(db),
    invitedBy: row.invited_by_name,
    expiresAt: row.expires_at,
    suggestedUsername: freeUsername(db, row.name)
  }
}

/** The invited person joins: their account, the invitation used up, the partners told, and a session. */
export function acceptInvite(db: Db, input: AcceptInviteInput, key: string, now: Date = new Date(), cost?: ScryptCost): SignedIn {
  const body = record(input)
  const invite = openInvite(db, body.code, key, now)
  const name = requiredText(body.name, 'name', 'Your name', { max: 120 })
  const username = checkNewUsername(db, body.username)
  const password = checkNewPassword(body.password, { username, name })
  const hash = hashPassword(password, cost)
  return db.transaction((): SignedIn => {
    const at = now.toISOString()
    // The same code can't be used twice, even by two windows at once.
    const used = db.prepare('UPDATE invites SET accepted_at = ?, username = ?, updated_at = ? WHERE id = ? AND accepted_at IS NULL AND cancelled_at IS NULL').run(at, username, at, invite.id)
    if (used.changes !== 1) throw new UserFacingError('conflict', 'That invitation has just been used or cancelled. Ask a partner for a new one.', 'code')
    const id = Number(
      db
        .prepare(
          `INSERT INTO users (username, name, email, role, password_hash, password_changed_at, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(username, name, invite.email, invite.role, hash, at, at, at, invite.invited_by, invite.invited_by).lastInsertRowid
    )
    db.prepare('UPDATE invites SET accepted_user_id = ? WHERE id = ?').run(id, invite.id)
    const actor: Actor = { id, username, name, role: invite.role }
    recordChange(
      db,
      actor,
      {
        action: 'people.acceptInvite',
        entity: 'user',
        entityId: id,
        summary: `Joined the practice as ${roleNoun(invite.role)}, from ${invite.invited_by_name ? `${invite.invited_by_name}’s` : 'an'} invitation`,
        after: { username, name, email: invite.email, role: invite.role, inviteId: invite.id }
      },
      now
    )
    notify(
      db,
      {
        audience: 'partners',
        kind: 'people.joined',
        severity: 'success',
        title: `${name} has joined the practice`,
        body: `They accepted their invitation and sign in as ${username}, as ${roleNoun(invite.role)}.`,
        dedupeKey: `people.joined:${id}`,
        route: 'settings',
        routeParams: { section: 'people' }
      },
      now
    )
    const sessionId = startSession(db, { id, username }, now, 'First sign-in, from an invitation')
    return { actor, sessionId }
  })()
}
