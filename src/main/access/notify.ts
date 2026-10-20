/**
 * Notifications, for one person or an audience (everyone, managers and
 * partners, or partners). Each names its subject (`subjectKey`, e.g.
 * 'deadline:42'), so it is marked done automatically once the subject is
 * dealt with, and carries a `dedupeKey` so raising it again changes nothing.
 * The insights domain shows them (the bell, the list, desktop notifications).
 */
import type { Db } from '../db/connection'

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'danger'
export type NotificationAudience = 'everyone' | 'managers' | 'partners'

export interface NotificationInput {
  /** One person… */
  recipientId?: number
  /** …or an audience. Exactly one of the two. */
  audience?: NotificationAudience
  kind: string
  severity?: NotificationSeverity
  title: string
  body?: string | null
  subjectKey?: string | null
  /** Defaults to `${kind}:${subjectKey}:${recipient or audience}` when there is a subject. */
  dedupeKey?: string | null
  clientId?: number | null
  /** Where the notification opens: a route id and its params. */
  route?: string | null
  routeParams?: Record<string, string | number> | null
}

/** Adds a notification, or does nothing when an open one with the same dedupe key exists. Returns its id. */
export function notify(db: Db, input: NotificationInput, now: Date = new Date()): number {
  if ((input.recipientId === undefined) === (input.audience === undefined)) {
    throw new Error('A notification needs exactly one of recipientId or audience.')
  }
  const who = input.recipientId !== undefined ? `user:${input.recipientId}` : `audience:${input.audience}`
  const dedupeKey = input.dedupeKey ?? (input.subjectKey ? `${input.kind}:${input.subjectKey}:${who}` : null)
  const at = now.toISOString()
  if (dedupeKey) {
    const existing = db.prepare('SELECT id, done_at FROM notifications WHERE dedupe_key = ?').get(dedupeKey) as { id: number; done_at: string | null } | undefined
    if (existing && existing.done_at === null) return existing.id
    if (existing) {
      // The subject came back after it was dealt with: raise it afresh.
      db.prepare(
        `UPDATE notifications SET title = ?, body = ?, severity = ?, read_at = NULL, done_at = NULL, done_reason = NULL,
           created_at = ?, updated_at = ? WHERE id = ?`
      ).run(input.title, input.body ?? null, input.severity ?? 'info', at, at, existing.id)
      return existing.id
    }
  }
  const r = db
    .prepare(
      `INSERT INTO notifications (recipient_id, audience, kind, severity, title, body, subject_key, dedupe_key, client_id,
         route, route_params, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.recipientId ?? null,
      input.audience ?? null,
      input.kind,
      input.severity ?? 'info',
      input.title,
      input.body ?? null,
      input.subjectKey ?? null,
      dedupeKey,
      input.clientId ?? null,
      input.route ?? null,
      input.routeParams ? JSON.stringify(input.routeParams) : null,
      at,
      at
    )
  return Number(r.lastInsertRowid)
}

/** Marks every open notification about `subjectKey` done, because the subject was dealt with. Returns how many. */
export function completeSubject(db: Db, subjectKey: string, now: Date = new Date()): number {
  const at = now.toISOString()
  return db
    .prepare("UPDATE notifications SET done_at = ?, done_reason = 'dealt_with', updated_at = ? WHERE subject_key = ? AND done_at IS NULL")
    .run(at, at, subjectKey).changes
}
