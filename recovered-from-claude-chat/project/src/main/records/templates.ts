/**
 * Email templates: the practice's own (client_ref NULL) and per-client versions.
 *
 *   seeing     everyone sees the practice templates; staff see client versions
 *              for their own clients only
 *   changing   practice templates: partners and managers; a client's version:
 *              anyone who works on that client
 *   deleting   a client's version, or a practice template the practice added; the
 *              built-in practice templates are reset rather than deleted
 *   audit      every change, with the previous subject and body
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { EmailTemplate } from '../../shared/types'
import { auditChanges, auditRow, writeAudit, type Row } from '../access/audit'
import { canManage, clientForActor, idArg, requireManager, staffClients, UserFacingError, type Actor } from '../access/policy'
import { textOrNull } from './common'

const KEY = /^[a-z0-9_]{1,60}$/

export function listTemplates(db: Database, actor: Actor, clientRef?: unknown): EmailTemplate[] {
  if (typeof clientRef === 'string' && clientRef !== '') {
    const client = clientForActor(db, clientRef, actor)
    return db.prepare(`SELECT * FROM email_templates WHERE client_ref IS NULL OR client_ref = ?
      ORDER BY template_key, client_ref NULLS FIRST`).all(client.ref) as EmailTemplate[]
  }
  const mine = staffClients(actor, 'client_ref')
  return db.prepare(`SELECT * FROM email_templates WHERE client_ref IS NULL${mine.sql ? ` OR ${mine.sql}` : canManage(actor) ? ' OR 1' : ''} ORDER BY label`)
    .all(...mine.params) as EmailTemplate[]
}

/** The client's own version if there is one, otherwise the practice template. */
export function getTemplate(db: Database, actor: Actor, templateKey: unknown, clientRef?: unknown): EmailTemplate | null {
  if (typeof templateKey !== 'string') return null
  if (typeof clientRef === 'string' && clientRef !== '') {
    const client = clientForActor(db, clientRef, actor)
    const own = db.prepare('SELECT * FROM email_templates WHERE template_key = ? AND client_ref = ?').get(templateKey, client.ref) as EmailTemplate | undefined
    if (own) return own
  }
  return (db.prepare('SELECT * FROM email_templates WHERE template_key = ? AND client_ref IS NULL').get(templateKey) as EmailTemplate | undefined) ?? null
}

export interface TemplateInput {
  template_key?: unknown
  client_ref?: unknown
  label?: unknown
  subject?: unknown
  body?: unknown
  tags?: unknown
  is_ai_generated?: unknown
}

export function upsertTemplate(db: Database, actor: Actor, data: TemplateInput): { id: number } {
  const key = typeof data?.template_key === 'string' ? data.template_key.trim() : ''
  if (!KEY.test(key)) throw new UserFacingError('A template key is lower-case letters, digits and underscores.')
  let clientRef: string | null = null
  if (typeof data.client_ref === 'string' && data.client_ref.trim() !== '') clientRef = clientForActor(db, data.client_ref, actor).ref
  else requireManager(actor, 'change the practice’s templates')
  const subject = textOrNull(data.subject, 'The subject', 300)
  const body = textOrNull(data.body, 'The message', 20_000)
  if (!subject || !body) throw new UserFacingError('A template needs a subject and a message.')
  const label = textOrNull(data.label, 'The name', 120) ?? key
  const tags = textOrNull(data.tags, 'The tags', 300)
  const ai = data.is_ai_generated ? 1 : 0
  return db.transaction(() => {
    const before = db.prepare('SELECT * FROM email_templates WHERE template_key = ? AND COALESCE(client_ref, \'\') = COALESCE(?, \'\')')
      .get(key, clientRef) as Row | undefined
    let id: number
    if (before) {
      id = before.id as number
      db.prepare(`UPDATE email_templates SET label = ?, subject = ?, body = ?, tags = ?, is_ai_generated = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(label, subject, body, tags, ai, id)
      const after = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id) as Row
      const diff = auditChanges('email_templates', before, after, ['client_ref', 'template_key'])
      if (diff) writeAudit(db, actor, 'Updated email template', 'email_templates', id, diff.before, diff.after)
    } else {
      id = Number(db.prepare(`INSERT INTO email_templates (template_key, client_ref, label, subject, body, tags, is_ai_generated) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(key, clientRef, label, subject, body, tags, ai).lastInsertRowid)
      const row = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id) as Row
      writeAudit(db, actor, 'Created email template', 'email_templates', id, null, auditRow('email_templates', row))
    }
    return { id }
  })()
}

/** Built-in practice templates (`builtIn` keys) are reset, not deleted. */
export function deleteTemplate(db: Database, actor: Actor, id: unknown, builtIn: ReadonlySet<string>): void {
  const rowId = idArg(id, 'template')
  const before = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(rowId) as Row | undefined
  if (!before) throw new UserFacingError('That template no longer exists.')
  if (before.client_ref) clientForActor(db, before.client_ref as string, actor)
  else {
    requireManager(actor, 'delete the practice’s templates')
    if (builtIn.has(before.template_key as string)) throw new UserFacingError('Built-in templates can be reset to the original wording, not deleted.')
  }
  db.transaction(() => {
    db.prepare('DELETE FROM email_templates WHERE id = ?').run(rowId)
    writeAudit(db, actor, 'Deleted email template', 'email_templates', rowId, auditRow('email_templates', before), null)
  })()
}

export function resetTemplate(db: Database, actor: Actor, templateKey: unknown, original: { label: string; subject: string; body: string } | undefined): void {
  requireManager(actor, 'reset the practice’s templates')
  if (!original || typeof templateKey !== 'string') throw new UserFacingError('That isn’t a built-in template.')
  db.transaction(() => {
    const before = db.prepare('SELECT * FROM email_templates WHERE template_key = ? AND client_ref IS NULL').get(templateKey) as Row | undefined
    if (before) {
      db.prepare(`UPDATE email_templates SET label = ?, subject = ?, body = ?, is_ai_generated = 0, updated_at = datetime('now') WHERE id = ?`)
        .run(original.label, original.subject, original.body, before.id)
      const after = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(before.id) as Row
      const diff = auditChanges('email_templates', before, after, ['template_key'])
      if (diff) writeAudit(db, actor, 'Reset email template to the original wording', 'email_templates', before.id as number, diff.before, diff.after)
    } else {
      const id = Number(db.prepare('INSERT INTO email_templates (template_key, client_ref, label, subject, body) VALUES (?, NULL, ?, ?, ?)')
        .run(templateKey, original.label, original.subject, original.body).lastInsertRowid)
      writeAudit(db, actor, 'Restored email template', 'email_templates', id, null, { template_key: templateKey })
    }
  })()
}
