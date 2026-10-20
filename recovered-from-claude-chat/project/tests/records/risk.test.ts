/**
 * Risk (records/risk.ts): each client's score is the sum of reasons a person
 * can check, from deadlines, Companies House, AML, the engagement letter,
 * authorisations, data issues and fees.
 */
import { describe, expect, it } from 'vitest'
import { recordProfile } from '../../src/main/records/ch-watch'
import { bandFor, POINTS, riskReport } from '../../src/main/records/risk'
import { local, partner, practice, staffA } from './helpers'

/** Everything in order for a client: AML done, engagement letter and 64-8 recorded. */
function tidy(db: ReturnType<typeof practice>, ref: string): void {
  db.prepare("UPDATE clients SET engagement_letter = 1, signed_64_8 = 1 WHERE ref = ?").run(ref)
  db.prepare("INSERT INTO aml_records (client_ref, risk_level, cdd_completed, cdd_date, review_due_date) VALUES (?, 'low', 1, ?, ?)").run(ref, local(-100), local(300))
}

describe('the risk list', () => {
  it('scores each reason, and says where to deal with it', () => {
    const db = practice()
    for (const ref of ['C2', 'C3']) tidy(db, ref)
    // C1: two deadlines overdue (one by 120 days), no AML check, no engagement letter, a strike-off proposal,
    // a data issue, fees overdue for over 90 days, and an expired authorisation.
    db.prepare("INSERT INTO compliance_periods (client_ref, obligation, period_key, due_date) VALUES ('C1', 'vat_return', 'a', ?), ('C1', 'ct600', 'b', ?)").run(local(-120), local(-3))
    db.exec("UPDATE clients SET reg_no = '01234567', signed_64_8 = 0 WHERE ref = 'C1'")
    recordProfile(db, { company_number: '01234567', client_ref: 'C1', client_id: 1 }, { company_status: 'active', company_status_detail: 'active-proposal-to-strike-off' }, new Date(), { updateClient: false })
    db.exec("INSERT INTO data_issues (issue_key, severity, issue_type, client_ref, description, status) VALUES ('i1', 'high', 'x', 'C1', 'Two VAT numbers', 'open'), ('i2', 'low', 'x', 'C1', 'Old', 'resolved')")
    db.prepare("INSERT INTO payments (client_ref, invoice_no, amount_pence, vat_pence, invoice_date, due_date, status) VALUES ('C1', 'INV-1', 50000, 10000, ?, ?, 'pending')").run(local(-130), local(-100))
    db.prepare("INSERT INTO agent_authorisations (client_ref, service, status, expires_on) VALUES ('C1', 'vat', 'expired', ?)").run(local(-10))

    const report = riskReport(db, partner)
    const c1 = report.rows[0]
    expect(c1).toMatchObject({ client_ref: 'C1', score: 100, band: 'high' })
    expect(c1.factors.map((f) => [f.code, f.points])).toEqual([
      ['ch_strike_off', 35],
      ['deadlines', 20],
      ['deadlines_long', 10],
      ['fees_overdue', 10],
      ['aml_missing', 8],
      ['authorisation_expired', 6],
      ['fees_long', 6],
      ['engagement_letter', 5],
      ['authorisation_missing', 3],
      ['data_issues', 3]
    ])
    expect(c1.factors.find((f) => f.code === 'deadlines')).toMatchObject({ label: '2 deadlines overdue, the oldest by 120 days', target: { route: 'client-file', clientRef: 'C1' } })
    expect(c1.factors.find((f) => f.code === 'fees_overdue')?.label).toBe('£600.00 of fees overdue')
    expect(c1.factors.find((f) => f.code === 'authorisation_expired')?.label).toBe('Agent authorisation expired or request lapsed: VAT')
    expect(report.rows.slice(1).map((r) => [r.client_ref, r.score, r.band])).toEqual([['C2', 0, 'clear'], ['C3', 0, 'clear']])
    expect(report.counts).toEqual({ high: 1, medium: 0, low: 0, clear: 2 })
    expect(report.factorCounts.aml_missing).toBe(1)
  })

  it('reads AML reviews, high risk and expiring authorisations', () => {
    const db = practice()
    tidy(db, 'C1')
    db.prepare("UPDATE aml_records SET review_due_date = ?, risk_level = 'high', cdd_completed = 0 WHERE client_ref = 'C1'").run(local(-1))
    db.prepare("INSERT INTO agent_authorisations (client_ref, service, status, expires_on) VALUES ('C1', 'paye', 'active', ?)").run(local(20))
    const c1 = riskReport(db, partner).rows.find((r) => r.client_ref === 'C1')!
    expect(c1.factors.map((f) => f.code)).toEqual(['high_risk', 'aml_incomplete', 'aml_review', 'authorisation_expiring'])
    expect(c1.score).toBe(POINTS.amlIncomplete + POINTS.amlReview + POINTS.highRisk + POINTS.authorisationExpiring)
    expect(c1.band).toBe('low') // paperwork alone keeps a client low
    expect(c1.factors.at(-1)?.label).toMatch(/^Agent authorisation for PAYE for employers expires on /)
  })

  it('shows staff their own clients, and leaves out clients that have left', () => {
    const db = practice()
    db.exec("INSERT INTO clients (ref, client_name, client_category, status, assigned_to) VALUES ('C9', 'Left Ltd', 'company', 'Former client', 'Staff A')")
    expect(riskReport(db, staffA).rows.map((r) => r.client_ref)).toEqual(['C1'])
    expect(riskReport(db, partner).rows.map((r) => r.client_ref).sort()).toEqual(['C1', 'C2', 'C3'])
  })

  it('reads the client record’s status before a company’s first check, and the check after it', () => {
    const db = practice()
    for (const ref of ['C1', 'C2', 'C3']) tidy(db, ref)
    db.exec("UPDATE clients SET company_status = 'strike_off', reg_no = '01234567' WHERE ref = 'C1'; UPDATE clients SET company_status = 'liquidation' WHERE ref = 'C2'; UPDATE clients SET company_status = 'not_applicable' WHERE ref = 'C3'")
    const before = riskReport(db, partner).rows
    expect(before.map((r) => [r.client_ref, r.factors.map((f) => f.label)])).toEqual([
      ['C1', ['Strike-off action, on the client record']],
      ['C2', ['In liquidation, on the client record']],
      ['C3', []]
    ])
    // Checked: Companies House says the company is active again, so the record's old flag no longer counts.
    recordProfile(db, { company_number: '01234567', client_ref: 'C1', client_id: 1 }, { company_status: 'active' }, new Date())
    expect(riskReport(db, partner).rows.find((r) => r.client_ref === 'C1')?.score).toBe(0)
    expect(db.prepare("SELECT company_status FROM clients WHERE ref = 'C1'").get()).toEqual({ company_status: 'active' })
  })

  it('reports paperwork missing for nearly every client once, as a practice-wide gap', () => {
    const db = practice()
    for (let i = 4; i <= 12; i++) db.prepare("INSERT INTO clients (ref, client_name, client_category, status) VALUES (?, ?, 'individual', 'Active')").run(`C${i}`, `Client ${i}`)
    tidy(db, 'C1')
    // 11 of 12 have no AML check and no engagement letter: over nine in ten.
    expect(riskReport(db, partner).practiceGaps).toEqual([
      { code: 'aml_missing', clients: 11 },
      { code: 'engagement_letter', clients: 11 },
      { code: 'authorisation_missing', clients: 11 }
    ])
    tidy(db, 'C2')
    expect(riskReport(db, partner).practiceGaps).toEqual([])
  })

  it('puts scores in bands', () => {
    expect([0, 1, 24, 25, 44, 45, 100].map(bandFor)).toEqual(['clear', 'low', 'low', 'medium', 'medium', 'high', 'high'])
  })
})
