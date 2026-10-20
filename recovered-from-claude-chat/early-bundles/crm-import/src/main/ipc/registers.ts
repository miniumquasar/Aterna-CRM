/**
 * IPC: practice registers (migration 0007).
 *
 * Access mirrors clients:get-all: staff see only clients assigned to them;
 * partners and managers see everything. Every handler requires a signed-in
 * user. The one write (issue status) records its audit_log row in the same
 * transaction as the change, so the audit trail cannot silently miss it.
 */

import { ipcMain } from 'electron'
import type {
  ClientAlias, ClientContact, ClientIncomeSource, ClientRelationship, CompliancePeriod, DataIssue, DataIssueQuery,
  DeadlineWorklistItem, DeadlineWorklistQuery, IpcResult, IssueSeverity, IssueStatus, LookupValue, ObligationType,
  PayrollScheme, PayrollSchemeYear, PensionScheme, SaRegistration
} from '@shared/types'
import { OBLIGATION_LABELS } from '@shared/types'
import { getLedger } from '../database'
import { getCurrentUser, requireRole } from './auth'

const ISSUE_STATUSES: readonly IssueStatus[] = ['open', 'in_progress', 'resolved', 'accepted_risk']
const SEVERITIES: readonly IssueSeverity[] = ['high', 'medium', 'low']
const OBLIGATIONS = Object.keys(OBLIGATION_LABELS) as ObligationType[]

const db = () => getLedger().db

function signedIn(): NonNullable<ReturnType<typeof getCurrentUser>> {
  const user = getCurrentUser()
  if (!user) throw new Error('Not signed in')
  return user
}

function clientRef(v: unknown): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 64) throw new Error('Invalid client reference')
  return v
}

/** Throws unless the signed-in user may see this client. Returns the validated ref. */
function authorise(v: unknown): string {
  const ref = clientRef(v)
  const user = signedIn()
  if (user.role === 'staff') {
    const row = db().prepare('SELECT assigned_to FROM clients WHERE ref = ?').get(ref) as { assigned_to: string | null } | undefined
    if (!row || row.assigned_to !== user.name) throw new Error('Not authorised for this client')
  }
  return ref
}

const clampInt = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : fallback

export function registerRegisterHandlers(): void {
  ipcMain.handle('registers:contacts', (_e, ref: unknown): ClientContact[] =>
    db().prepare('SELECT * FROM client_contacts WHERE client_ref = ? ORDER BY is_primary DESC, contact_type, name')
      .all(authorise(ref)) as ClientContact[])

  ipcMain.handle('registers:periods', (_e, ref: unknown, includeArchived?: unknown): CompliancePeriod[] =>
    db().prepare(`SELECT * FROM compliance_periods WHERE client_ref = ? AND (archived = 0 OR ? = 1)
      ORDER BY COALESCE(due_date, period_end) DESC, obligation`).all(authorise(ref), includeArchived === true ? 1 : 0) as CompliancePeriod[])

  ipcMain.handle('registers:worklist', (_e, query?: DeadlineWorklistQuery): DeadlineWorklistItem[] => {
    const user = signedIn()
    const q = query ?? {}
    const where = ['w.days_remaining <= ?']
    const args: Array<string | number> = [clampInt(q.withinDays, 90, 0, 3650)]
    if (q.includeOverdue === false) where.push('w.days_remaining >= 0')
    if (q.obligation !== undefined) {
      if (!OBLIGATIONS.includes(q.obligation)) throw new Error('Unknown obligation')
      where.push('w.obligation = ?')
      args.push(q.obligation)
    }
    if (q.assignedTo !== undefined) {
      where.push('w.assigned_to = ?')
      args.push(String(q.assignedTo))
    }
    if (user.role === 'staff') {
      where.push('c.assigned_to = ?')
      args.push(user.name)
    }
    return db().prepare(`SELECT w.* FROM v_deadline_worklist w JOIN clients c ON c.ref = w.client_ref
      WHERE ${where.join(' AND ')} ORDER BY w.due_date, w.client_name`).all(...args) as DeadlineWorklistItem[]
  })

  ipcMain.handle('registers:payroll', (_e, ref: unknown): PayrollScheme[] => {
    const r = authorise(ref)
    const schemes = db().prepare('SELECT * FROM payroll_schemes WHERE client_ref = ? ORDER BY scheme_status, paye_reference')
      .all(r) as Array<Omit<PayrollScheme, 'years'>>
    const years = db().prepare(`SELECT y.* FROM payroll_scheme_years y JOIN payroll_schemes s ON s.id = y.scheme_id
      WHERE s.client_ref = ? ORDER BY y.tax_year DESC`).all(r) as PayrollSchemeYear[]
    return schemes.map((s) => ({ ...s, years: years.filter((y) => y.scheme_id === s.id) }))
  })

  ipcMain.handle('registers:pensions', (_e, ref: unknown): PensionScheme[] =>
    db().prepare('SELECT * FROM pension_schemes WHERE client_ref = ? ORDER BY duties_start_date').all(authorise(ref)) as PensionScheme[])

  ipcMain.handle('registers:sa', (_e, ref: unknown): SaRegistration | null => {
    const r = authorise(ref)
    const reg = db().prepare('SELECT * FROM sa_registrations WHERE client_ref = ?').get(r) as Omit<SaRegistration, 'income_sources'> | undefined
    if (!reg) return null
    const income = db().prepare('SELECT * FROM client_income_sources WHERE client_ref = ? ORDER BY active DESC, source_type, detail')
      .all(r) as ClientIncomeSource[]
    return { ...reg, income_sources: income }
  })

  ipcMain.handle('registers:relationships', (_e, ref: unknown): ClientRelationship[] => {
    const r = authorise(ref)
    const user = signedIn()
    const staff = user.role === 'staff' ? 1 : 0
    // Staff do not see the names of clients that are not assigned to them.
    return db().prepare(`
      SELECT rel.id, rel.from_client_ref, rel.to_client_ref, rel.relationship_type, rel.basis,
             CASE WHEN rel.from_client_ref = ? THEN 'outgoing' ELSE 'incoming' END AS direction,
             CASE WHEN ? = 0 OR other.assigned_to = ? THEN other.client_name ELSE NULL END AS other_client_name
        FROM client_relationships rel
        LEFT JOIN clients other
          ON other.ref = CASE WHEN rel.from_client_ref = ? THEN rel.to_client_ref ELSE rel.from_client_ref END
       WHERE rel.from_client_ref = ? OR rel.to_client_ref = ?
       ORDER BY other_client_name`).all(r, staff, user.name, r, r, r) as ClientRelationship[]
  })

  ipcMain.handle('registers:aliases', (_e, ref: unknown): ClientAlias[] =>
    db().prepare('SELECT id, client_ref, alias, alias_type FROM client_aliases WHERE client_ref = ? ORDER BY alias')
      .all(authorise(ref)) as ClientAlias[])

  ipcMain.handle('registers:issues', (_e, query?: DataIssueQuery): DataIssue[] => {
    const user = signedIn()
    const q = query ?? {}
    const where: string[] = []
    const args: Array<string | number> = []
    if (q.clientRef !== undefined) {
      where.push('client_ref = ?')
      args.push(authorise(q.clientRef))
    }
    if (q.status === 'unresolved') where.push("status IN ('open', 'in_progress')")
    else if (q.status !== undefined) {
      if (!ISSUE_STATUSES.includes(q.status)) throw new Error('Unknown issue status')
      where.push('status = ?')
      args.push(q.status)
    }
    if (q.severity !== undefined) {
      if (!SEVERITIES.includes(q.severity)) throw new Error('Unknown severity')
      where.push('severity = ?')
      args.push(q.severity)
    }
    if (user.role === 'staff') {
      where.push('client_ref IN (SELECT ref FROM clients WHERE assigned_to = ?)')
      args.push(user.name)
    }
    args.push(clampInt(q.limit, 500, 1, 5000))
    return db().prepare(`SELECT * FROM data_issues ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC, id DESC
      LIMIT ?`).all(...args) as DataIssue[]
  })

  ipcMain.handle('registers:update-issue-status', async (_e, id: unknown, status: unknown): Promise<IpcResult<DataIssue>> => {
    try {
      requireRole(['partner', 'manager'])
      const user = signedIn()
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) throw new Error('Invalid issue id')
      if (typeof status !== 'string' || !ISSUE_STATUSES.includes(status as IssueStatus)) throw new Error('Unknown issue status')
      const closing = status === 'resolved' || status === 'accepted_risk'
      const conn = db()
      const updated = conn.transaction((): DataIssue => {
        const before = conn.prepare('SELECT * FROM data_issues WHERE id = ?').get(id) as DataIssue | undefined
        if (!before) throw new Error('No such issue')
        conn.prepare(`UPDATE data_issues SET status = ?,
            resolved_at = CASE WHEN ? THEN datetime('now') ELSE NULL END,
            resolved_by = CASE WHEN ? THEN ? ELSE NULL END,
            updated_at = datetime('now')
          WHERE id = ?`).run(status, closing ? 1 : 0, closing ? 1 : 0, user.name, id)
        const after = conn.prepare('SELECT * FROM data_issues WHERE id = ?').get(id) as DataIssue
        conn.prepare(`INSERT INTO audit_log (user_id, user_name, action, table_name, record_id, old_value, new_value)
          VALUES (?, ?, 'Updated data issue status', 'data_issues', ?, ?, ?)`)
          .run(user.id ?? null, user.name, String(id), JSON.stringify({ status: before.status }), JSON.stringify({ status: after.status }))
        return after
      })()
      return { ok: true, data: updated }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('registers:lookups', (_e, listKey: unknown): LookupValue[] => {
    if (typeof listKey !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(listKey)) throw new Error('Invalid list key')
    return db().prepare('SELECT * FROM lookup_values WHERE list_key = ? AND active = 1 ORDER BY sort_order, label')
      .all(listKey) as LookupValue[]
  })
}
