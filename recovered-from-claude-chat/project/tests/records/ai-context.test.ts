/**
 * What the assistant is given about one client (records/ai-context.ts): the
 * facts a briefing needs — deadlines, risk, money, AML, open issues, recent
 * contact — and never a tax reference, an NI number, an authorisation code or
 * a password. Staff: their own clients only. Made-up data only.
 */
import { describe, expect, it } from 'vitest'
import { clientContext } from '../../src/main/records/ai-context'
import { local, partner, practice, staffA, staffB } from './helpers'

describe('a client’s file for the assistant', () => {
  it('has what a briefing needs, and nothing secret', () => {
    const db = practice()
    db.prepare("UPDATE clients SET reg_no = '01234567', company_status = 'active', engagement_letter = 1, ct_ref = '1234567890' WHERE ref = 'C1'").run()
    db.prepare("INSERT INTO compliance_periods (client_ref, obligation, period_key, due_date) VALUES ('C1', 'vat_return', 'q3', ?), ('C1', 'ct600', 'y1', ?)").run(local(-10), local(20))
    db.prepare("INSERT INTO client_services (client_ref, service_type, active) VALUES ('C1', 'vat_returns', 1), ('C1', 'old_thing', 0)").run()
    db.prepare("INSERT INTO payments (client_ref, invoice_no, amount_pence, vat_pence, invoice_date, due_date, status) VALUES ('C1', 'INV-1', 10000, 2000, ?, ?, 'pending')").run(local(-40), local(-10))
    db.prepare("INSERT INTO aml_records (client_ref, risk_level, cdd_completed, review_due_date) VALUES ('C1', 'medium', 1, ?)").run(local(100))
    db.prepare("INSERT INTO data_issues (issue_key, severity, issue_type, client_ref, description, status) VALUES ('i1', 'high', 'x', 'C1', 'Two different VAT numbers on file', 'open')").run()
    db.prepare("INSERT INTO interactions (date, client_ref, type, summary, followup_date, followup_done) VALUES (?, 'C1', 'call', 'Asked for the bank statements', ?, 0)").run(local(-2), local(5))
    db.prepare("INSERT INTO communication_log (client_ref, channel, subject, status, sent_at) VALUES ('C1', 'email', 'Your VAT return', 'sent', ?)").run(`${local(-1)} 10:00:00`)

    const text = clientContext(db, partner, 'C1', local(0))
    expect(text).toContain('Client: Alpha Ltd (C1), company, status Active, looked after by Staff A.')
    expect(text).toContain('Company 01234567, active.')
    expect(text).toContain('Engagement letter: recorded. 64-8: not recorded.')
    expect(text).toContain('Services: vat returns.')
    expect(text).toContain('VAT return: due ')
    expect(text).toContain('overdue by 10 days')
    expect(text).toContain('in 20 days, with Staff A.')
    expect(text).toMatch(/RISK: score \d+ of 100/)
    expect(text).toContain('Invoiced £120.00; owed £120.00, of which £120.00 overdue; credit £0.00.')
    expect(text).toContain('Risk medium; due diligence complete; review due ')
    expect(text).toContain('high: Two different VAT numbers on file')
    expect(text).toContain('call: Asked for the bank statements (follow-up due ')
    expect(text).toContain('email sent: Your VAT return')
    expect(text).not.toContain('old thing')
    // Never secrets: the NI number, the authorisation code, the tax reference.
    for (const secret of ['AB123456C', 'A1B2C3', '1234567890']) expect(text).not.toContain(secret)
  })

  it('says what isn’t recorded, and keeps staff to their own clients', () => {
    const db = practice()
    const text = clientContext(db, staffA, 'C1', local(0))
    expect(text).toContain('No open deadlines in the next year.')
    expect(text).toContain('No invoices recorded.')
    expect(text).toContain('No AML check recorded.')
    expect(() => clientContext(db, staffB, 'C1', local(0))).toThrow(/assigned to you/)
    expect(() => clientContext(db, partner, 'NOPE', local(0))).toThrow()
    expect(() => clientContext(db, partner, '', local(0))).toThrow('That isn’t a client reference.')
  })
})
