/**
 * Clients the practice no longer acts for (Level 5): Former client, Ceased,
 * Dissolved, or a company Companies House lists as dissolved. Everything about
 * them is kept; everyday work leaves them out; money they owe stays in
 * Billing. Made-up data only.
 */
import { describe, expect, it } from 'vitest'
import { dashboardStats } from '../../src/main/records/dashboard'
import { openDeadlines } from '../../src/main/records/deadlines'
import { receivablesSummary } from '../../src/main/records/receivables'
import { riskReport } from '../../src/main/records/risk'
import { currentClientSql } from '../../src/main/records/current'
import { listClients } from '../../src/main/records/clients'
import { partner, practice } from './helpers'

const TODAY = '2026-10-20'

function withWork() {
  const db = practice()
  const period = db.prepare(`INSERT INTO compliance_periods (client_ref, obligation, period_key, due_date, status, archived)
    VALUES (?, 'annual_accounts', ?, ?, 'not_started', 0)`)
  for (const ref of ['C1', 'C2', 'C3']) period.run(ref, `${ref}-2025`, '2026-11-30')
  db.exec("INSERT INTO payments (client_ref, amount_pence, due_date) VALUES ('C2', 5000, '2026-09-01')")
  return db
}

describe('no-longer clients', () => {
  it('are left out of deadlines, risk and Home’s client count, whatever the case of their status', () => {
    const db = withWork()
    db.exec("UPDATE clients SET status = 'ceased' WHERE ref = 'C2'; UPDATE clients SET status = 'Active', company_status = 'Dissolved' WHERE ref = 'C3'")
    expect(openDeadlines(db, partner, { withinDays: 365 }, TODAY).map((d) => d.client_ref)).toEqual(['C1'])
    expect(riskReport(db, partner).rows.map((r) => r.client_ref)).toEqual(['C1'])
    expect(dashboardStats(db, partner, TODAY)).toMatchObject({ totalClients: 3, currentClients: 1, activeClients: 1, noLongerClients: 2 })
    expect((db.prepare(`SELECT COUNT(*) AS n FROM clients c WHERE ${currentClientSql('c')}`).get() as { n: number }).n).toBe(1)
    expect(db.prepare('SELECT client_ref FROM v_deadline_worklist').all()).toEqual([{ client_ref: 'C1' }])
  })

  it('keep everything on file, can still be listed, and what they owe stays in Billing', () => {
    const db = withWork()
    db.exec("UPDATE clients SET status = 'Former client', utr = '1234567802' WHERE ref = 'C2'")
    expect(listClients(db, partner).map((c) => [c.ref, c.status])).toContainEqual(['C2', 'Former client'])
    expect(db.prepare("SELECT COUNT(*) AS n FROM compliance_periods WHERE client_ref = 'C2'").get()).toEqual({ n: 1 })
    expect(receivablesSummary(db, partner)).toMatchObject({ outstanding_pence: 5000, overdue_count: 1 })
  })

  it('can be given Ceased or Dissolved from the practice’s list of statuses', () => {
    const db = practice()
    expect(db.prepare("SELECT value_key FROM lookup_values WHERE list_key = 'client_status' ORDER BY sort_order").all().map((r) => (r as { value_key: string }).value_key))
      .toEqual(['Active', 'Prospect', 'Dormant', 'Review required', 'Former client', 'Ceased', 'Dissolved'])
  })
})

