/**
 * Forecast (records/forecast.ts): deadlines and workload by month, kind of
 * work and person; tasks and work in progress; the billing the recorded fees
 * add up to, in exact pence; money owed, falling due and received; and who
 * sees what. Made-up data only.
 */
import { describe, expect, it } from 'vitest'
import { cadenceOf, forecast, monthlyShare, monthsFrom } from '../../src/main/records/forecast'
import { forecastContext } from '../../src/main/records/ai-context'
import { local, manager, partner, practice, staffA } from './helpers'

const TODAY = '2026-10-20'

/** A deadline on the register. */
function period(db: ReturnType<typeof practice>, ref: string, obligation: string, due: string, extra: { status?: string; person?: string } = {}): void {
  db.prepare('INSERT INTO compliance_periods (client_ref, obligation, period_key, due_date, status, assigned_to) VALUES (?, ?, ?, ?, ?, ?)').run(
    ref, obligation, `${obligation}-${due}`, due, extra.status ?? 'not_started', extra.person ?? null
  )
}

/** The month slot a date falls in, counted from today's month. */
const slotOf = (date: string, today: string): number =>
  (Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))) - (Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)))

describe('months and money arithmetic', () => {
  it('names the months from this one, across a year end', () => {
    const first = 2026 * 12 + 9
    expect(monthsFrom(first, 4)).toEqual([
      { key: '2026-10', label: 'Oct 2026' },
      { key: '2026-11', label: 'Nov 2026' },
      { key: '2026-12', label: 'Dec 2026' },
      { key: '2027-01', label: 'Jan 2027' }
    ])
  })

  it('shares a yearly amount over the months so any twelve in a row add up exactly', () => {
    for (const yearly of [0, 1, 11, 12, 13, 99_999, 120_000, 123_457, 1_000_000_007]) {
      for (let start = 0; start < 12; start++) {
        let total = 0
        for (let i = 0; i < 12; i++) total += monthlyShare(yearly, (start + i) % 12)
        expect([yearly, start, total]).toEqual([yearly, start, yearly])
      }
      for (let m = 0; m < 12; m++) expect(Number.isInteger(monthlyShare(yearly, m))).toBe(true)
    }
  })

  it('reads how often a fee is billed from the words on the service', () => {
    expect(['Monthly', 'per month', 'PCM'].map(cadenceOf)).toEqual(['monthly', 'monthly', 'monthly'])
    expect(['Quarterly', 'every quarter'].map(cadenceOf)).toEqual(['quarterly', 'quarterly'])
    expect(['Annually', 'Yearly', 'per annum', 'annual'].map(cadenceOf)).toEqual(['annual', 'annual', 'annual', 'annual'])
    expect(['One-off', 'once', 'one_time'].map(cadenceOf)).toEqual(['one_off', 'one_off', 'one_off'])
    expect(['As needed', '', null, 'fortnightly'].map(cadenceOf)).toEqual(['unscheduled', 'unscheduled', 'unscheduled', 'unscheduled'])
  })

  it('accepts 3, 6 or 12 months, and whose work in the known forms only', () => {
    const db = practice()
    expect(forecast(db, partner, { months: 3 }, TODAY).months.map((m) => m.label)).toEqual(['Oct 2026', 'Nov 2026', 'Dec 2026'])
    expect(forecast(db, partner, undefined, TODAY).months).toHaveLength(12)
    expect(() => forecast(db, partner, { months: 5 }, TODAY)).toThrow('Choose 3, 6 or 12 months ahead.')
    expect(() => forecast(db, partner, { months: '12' }, TODAY)).toThrow('Choose 3, 6 or 12 months ahead.')
    for (const whose of ['someone', 'person:', 'person:  ', 42, `person:${'x'.repeat(201)}`]) {
      expect(() => forecast(db, partner, { whose }, TODAY)).toThrow('Choose whose work to show.')
    }
  })
})

describe('workload', () => {
  function withDeadlines(): ReturnType<typeof practice> {
    const db = practice()
    period(db, 'C1', 'vat_return', '2026-09-01') // overdue by 49 days
    period(db, 'C1', 'ct600', '2026-10-25')
    period(db, 'C1', 'annual_accounts', '2026-11-05')
    period(db, 'C1', 'ct600', '2026-10-31', { person: 'Staff B' }) // the deadline's own person wins
    period(db, 'C3', 'confirmation_statement', '2027-01-31')
    period(db, 'C3', 'confirmation_statement', '2027-10-01') // beyond twelve months
    period(db, 'C2', 'vat_return', '2026-11-07', { status: 'filed' }) // done
    return db
  }

  it('counts deadlines by month, by kind of work and by person, with the overdue ones apart', () => {
    const f = forecast(withDeadlines(), partner, undefined, TODAY)
    const w = f.workload
    expect(w.overdue).toBe(1)
    expect(w.oldestOverdueDays).toBe(49)
    expect(w.byMonth).toEqual([2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(w.busiest).toEqual({ key: '2026-10', label: 'Oct 2026', count: 2 })
    expect(w.byObligation.map((o) => [o.obligation, o.overdue, o.total])).toEqual([
      ['ct600', 0, 2],
      ['annual_accounts', 0, 1],
      ['confirmation_statement', 0, 1],
      ['vat_return', 1, 1]
    ])
    expect(w.byPerson.map((p) => [p.person, p.overdue, p.total])).toEqual([
      ['Staff A', 1, 3],
      ['Staff B', 0, 1],
      [null, 0, 1]
    ])
    expect(w.byPerson[0].byMonth.slice(0, 2)).toEqual([1, 1])
    expect(f.scope).toBe('practice')
    expect(f.notes.map((n) => n.code)).toEqual(['unassigned', 'no_fees', 'no_invoices'])
    expect(f.notes[0].text).toBe('1 deadline of these 5 is nobody’s yet. Assign clients to people (Clients: tick them, then Assign) to see who is busy when.')
  })

  it('narrows to one person’s work, nobody’s, or your own, and lists whose work can be shown', () => {
    const db = withDeadlines()
    expect(forecast(db, partner, { whose: 'person:staff b' }, TODAY).workload.byPerson.map((p) => p.person)).toEqual(['Staff B'])
    expect(forecast(db, partner, { whose: 'nobody' }, TODAY).workload.byMonth.slice(0, 4)).toEqual([0, 0, 0, 1])
    expect(forecast(db, manager, { whose: 'mine' }, TODAY).workload.overdue).toBe(0)
    const people = forecast(db, manager, undefined, TODAY).people
    expect(people).toEqual(['Manager M', 'Partner P', 'Staff A', 'Staff B'])
  })

  it('shows staff their own clients only, with nothing about anyone else', () => {
    const f = forecast(withDeadlines(), staffA, undefined, TODAY)
    expect(f.scope).toBe('own')
    expect(f.people).toEqual([])
    expect(f.workload.overdue).toBe(1)
    // C1's four deadlines, one of them with Staff B; nothing of C2 or C3.
    expect(f.workload.byMonth.slice(0, 4)).toEqual([2, 1, 0, 0])
    expect(f.notes.map((n) => n.code)).not.toContain('unassigned')
  })

  it('counts open tasks and work in progress, and leaves out the finished and cancelled', () => {
    const db = practice()
    const task = db.prepare("INSERT INTO tasks (client_ref, description, priority, due_date, status, assigned_to) VALUES (?, ?, 'medium', ?, ?, ?)")
    task.run('C1', 'Late', '2026-10-01', 'pending', 'Staff A')
    task.run('C1', 'This month', '2026-10-28', 'in_progress', 'Staff A')
    task.run('C2', 'Later', '2026-12-02', 'pending', 'Staff A') // C2 is Staff B's client, but the task is Staff A's
    task.run('C2', 'Someone else', '2026-12-03', 'pending', 'Staff B')
    task.run('C1', 'No date', '', 'pending', null)
    task.run('C1', 'Cancelled', '2026-10-02', 'cancelled', 'Staff A')
    task.run('C1', 'Done', '2026-10-02', 'Completed', 'Staff A')
    const job = db.prepare('INSERT INTO wip_items (client_ref, assigned_to, deadline, due_date, status) VALUES (?, ?, ?, ?, ?)')
    job.run('C1', 'Staff A', '2026-10-01', null, 'in_progress') // late
    job.run('C1', 'Staff A', '', '2026-10-30', 'not_started') // due this month, by its due date
    job.run('C3', null, null, null, 'in_progress')
    job.run('C1', 'Staff A', '2026-09-01', null, 'billed')

    const f = forecast(db, partner, undefined, TODAY)
    expect(f.workload.tasks).toEqual({ overdue: 1, byMonth: [1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0], undated: 1 })
    expect(f.workload.wip).toEqual([
      { person: 'Staff A', open: 2, late: 1, dueThisMonth: 1 },
      { person: null, open: 1, late: 0, dueThisMonth: 0 }
    ])
    // Staff A: tasks on their clients and tasks given to them.
    const mine = forecast(db, staffA, undefined, TODAY)
    expect(mine.workload.tasks).toEqual({ overdue: 1, byMonth: [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], undated: 1 })
    expect(mine.workload.wip).toEqual([{ person: 'Staff A', open: 2, late: 1, dueThisMonth: 1 }])
  })
})

describe('fees', () => {
  function withFees(): ReturnType<typeof practice> {
    const db = practice()
    const service = db.prepare('INSERT INTO client_services (client_ref, service_type, active, frequency, next_due, fee_pence) VALUES (?, ?, ?, ?, ?, ?)')
    service.run('C1', 'bookkeeping', 1, 'Monthly', '2026-12-15', 10_000)
    service.run('C1', 'vat_returns', 1, 'Quarterly', '2026-11-01', 30_000)
    service.run('C2', 'annual_accounts', 1, 'Annually', null, 120_000) // no date: spread evenly
    service.run('C2', 'advice', 1, 'One-off', '2027-03-10', 50_000)
    service.run('C2', 'ad_hoc', 1, 'As needed', null, 5_000) // can't be placed in a month
    service.run('C2', 'old_service', 0, 'Monthly', null, 99_000) // not active
    service.run('C2', 'free_service', 1, 'Monthly', null, 0) // no fee
    db.prepare("UPDATE clients SET annual_fee_pence = 99999 WHERE ref = 'C3'").run() // no services: the client's own annual fee
    db.prepare("UPDATE clients SET annual_fee_pence = 777777 WHERE ref = 'C1'").run() // has service fees: not counted twice
    return db
  }

  it('places each fee in the months it is billed, in exact pence', () => {
    const fees = forecast(withFees(), partner, undefined, TODAY).fees
    expect(fees.byMonth).toEqual([18333, 48333, 28333, 28334, 58334, 78334, 28333, 58333, 28333, 28333, 58333, 28333])
    expect(fees.byMonth.reduce((a, b) => a + b, 0)).toBe(10 * 10_000 + 4 * 30_000 + 120_000 + 50_000 + 99_999)
    expect(fees).toMatchObject({ annualPence: 120_000 + 120_000 + 120_000 + 99_999, oneOffPence: 50_000, clientsWithFees: 3, clientsWithout: 0, unscheduledServices: 1, spreadEvenly: 2 })
    const notes = forecast(withFees(), partner, undefined, TODAY).notes
    expect(notes.find((n) => n.code === 'unscheduled_fees')?.text).toBe('1 service fee has no regular frequency or date (“As needed”, or none), so it is left out of the billing forecast.')
    expect(notes.map((n) => n.code)).not.toContain('no_fees')
  })

  it('carries a fee whose next date has passed forward by its own rhythm', () => {
    const db = practice()
    db.prepare("INSERT INTO client_services (client_ref, service_type, active, frequency, next_due, fee_pence) VALUES ('C1', 'payroll', 1, 'Quarterly', '2026-01-15', 9000)").run()
    expect(forecast(db, partner, { months: 6 }, TODAY).fees.byMonth).toEqual([9000, 0, 0, 9000, 0, 0])
  })

  it('narrows fees by the client’s person, and staff see their own clients’ only', () => {
    const db = withFees()
    expect(forecast(db, staffA, undefined, TODAY).fees).toMatchObject({ annualPence: 240_000, clientsWithFees: 1, clientsWithout: 0 })
    expect(forecast(db, partner, { whose: 'nobody' }, TODAY).fees).toMatchObject({ annualPence: 99_999, clientsWithFees: 1 })
    const none = forecast(practice(), partner, undefined, TODAY)
    expect(none.fees).toMatchObject({ annualPence: 0, clientsWithFees: 0, clientsWithout: 3 })
  })
})

describe('cash', () => {
  it('splits what is owed into overdue, falling due by month and undated, and counts money received by month', () => {
    const db = practice()
    const today = local(0)
    const invoice = db.prepare('INSERT INTO payments (client_ref, invoice_no, amount_pence, vat_pence, invoice_date, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const late = invoice.run('C1', 'INV-1', 50_000, 10_000, local(-60), local(-30), 'pending').lastInsertRowid
    invoice.run('C1', 'INV-2', 10_000, 2_000, local(-5), local(25), 'pending')
    invoice.run('C1', 'INV-3', 5_000, 0, local(-5), null, 'pending')
    const part = invoice.run('C2', 'INV-4', 20_000, 4_000, local(-5), local(40), 'pending').lastInsertRowid
    const settled = invoice.run('C2', 'INV-5', 30_000, 0, local(-90), local(-80), 'paid').lastInsertRowid
    invoice.run('C2', 'INV-6', 1_000, 0, local(-5), local(10), 'cancelled')
    const receipt = db.prepare('INSERT INTO payment_receipts (client_ref, payment_id, receipt_date, amount_pence) VALUES (?, ?, ?, ?)')
    receipt.run('C2', part, today, 4_000)
    receipt.run('C2', settled, local(-75), 30_000)
    receipt.run('C1', late, local(-400), 1) // older than the months shown

    const f = forecast(db, partner, undefined, today)
    expect(f.cash.owedPence).toBe(59_999 + 12_000 + 5_000 + 20_000)
    expect(f.cash.overduePence).toBe(59_999)
    expect(f.cash.undatedPence).toBe(5_000)
    expect(f.cash.invoices).toBe(6)
    const expected = new Array<number>(12).fill(0)
    expected[slotOf(local(25), today)] += 12_000
    expected[slotOf(local(40), today)] += 20_000
    expect(f.cash.expectedByMonth).toEqual(expected)
    expect(f.cash.received).toHaveLength(12)
    expect(f.cash.received[11].key).toBe(today.slice(0, 7))
    const got = Object.fromEntries(f.cash.received.filter((r) => r.pence).map((r) => [r.key, r.pence]))
    const want: Record<string, number> = {}
    for (const [d, p] of [[today, 4_000], [local(-75), 30_000]] as const) want[d.slice(0, 7)] = (want[d.slice(0, 7)] ?? 0) + p
    expect(got).toEqual(want)
    expect(f.notes.map((n) => n.code)).not.toContain('no_invoices')

    // Staff A: C1 only.
    const mine = forecast(db, staffA, undefined, today)
    expect(mine.cash).toMatchObject({ owedPence: 59_999 + 12_000 + 5_000, overduePence: 59_999, invoices: 3 })
    expect(mine.cash.received.every((r) => r.pence === 0)).toBe(true)
  })
})

describe('what the assistant is given', () => {
  it('describes the forecast in plain figures, and says when something isn’t recorded', () => {
    const db = practice()
    period(db, 'C1', 'vat_return', '2026-09-01')
    period(db, 'C1', 'ct600', '2026-10-25')
    const text = forecastContext(forecast(db, partner, { months: 3 }, TODAY))
    expect(text).toContain('Forecast for the whole practice, made on 2026-10-20, for Oct 2026 to Dec 2026.')
    expect(text).toContain('Overdue now: 1, the oldest 49 days late.')
    expect(text).toContain('Due by month: Oct 2026 1; Nov 2026 0; Dec 2026 0.')
    expect(text).toContain('By person: Staff A 2 (1 overdue).')
    expect(text).toContain('Tasks: none open.')
    expect(text).toContain('No fees are recorded.')
    expect(text).toContain('No invoices are recorded.')
    expect(forecastContext(forecast(db, staffA, undefined, TODAY))).toContain('Forecast for my clients')
  })
})
