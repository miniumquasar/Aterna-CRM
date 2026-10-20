import { describe, expect, it } from 'vitest'
import { licenceLine, practiceReport, practiceReportHtml, reportFooter } from '../../src/main/records/practice-report'
import { local, partner, practice, staffA } from './helpers'

function withRecords(): ReturnType<typeof practice> {
  const db = practice()
  db.exec(`INSERT INTO compliance_periods (client_ref, obligation, period_key, due_date) VALUES
    ('C1', 'vat_return', 'q1', '${local(-3)}'), ('C1', 'annual_accounts', '2026', '${local(20)}'),
    ('C2', 'vat_return', 'q2', '${local(60)}'), ('C3', 'ct600', '2026', '${local(200)}')`)
  db.exec(`INSERT INTO payments (client_ref, amount_pence, vat_pence, due_date, status) VALUES
    ('C1', 100000, 20000, '${local(-40)}', 'pending'), ('C2', 50000, 0, '${local(10)}', 'pending')`)
  db.exec(`INSERT INTO payment_receipts (client_ref, receipt_date, amount_pence) VALUES ('C1', '${local(-1)}', 20000)`)
  db.exec(`INSERT INTO tasks (client_ref, description, due_date, status, assigned_to) VALUES
    ('C1', 'Chase', '${local(-2)}', 'pending', 'Staff A'), ('C2', 'Other', '${local(5)}', 'pending', 'Staff B'), ('C1', 'Done', '${local(-9)}', 'completed', 'Staff A')`)
  db.exec(`INSERT INTO wip_items (client_ref, type, status) VALUES ('C1', 'Accounts', 'In Progress'), ('C2', 'VAT', 'Completed')`)
  return db
}

describe('the practice report', () => {
  it('counts real records for the whole practice', () => {
    const r = practiceReport(withRecords(), partner, local(0))
    expect(r.scope).toBe('practice')
    expect(r.clients).toMatchObject({ total: 3, byStatus: [{ label: 'Active', count: 3 }] })
    expect(r.clients.byCategory).toEqual([{ label: 'Companies', count: 2 }, { label: 'Individuals', count: 1 }])
    expect(r.deadlines).toMatchObject({ overdue: 1, within30: 1, within90: 2 }) // the CT600 is more than 90 days out
    expect(r.deadlines.byType.find((d) => d.type === 'VAT return')).toEqual({ type: 'VAT return', overdue: 1, within30: 0, within90: 1 })
    expect(r.money).toMatchObject({ invoiced_pence: 170000, received_pence: 20000, outstanding_pence: 150000, overdue_pence: 100000, clientsOwing: 2 })
    expect(r.money.topOwing.map((o) => [o.ref, o.name, o.owed_pence])).toEqual([['C1', 'Alpha Ltd', 100000], ['C2', 'Beta Ltd', 50000]])
    expect(r.work).toEqual({ openTasks: 2, overdueTasks: 1, openWip: 1 })
  })

  it('counts the same deadlines as Home and Deadlines, the due dates on the client record included', () => {
    const db = withRecords()
    // A date only on the client record, as Companies House checks fill it in; and a filed period that no longer counts.
    db.exec(`UPDATE clients SET conf_stmt_due = '${local(12)}' WHERE ref = 'C3'`)
    db.exec(`INSERT INTO compliance_periods (client_ref, obligation, period_key, due_date, status, filed_date) VALUES ('C2', 'ct600', '2025', '${local(-30)}', 'filed', '${local(-40)}')`)
    const r = practiceReport(db, partner, local(0))
    expect(r.deadlines).toMatchObject({ overdue: 1, within30: 2, within90: 3 })
    expect(r.deadlines.byType.find((d) => d.type === 'Confirmation statement')).toEqual({ type: 'Confirmation statement', overdue: 0, within30: 1, within90: 1 })
    // A client that has left has no open deadlines anywhere, the report included.
    db.exec("UPDATE clients SET status = 'Former client' WHERE ref = 'C1'")
    expect(practiceReport(db, partner, local(0)).deadlines).toMatchObject({ overdue: 0, within30: 1, within90: 2 })
  })

  it('covers only a member of staff’s own clients and work', () => {
    const r = practiceReport(withRecords(), staffA, local(0))
    expect(r.scope).toBe('own')
    expect(r.clients.total).toBe(1)
    expect(r.deadlines).toMatchObject({ overdue: 1, within30: 1, within90: 1 })
    expect(r.money.topOwing.map((o) => o.ref)).toEqual(['C1'])
    expect(r.work).toEqual({ openTasks: 1, overdueTasks: 1, openWip: 1 })
  })

  it('prints the licensed firm on the page and in every page’s footer, with everything escaped', () => {
    const db = withRecords()
    db.exec("UPDATE clients SET client_name = '<script>alert(1)</script> & Co' WHERE ref = 'C1'")
    const r = practiceReport(db, partner, '2026-10-12')
    const html = practiceReportHtml(r, { practice: 'Made Up & Partners', licensedTo: 'Made Up Accountants Ltd', preparedFor: 'Partner P' })
    expect(html).toContain('AETERNA CRM · Licensed to Made Up Accountants Ltd')
    expect(html).toContain('Made Up &amp; Partners — practice report')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co')
    expect(html).not.toContain('<script>')
    expect(html).toContain('12 October 2026 · prepared for Partner P · the whole practice')
    expect(reportFooter('Made Up Accountants Ltd', '2026-10-12')).toContain('AETERNA CRM · Licensed to Made Up Accountants Ltd · 12 October 2026')
    expect(licenceLine(null)).toBe('Free trial copy — not yet licensed')
  })
})

