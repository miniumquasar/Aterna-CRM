/**
 * The dashboard's figures. Staff see their own clients' figures and their own
 * recent activity; partners and managers see the whole practice.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { DashboardStats } from '../../shared/types'
import { canManage, staffClients, where, type Actor } from '../access/policy'
import { localDate } from './common'
import { currentClientSql } from './current'
import { receivablesSummary } from './receivables'

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function dashboardStats(db: Database, actor: Actor, today: string = localDate()): DashboardStats {
  const in30 = addDays(today, 30)
  // Clients are the member of staff's by assignment (a client with no code still counts).
  const mine = actor.role === 'staff' ? { sql: 'assigned_to = ?', params: [actor.name] } : { sql: '', params: [] }
  const clientsWhere = (extra: string): ReturnType<typeof where> => where(mine, { sql: extra, params: [] })
  const count = (sql: string, params: unknown[]): number => (db.prepare(sql).get(...params) as { c: number }).c

  const all = clientsWhere('')
  const totalClients = count(`SELECT COUNT(*) AS c FROM clients${all.sql}`, all.params)
  // Clients the practice no longer acts for are kept, and counted apart.
  const current = clientsWhere(currentClientSql('clients'))
  const currentClients = count(`SELECT COUNT(*) AS c FROM clients${current.sql}`, current.params)
  const active = clientsWhere(`status = 'Active' AND ${currentClientSql('clients')}`)
  const activeClients = count(`SELECT COUNT(*) AS c FROM clients${active.sql}`, active.params)

  const wip = where(staffClients(actor, 'client_ref'), { sql: "COALESCE(status, '') <> 'Completed'", params: [] })
  const wipCount = count(`SELECT COUNT(*) AS c FROM wip_items${wip.sql}`, wip.params)

  const taskScope = staffClients(actor, 'client_ref')
  const tasks = where(
    taskScope.sql ? { sql: `${taskScope.sql} OR assigned_to = ?`, params: [...taskScope.params, actor.name] } : taskScope,
    { sql: "due_date = ? AND lower(COALESCE(status, '')) NOT IN ('completed', 'done', 'cancelled')", params: [today] }
  )
  const tasksToday = count(`SELECT COUNT(*) AS c FROM tasks${tasks.sql}`, tasks.params)

  const live = clientsWhere("COALESCE(status, '') <> 'Dissolved'")
  const scoped = live.sql ? `${live.sql} AND` : ' WHERE'
  const overdueCount = count(`
    SELECT COUNT(*) AS c FROM (
      SELECT 1 FROM clients${scoped} accounts_due  IS NOT NULL AND accounts_due  < ?
      UNION ALL SELECT 1 FROM clients${scoped} ct_next_due   IS NOT NULL AND ct_next_due   < ?
      UNION ALL SELECT 1 FROM clients${scoped} conf_stmt_due IS NOT NULL AND conf_stmt_due < ?
    )`, [...live.params, today, ...live.params, today, ...live.params, today])

  const upcomingDeadlines = db.prepare(`
    SELECT client_name, 'Accounts' AS type, accounts_due AS due_date,
      CAST(julianday(accounts_due) - julianday(?) AS INTEGER) AS days_remaining
    FROM clients${scoped} accounts_due BETWEEN ? AND ?
    UNION ALL
    SELECT client_name, 'CT Return', ct_next_due, CAST(julianday(ct_next_due) - julianday(?) AS INTEGER)
    FROM clients${scoped} ct_next_due BETWEEN ? AND ?
    UNION ALL
    SELECT client_name, 'Conf. Statement', conf_stmt_due, CAST(julianday(conf_stmt_due) - julianday(?) AS INTEGER)
    FROM clients${scoped} conf_stmt_due BETWEEN ? AND ?
    ORDER BY days_remaining ASC LIMIT 20
  `).all(
    today, ...live.params, today, in30,
    today, ...live.params, today, in30,
    today, ...live.params, today, in30
  ) as DashboardStats['upcomingDeadlines']

  const recentActivity = (canManage(actor)
    ? db.prepare('SELECT action, timestamp, user_name AS user FROM audit_log ORDER BY id DESC LIMIT 10').all()
    : db.prepare('SELECT action, timestamp, user_name AS user FROM audit_log WHERE user_name = ? ORDER BY id DESC LIMIT 10').all(actor.name)
  ) as DashboardStats['recentActivity']

  const byCategory = clientsWhere(`status = 'Active' AND ${currentClientSql('clients')}`)
  const clientsByCategory: Record<string, number> = {}
  for (const row of db.prepare(`SELECT client_category, COUNT(*) AS c FROM clients${byCategory.sql} GROUP BY client_category`).all(...byCategory.params) as Array<{ client_category: string; c: number }>) {
    clientsByCategory[row.client_category] = row.c
  }

  const ar = receivablesSummary(db, actor)
  return {
    totalClients, currentClients, activeClients, noLongerClients: totalClients - currentClients, overdueCount, wipCount, tasksToday, clientsByCategory, upcomingDeadlines, recentActivity,
    totalARPence: ar.outstanding_pence, overdueARPence: ar.overdue_pence, overdueInvoices: ar.overdue_count
  }
}
