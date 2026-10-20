import { describe, expect, it } from 'vitest'
import {
  addReceipt, allClientReceivables, clientReceivables, computeReceivables, deleteReceipt, invoiceOwed, listReceipts, receivablesSummary,
  type InvoiceLine, type ReceiptLine
} from '../../src/main/records/receivables'
import { auditOf, local, manager, partner, practice, staffA } from './helpers'

const TODAY = '2026-10-08'
let nextId = 1
const inv = (o: Partial<InvoiceLine>): InvoiceLine => ({
  id: nextId++, client_ref: 'C1', invoice_date: null, due_date: null, amount_pence: 0, vat_pence: 0, status: 'pending', ...o
})
const rec = (o: Partial<ReceiptLine>): ReceiptLine => ({ id: nextId++, client_ref: 'C1', payment_id: null, receipt_date: '2026-01-01', amount_pence: 0, ...o })

describe('what clients owe', () => {
  it('pays the oldest invoices first with unlinked receipts, and ages what is left', () => {
    const a = inv({ due_date: '2026-06-01', amount_pence: 100000, vat_pence: 20000 }) // 129 days late
    const b = inv({ due_date: '2026-09-20', amount_pence: 50000 }) // 18 days late
    const c = inv({ due_date: '2026-10-30', amount_pence: 30000 }) // not due
    const ar = computeReceivables([c, b, a], [rec({ amount_pence: 130000 })], TODAY).get('C1')!
    expect(ar).toMatchObject({
      invoiced_pence: 200000, received_pence: 130000, outstanding_pence: 70000, credit_pence: 0,
      overdue_pence: 40000, bucket_1_30_pence: 40000, bucket_current_pence: 30000, bucket_over_90_pence: 0,
      open_invoices: 2, overdue_invoices: 1
    })
  })

  it('applies a linked receipt to its own invoice first', () => {
    const old = inv({ due_date: '2026-01-01', amount_pence: 10000 })
    const recent = inv({ due_date: '2026-10-01', amount_pence: 10000 })
    const ar = computeReceivables([old, recent], [rec({ payment_id: recent.id, amount_pence: 15000 })], TODAY).get('C1')!
    // 10000 pays "recent"; the other 5000 goes to the oldest
    expect(ar).toMatchObject({ outstanding_pence: 5000, overdue_pence: 5000, bucket_over_90_pence: 5000, credit_pence: 0 })
  })

  it('treats an invoice marked paid as settled, and gives it no share of receipts that aren’t linked', () => {
    const paid = inv({ due_date: '2026-01-01', amount_pence: 10000, status: 'paid' })
    const open = inv({ due_date: '2026-09-01', amount_pence: 10000 })
    expect(computeReceivables([paid, open], [], TODAY).get('C1')).toMatchObject({ outstanding_pence: 10000, open_invoices: 1 })
    // money that isn't linked to an invoice pays what is still open
    expect(computeReceivables([paid, open], [rec({ amount_pence: 10000 })], TODAY).get('C1')).toMatchObject({ outstanding_pence: 0, credit_pence: 0 })
    // money linked to the paid invoice stays with it, so the open one is still owed
    expect(computeReceivables([paid, open], [rec({ payment_id: paid.id, amount_pence: 10000 })], TODAY).get('C1'))
      .toMatchObject({ outstanding_pence: 10000, credit_pence: 0, open_invoices: 1 })
  })

  it('does not let a large invoice marked paid swallow the money for a smaller one (review case)', () => {
    const big = inv({ invoice_date: '2026-03-01', due_date: '2026-03-31', amount_pence: 180000, status: 'paid' })
    const small = inv({ invoice_date: '2026-05-01', due_date: '2026-05-31', amount_pence: 50000 })
    const owed = new Map<number, number>()
    const ar = computeReceivables([big, small], [rec({ amount_pence: 50000 })], TODAY, owed).get('C1')!
    expect(ar).toMatchObject({ outstanding_pence: 0, overdue_pence: 0, credit_pence: 0, open_invoices: 0, overdue_invoices: 0 })
    expect([owed.get(big.id), owed.get(small.id)]).toEqual([0, 0])
  })

  it('puts a refund back on the invoice it is linked to, else on the newest open invoices', () => {
    const a = inv({ due_date: '2026-08-01', amount_pence: 10000 })
    const b = inv({ due_date: '2026-09-01', amount_pence: 10000 })
    const paidUp = [rec({ payment_id: a.id, amount_pence: 10000 }), rec({ payment_id: b.id, amount_pence: 10000 })]
    const owed = new Map<number, number>()
    // linked: owed on that invoice again — even when the refund was typed in before the payment
    expect(computeReceivables([a, b], [rec({ payment_id: a.id, amount_pence: -4000 }), ...paidUp], TODAY, owed).get('C1'))
      .toMatchObject({ received_pence: 16000, outstanding_pence: 4000, credit_pence: 0 })
    expect([owed.get(a.id), owed.get(b.id)]).toEqual([4000, 0])
    // not linked: back on the newest open invoice first
    owed.clear()
    expect(computeReceivables([a, b], [...paidUp, rec({ amount_pence: -3000 })], TODAY, owed).get('C1'))
      .toMatchObject({ outstanding_pence: 3000, credit_pence: 0 })
    expect([owed.get(a.id), owed.get(b.id)]).toEqual([0, 3000])
    // a refund of money held as a credit just uses up the credit
    expect(computeReceivables([a], [rec({ amount_pence: 15000 }), rec({ amount_pence: -5000 })], TODAY).get('C1'))
      .toMatchObject({ outstanding_pence: 0, credit_pence: 0 })
    // a refund of an overpayment on a paid invoice clears the credit and nothing else
    const settled = inv({ due_date: '2026-07-01', amount_pence: 10000, status: 'paid' })
    expect(computeReceivables([settled, b], [rec({ payment_id: settled.id, amount_pence: 11000 }), rec({ payment_id: settled.id, amount_pence: -1000 })], TODAY).get('C1'))
      .toMatchObject({ outstanding_pence: 10000, credit_pence: 0 })
  })

  it('reports what is still owed on each invoice, and nothing on cancelled ones', () => {
    const a = inv({ due_date: '2026-08-01', amount_pence: 10000, vat_pence: 2000 })
    const b = inv({ due_date: '2026-09-01', amount_pence: 5000 })
    const gone = inv({ due_date: '2026-09-01', amount_pence: 7000, status: 'cancelled' })
    const owed = new Map<number, number>()
    computeReceivables([a, b, gone], [rec({ amount_pence: 13000 })], TODAY, owed)
    expect([owed.get(a.id), owed.get(b.id), owed.get(gone.id)]).toEqual([0, 4000, 0])
  })

  it('ignores cancelled invoices and shows money received beyond everything as a credit', () => {
    const cancelled = inv({ amount_pence: 99999, status: 'cancelled' })
    const one = inv({ due_date: '2026-11-01', amount_pence: 1000 })
    const ar = computeReceivables([cancelled, one], [rec({ amount_pence: 2500 })], TODAY).get('C1')!
    expect(ar).toMatchObject({ invoiced_pence: 1000, received_pence: 2500, outstanding_pence: 0, credit_pence: 1500 })
    expect(computeReceivables([], [rec({ client_ref: 'C9', amount_pence: 100 })], TODAY).get('C9')).toMatchObject({ credit_pence: 100 })
  })

  it('ages by the full 30/60/90-day brackets, and an invoice with no due date as current', () => {
    const due = (days: number): string => new Date(Date.parse(`${TODAY}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)
    const lines = [0, 1, 30, 31, 60, 61, 90, 91].map((d) => inv({ due_date: due(d), amount_pence: 100 }))
    lines.push(inv({ due_date: null, amount_pence: 100 }))
    expect(computeReceivables(lines, [], TODAY).get('C1')).toMatchObject({
      bucket_current_pence: 200, bucket_1_30_pence: 200, bucket_31_60_pence: 200, bucket_61_90_pence: 200, bucket_over_90_pence: 100, overdue_invoices: 7
    })
  })
})

describe('receivables in the practice', () => {
  it('scopes figures to staff’s own clients', () => {
    const db = practice()
    db.exec(`INSERT INTO payments (client_ref, amount_pence, vat_pence, due_date, status) VALUES
      ('C1', 100000, 20000, '${local(-10)}', 'pending'), ('C2', 50000, 0, '${local(10)}', 'pending')`)
    db.exec(`INSERT INTO payment_receipts (client_ref, receipt_date, amount_pence) VALUES ('C1', '${local(-1)}', 20000)`)
    expect(clientReceivables(db, staffA, 'C1')).toMatchObject({ outstanding_pence: 100000, overdue_pence: 100000 })
    expect(() => clientReceivables(db, staffA, 'C2')).toThrow(/assigned to you/)
    expect(allClientReceivables(db, staffA).map((a) => a.client_ref)).toEqual(['C1'])
    expect(receivablesSummary(db, partner)).toMatchObject({ outstanding_pence: 150000, overdue_pence: 100000, overdue_count: 1, clients_owing: 2 })
    expect(receivablesSummary(db, staffA)).toMatchObject({ outstanding_pence: 100000, clients_owing: 1 })
    expect(clientReceivables(db, partner, 'C3')).toMatchObject({ client_ref: 'C3', outstanding_pence: 0 })
  })

  it('records money received in pence, by the person signed in, for the right invoice', () => {
    const db = practice()
    db.exec("INSERT INTO payments (id, client_ref, amount_pence) VALUES (10, 'C1', 5000), (11, 'C2', 5000)")
    const { id } = addReceipt(db, staffA, { client_ref: 'C1', amount_pence: 5000, payment_id: 10, recorded_by: 'Someone Else', receipt_date: local(0) })
    expect(listReceipts(db, staffA, 'C1')[0]).toMatchObject({ id, amount_pence: 5000, recorded_by: 'Staff A', client_name: 'Alpha Ltd' })
    expect(() => addReceipt(db, staffA, { client_ref: 'C1', amount_pence: 50.5 })).toThrow(/pounds and pence/)
    expect(() => addReceipt(db, staffA, { client_ref: 'C1', amount_pence: 0 })).toThrow(/pounds and pence/)
    expect(() => addReceipt(db, staffA, { client_ref: 'C1', amount_pence: 100, payment_id: 11 })).toThrow(/isn’t one of this client’s/)
    expect(() => addReceipt(db, staffA, { client_ref: 'C1', amount_pence: 100, receipt_date: local(3) })).toThrow(/in the future/)
    expect(() => addReceipt(db, staffA, { client_ref: 'C2', amount_pence: 100 })).toThrow(/assigned to you/)
    expect(auditOf(db, 'Recorded money received')[0].new).toMatchObject({ amount_pence: 5000, recorded_by: 'Staff A' })
  })

  it('gives each invoice the person may see what is still owed on it', () => {
    const db = practice()
    db.exec(`INSERT INTO payments (id, client_ref, amount_pence, due_date, status) VALUES
      (20, 'C1', 10000, '${local(-30)}', 'paid'), (21, 'C1', 5000, '${local(-10)}', 'pending'), (22, 'C2', 8000, '${local(-5)}', 'pending')`)
    addReceipt(db, staffA, { client_ref: 'C1', amount_pence: 2000 })
    expect([...invoiceOwed(db, staffA).entries()].sort()).toEqual([[20, 0], [21, 3000]])
    expect(invoiceOwed(db, partner, 'C2').get(22)).toBe(8000)
  })

  it('lets only a partner delete a receipt', () => {
    const db = practice()
    const { id } = addReceipt(db, staffA, { client_ref: 'C1', amount_pence: 100 })
    expect(() => deleteReceipt(db, staffA, id)).toThrow(/Only a partner/)
    expect(() => deleteReceipt(db, manager, id)).toThrow(/Only a partner/)
    deleteReceipt(db, partner, id)
    expect(auditOf(db, 'Deleted receipt')[0].old).toMatchObject({ amount_pence: 100, client_ref: 'C1' })
  })
})
