/**
 * The data issue register: things in the data that need a person's look (a
 * reference that fails its check, an import finding, a migration repair).
 * One issue per `dedupeKey`, so raising the same problem again updates it
 * instead of adding another, and fixing the data resolves it.
 *
 *   raiseIssue(db, { dedupeKey: `utr:client:${id}`, source: 'reference_check', kind: 'utr_check',
 *                    title: 'The UTR fails its check digit', clientId: id, field: 'utr' })
 *   resolveIssue(db, `utr:client:${id}`)
 */
import type { Db } from '../db/connection'

export type IssueSeverity = 'info' | 'warning' | 'error'
export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'waived'

export interface IssueInput {
  dedupeKey: string
  /** Where it came from: 'reference_check', 'import', 'migration', 'onboarding'. */
  source: string
  /** What kind of problem: 'utr_check', 'duplicate_company_number'. */
  kind: string
  severity?: IssueSeverity
  title: string
  detail?: string | null
  clientId?: number | null
  entity?: string | null
  entityId?: string | number | null
  field?: string | null
}

export interface RaisedIssue {
  id: number
  /** 'new' (first time), 'reopened' (was resolved), 'updated' (still open, or waived and kept waived). */
  outcome: 'new' | 'reopened' | 'updated'
}

/**
 * Records an issue, or refreshes it. A resolved issue that comes back is
 * reopened; a waived one stays waived (a person decided it is fine).
 */
export function raiseIssue(db: Db, input: IssueInput, now: Date = new Date()): RaisedIssue {
  const at = now.toISOString()
  const existing = db.prepare('SELECT id, status FROM data_issues WHERE dedupe_key = ?').get(input.dedupeKey) as
    | { id: number; status: IssueStatus }
    | undefined
  const values = {
    source: input.source,
    kind: input.kind,
    severity: input.severity ?? 'warning',
    title: input.title,
    detail: input.detail ?? null,
    client_id: input.clientId ?? null,
    entity: input.entity ?? null,
    entity_id: input.entityId === null || input.entityId === undefined ? null : String(input.entityId),
    field: input.field ?? null,
    at
  }
  if (!existing) {
    const r = db
      .prepare(
        `INSERT INTO data_issues (dedupe_key, source, kind, severity, title, detail, client_id, entity, entity_id, field,
           first_seen_at, last_seen_at, created_at, updated_at)
         VALUES (@dedupe_key, @source, @kind, @severity, @title, @detail, @client_id, @entity, @entity_id, @field, @at, @at, @at, @at)`
      )
      .run({ ...values, dedupe_key: input.dedupeKey })
    return { id: Number(r.lastInsertRowid), outcome: 'new' }
  }
  const reopen = existing.status === 'resolved'
  db.prepare(
    `UPDATE data_issues SET source = @source, kind = @kind, severity = @severity, title = @title, detail = @detail,
       client_id = @client_id, entity = @entity, entity_id = @entity_id, field = @field, last_seen_at = @at, updated_at = @at
       ${reopen ? ", status = 'open', resolved_at = NULL, resolved_by = NULL" : ''}
     WHERE id = @id`
  ).run({ ...values, id: existing.id })
  return { id: existing.id, outcome: reopen ? 'reopened' : 'updated' }
}

/** Marks an issue resolved because the data is now right. Returns whether an open issue was resolved. */
export function resolveIssue(db: Db, dedupeKey: string, resolvedBy: number | null = null, now: Date = new Date()): boolean {
  const at = now.toISOString()
  const r = db
    .prepare(
      `UPDATE data_issues SET status = 'resolved', resolved_at = ?, resolved_by = ?, updated_at = ?
       WHERE dedupe_key = ? AND status IN ('open', 'in_progress')`
    )
    .run(at, resolvedBy, at, dedupeKey)
  return r.changes > 0
}

/** Resolves every open issue whose key starts with `prefix` and isn't in `stillTrue` (after a full recheck). */
export function resolveIssuesNotIn(db: Db, prefix: string, stillTrue: ReadonlySet<string>, now: Date = new Date()): number {
  const open = db
    .prepare("SELECT dedupe_key FROM data_issues WHERE dedupe_key LIKE ? ESCAPE '\\' AND status IN ('open', 'in_progress')")
    .all(`${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) as Array<{ dedupe_key: string }>
  let resolved = 0
  for (const { dedupe_key } of open) {
    if (!stillTrue.has(dedupe_key) && resolveIssue(db, dedupe_key, null, now)) resolved += 1
  }
  return resolved
}
