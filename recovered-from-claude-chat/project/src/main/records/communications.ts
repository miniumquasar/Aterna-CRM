/**
 * The log of messages sent to clients. Staff see and record their own clients'
 * messages; who sent a message is the person signed in, whatever a screen says.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { CommunicationLog } from '../../shared/types'
import { auditRow, writeAudit, type Row } from '../access/audit'
import { clientForActor, idArg, refArg, staffClients, UserFacingError, where, type Actor, type SqlPart } from '../access/policy'
import { textOrNull } from './common'

const CHANNELS = ['email', 'whatsapp', 'both'] as const
/** sent: delivered to the mail service; opened: handed to the mail app or WhatsApp (sending there isn't known); pending: being sent. */
const STATUSES = ['sent', 'failed', 'pending', 'opened'] as const
const VIA = ['mail-app', 'smtp', 'microsoft365', 'resend', 'whatsapp'] as const

export function listMessages(db: Database, actor: Actor, clientRef?: unknown): CommunicationLog[] {
  const parts: SqlPart[] = [staffClients(actor, 't.client_ref')]
  let limit = ''
  if (typeof clientRef === 'string' && clientRef !== '') {
    clientForActor(db, clientRef, actor)
    parts.push({ sql: 't.client_ref = ?', params: [clientRef] })
  } else limit = ' LIMIT 200'
  const w = where(...parts)
  return db.prepare(`SELECT t.id, t.client_ref, COALESCE(c.client_name, t.client_name) AS client_name, t.channel, t.template_key, t.subject,
      t.body_preview, t.status, t.sent_by, t.sent_at, t.notes, t.recipients, t.sent_via, t.error
      FROM communication_log t LEFT JOIN clients c ON c.ref = t.client_ref${w.sql} ORDER BY t.sent_at DESC, t.id DESC${limit}`).all(...w.params) as CommunicationLog[]
}

export function recordMessage(db: Database, actor: Actor, input: unknown): { id: number } {
  const data = (input && typeof input === 'object' ? input : {}) as Partial<CommunicationLog> & { body?: unknown }
  const client = clientForActor(db, refArg(data.client_ref), actor)
  const channel = CHANNELS.find((c) => c === data.channel)
  if (!channel) throw new UserFacingError('Say how the message was sent.')
  const status = STATUSES.find((s) => s === (data.status ?? 'sent'))
  if (!status) throw new UserFacingError('Unknown message status.')
  const via = data.sent_via == null ? null : VIA.find((v) => v === data.sent_via)
  if (via === undefined) throw new UserFacingError('Unknown way of sending.')
  const body = data.body == null ? null : String(data.body).slice(0, 100_000)
  return db.transaction(() => {
    const id = Number(
      db.prepare(`INSERT INTO communication_log (client_ref, client_name, channel, template_key, subject, body_preview, status, sent_by, notes,
          recipients, sent_via, message_id, error, body)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        client.ref, client.client_name, channel, textOrNull(data.template_key, 'The template', 80), textOrNull(data.subject, 'The subject', 300),
        data.body_preview ? String(data.body_preview).slice(0, 500) : body ? body.replace(/\s+/g, ' ').trim().slice(0, 500) : null, status, actor.name,
        textOrNull(data.notes, 'The notes'), textOrNull(data.recipients, 'The recipients', 2000), via, textOrNull(data.message_id, 'The message id', 300),
        textOrNull(data.error, 'The error', 1000), body
      ).lastInsertRowid
    )
    const row = db.prepare('SELECT * FROM communication_log WHERE id = ?').get(id) as Row
    const action = status === 'pending' ? 'Sending a message' : status === 'opened' ? 'Opened a message to send' : status === 'failed' ? 'Message not sent' : 'Recorded message sent'
    writeAudit(db, actor, action, 'communication_log', id, null, auditRow('communication_log', row))
    return { id }
  })()
}

/** How a message being sent turned out: sent (with the service's message id) or failed (with why). */
export function settleMessage(db: Database, actor: Actor, id: number, outcome: { status: 'sent' | 'failed'; messageId?: string | null; error?: string | null }): void {
  db.transaction(() => {
    const before = db.prepare('SELECT status, message_id, error FROM communication_log WHERE id = ?').get(id) as Row | undefined
    if (!before) return
    db.prepare('UPDATE communication_log SET status = ?, message_id = ?, error = ? WHERE id = ?').run(
      outcome.status, outcome.messageId ?? null, outcome.error ? String(outcome.error).slice(0, 1000) : null, id
    )
    writeAudit(db, actor, outcome.status === 'sent' ? 'Message sent' : 'Message not sent', 'communication_log', id, before, {
      status: outcome.status, message_id: outcome.messageId ?? null, error: outcome.error ?? null
    })
  })()
}

export function deleteMessage(db: Database, actor: Actor, id: unknown): void {
  const rowId = idArg(id, 'message')
  const before = db.prepare('SELECT * FROM communication_log WHERE id = ?').get(rowId) as Row | undefined
  if (!before) throw new UserFacingError('That message is no longer in the log.')
  clientForActor(db, before.client_ref as string, actor)
  db.transaction(() => {
    db.prepare('DELETE FROM communication_log WHERE id = ?').run(rowId)
    writeAudit(db, actor, 'Removed message from the log', 'communication_log', rowId, auditRow('communication_log', before), null)
  })()
}
