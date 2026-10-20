/**
 * Money owed to the practice — worked out in whole pence, the same way on every
 * screen.
 *
 *   1. Cancelled invoices don't count.
 *   2. A receipt linked to an invoice pays that invoice first; anything beyond
 *      the invoice's total joins the receipts that aren't linked.
 *   3. An invoice marked paid is settled, whether or not a receipt covers it, and
 *      takes no share of the receipts that aren't linked.
 *   4. Receipts that aren't linked pay the open invoices oldest first (by due
 *      date, then invoice date) — "balance forward", the way receipts are
 *      recorded today.
 *   5. A refund (a receipt below zero) beyond the money not yet used puts the
 *      amount back on the newest open invoices.
 *   6. What is left on each invoice is aged from its due date (no due date: current).
 *   7. Receipts beyond everything owed are a credit — money held for the client.
 *      (A receipt recorded for an invoice that was also marked paid, and not
 *      linked to it, shows here: link it to the invoice to clear the credit.)
 *
 * Staff see only their own clients' figures; the practice summary for them is
 * the summary of their clients.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { ARSummary, ClientAR, PaymentReceipt } from '../../shared/types'
import { isPence } from '../../shared/money'
import { auditRow, writeAudit, type Row } from '../access/audit'
import { clientForActor, idArg, refArg, requirePartner, staffClients, UserFacingError, where, type Actor } from '../access/policy'
import { dateOrNull, localDate, textOrNull } from './common'

export interface InvoiceLine {
  id: number
  client_ref: string
  invoice_date: string | null
  due_date: string | null
  amount_pence: number | null
  vat_pence: number | null
  status: string | null
}

export interface ReceiptLine {
  id: number
  client_ref: string
  payment_id: number | null
  receipt_date: string | null
  amount_pence: number | null
}

const DAY = 86_400_000
const dayNumber = (iso: string | null): number | null => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(t) ? null : Math.floor(t / DAY)
}

const empty = (clientRef: string): ClientAR => ({
  client_ref: clientRef,
  invoiced_pence: 0,
  received_pence: 0,
  outstanding_pence: 0,
  credit_pence: 0,
  overdue_pence: 0,
  bucket_current_pence: 0,
  bucket_1_30_pence: 0,
  bucket_31_60_pence: 0,
  bucket_61_90_pence: 0,
  bucket_over_90_pence: 0,
  open_invoices: 0,
  overdue_invoices: 0
})

/**
 * The rules above, as a pure function: one ClientAR per client that has invoices
 * or receipts. `owedOut`, when given, receives what is still owed on each
 * invoice (0 for one settled, paid or cancelled).
 */
export function computeReceivables(
  invoices: readonly InvoiceLine[],
  receipts: readonly ReceiptLine[],
  today: string,
  owedOut?: Map<number, number>
): Map<string, ClientAR> {
  const todayN = dayNumber(today) ?? Math.floor(Date.now() / DAY)
  const byClient = new Map<string, { invoices: InvoiceLine[]; receipts: ReceiptLine[] }>()
  const bucket = (ref: string): { invoices: InvoiceLine[]; receipts: ReceiptLine[] } => {
    let b = byClient.get(ref)
    if (!b) {
      b = { invoices: [], receipts: [] }
      byClient.set(ref, b)
    }
    return b
  }
  for (const i of invoices) {
    if (i.status === 'cancelled') owedOut?.set(i.id, 0)
    else if (i.client_ref) bucket(i.client_ref).invoices.push(i)
  }
  for (const r of receipts) if (r.client_ref) bucket(r.client_ref).receipts.push(r)

  const out = new Map<string, ClientAR>()
  for (const [ref, { invoices: inv, receipts: rec }] of byClient) {
    const ar = empty(ref)
    const order = [...inv].sort((a, b) =>
      (a.due_date ?? a.invoice_date ?? '9999-12-31').localeCompare(b.due_date ?? b.invoice_date ?? '9999-12-31') ||
      (a.invoice_date ?? '').localeCompare(b.invoice_date ?? '') ||
      a.id - b.id)
    const gross = new Map<number, number>()
    const balance = new Map<number, number>()
    for (const i of order) {
      const g = (i.amount_pence ?? 0) + (i.vat_pence ?? 0)
      ar.invoiced_pence += g
      gross.set(i.id, g)
      balance.set(i.id, g)
    }
    const paid = new Set(order.filter((i) => i.status === 'paid').map((i) => i.id))
    // 2. Linked receipts pay their own invoice; then a linked refund puts money back on
    //    it (if it is still open). Payments go first so the order they were typed in
    //    doesn't change the answer.
    let pool = 0
    for (const r of rec) ar.received_pence += r.amount_pence ?? 0
    for (const r of rec) {
      const amount = r.amount_pence ?? 0
      if (amount <= 0) continue
      const owed = r.payment_id !== null ? balance.get(r.payment_id) : undefined
      if (owed === undefined) {
        pool += amount
        continue
      }
      const take = Math.min(owed, amount)
      balance.set(r.payment_id as number, owed - take)
      pool += amount - take
    }
    for (const r of rec) {
      const amount = r.amount_pence ?? 0
      if (amount >= 0) continue
      const owed = r.payment_id !== null ? balance.get(r.payment_id) : undefined
      if (owed === undefined || paid.has(r.payment_id as number)) {
        pool += amount
        continue
      }
      const back = Math.min((gross.get(r.payment_id as number) ?? 0) - owed, -amount)
      balance.set(r.payment_id as number, owed + back)
      pool += amount + back
    }
    // 3. Paid invoices are settled.
    for (const id of paid) balance.set(id, 0)
    const open = order.filter((i) => !paid.has(i.id))
    // 4. Unlinked money pays the open invoices, oldest first.
    for (const i of open) {
      if (pool <= 0) break
      const owed = balance.get(i.id) ?? 0
      if (owed <= 0) continue
      const take = Math.min(owed, pool)
      balance.set(i.id, owed - take)
      pool -= take
    }
    // 5. Refunds beyond the unlinked money put it back on the newest open invoices.
    for (const i of [...open].reverse()) {
      if (pool >= 0) break
      const paidOff = (gross.get(i.id) ?? 0) - (balance.get(i.id) ?? 0)
      if (paidOff <= 0) continue
      const back = Math.min(paidOff, -pool)
      balance.set(i.id, (balance.get(i.id) ?? 0) + back)
      pool += back
    }
    ar.credit_pence = Math.max(0, pool)
    for (const i of order) {
      const left = Math.max(0, balance.get(i.id) ?? 0)
      owedOut?.set(i.id, left)
      if (left <= 0) continue
      ar.outstanding_pence += left
      ar.open_invoices += 1
      const due = dayNumber(i.due_date)
      const late = due === null ? 0 : todayN - due
      if (late <= 0) ar.bucket_current_pence += left
      else {
        ar.overdue_pence += left
        ar.overdue_invoices += 1
        if (late <= 30) ar.bucket_1_30_pence += left
        else if (late <= 60) ar.bucket_31_60_pence += left
        else if (late <= 90) ar.bucket_61_90_pence += left
        else ar.bucket_over_90_pence += left
      }
    }
    out.set(ref, ar)
  }
  return out
}

function lines(db: Database, actor: Actor, clientRef: string | null, owedOut?: Map<number, number>): Map<string, ClientAR> {
  const scope = clientRef ? { sql: 'client_ref = ?', params: [clientRef] } : staffClients(actor, 'client_ref')
  const w = where(scope, { sql: 'client_ref IS NOT NULL', params: [] })
  const invoices = db.prepare(`SELECT id, client_ref, invoice_date, due_date, amount_pence, vat_pence, status FROM payments${w.sql}`).all(...w.params) as InvoiceLine[]
  const receipts = db.prepare(`SELECT id, client_ref, payment_id, receipt_date, amount_pence FROM payment_receipts${w.sql} ORDER BY receipt_date, id`).all(...w.params) as ReceiptLine[]
  return computeReceivables(invoices, receipts, localDate(), owedOut)
}

/** What is still owed on each invoice the person may see (invoice id → pence). */
export function invoiceOwed(db: Database, actor: Actor, clientRef?: string): Map<number, number> {
  const owed = new Map<number, number>()
  lines(db, actor, clientRef ?? null, owed)
  return owed
}

export function clientReceivables(db: Database, actor: Actor, clientRef: unknown): ClientAR {
  const client = clientForActor(db, refArg(clientRef), actor)
  return lines(db, actor, client.ref).get(client.ref) ?? empty(client.ref)
}

/** Every client (in the person's scope) with invoices or receipts. */
export function allClientReceivables(db: Database, actor: Actor): ClientAR[] {
  return [...lines(db, actor, null).values()]
}

export function receivablesSummary(db: Database, actor: Actor): ARSummary {
  const s: ARSummary = { invoiced_pence: 0, received_pence: 0, outstanding_pence: 0, credit_pence: 0, overdue_pence: 0, overdue_count: 0, clients_owing: 0 }
  for (const ar of lines(db, actor, null).values()) {
    s.invoiced_pence += ar.invoiced_pence
    s.received_pence += ar.received_pence
    s.outstanding_pence += ar.outstanding_pence
    s.credit_pence += ar.credit_pence
    s.overdue_pence += ar.overdue_pence
    s.overdue_count += ar.overdue_invoices
    if (ar.outstanding_pence > 0) s.clients_owing += 1
  }
  return s
}

// ── Receipts ─────────────────────────────────────────────────────────────────

export function listReceipts(db: Database, actor: Actor, clientRef: unknown): PaymentReceipt[] {
  const client = clientForActor(db, refArg(clientRef), actor)
  return db.prepare('SELECT * FROM payment_receipts WHERE client_ref = ? ORDER BY receipt_date DESC, id DESC').all(client.ref) as PaymentReceipt[]
}

/** Records money received. The person signed in is recorded, whatever the screen sends. */
export function addReceipt(db: Database, actor: Actor, input: unknown, today: string = localDate()): { id: number } {
  const data = (input && typeof input === 'object' ? input : {}) as Partial<PaymentReceipt>
  const client = clientForActor(db, refArg(data.client_ref), actor)
  if (!isPence(data.amount_pence) || data.amount_pence === 0) throw new UserFacingError('Enter the amount received, in pounds and pence.')
  const receiptDate = dateOrNull(data.receipt_date, 'The date received') ?? today
  if (receiptDate > today) throw new UserFacingError('The date received is in the future.')
  let paymentId: number | null = null
  if (data.payment_id !== null && data.payment_id !== undefined) {
    paymentId = idArg(data.payment_id, 'invoice')
    const inv = db.prepare('SELECT client_ref FROM payments WHERE id = ?').get(paymentId) as { client_ref: string | null } | undefined
    if (!inv || inv.client_ref !== client.ref) throw new UserFacingError('That invoice isn’t one of this client’s.')
  }
  return db.transaction(() => {
    const id = Number(
      db.prepare(`INSERT INTO payment_receipts (client_ref, client_name, payment_id, receipt_date, amount_pence, method, reference, notes, recorded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        client.ref, client.client_name, paymentId, receiptDate, data.amount_pence,
        textOrNull(data.method, 'The method', 60), textOrNull(data.reference, 'The reference', 120), textOrNull(data.notes, 'The notes'), actor.name
      ).lastInsertRowid
    )
    const row = db.prepare('SELECT * FROM payment_receipts WHERE id = ?').get(id) as Row
    writeAudit(db, actor, 'Recorded money received', 'payment_receipts', id, null, auditRow('payment_receipts', row))
    return { id }
  })()
}

/** Receipts are records the practice must keep: only a partner deletes one. */
export function deleteReceipt(db: Database, actor: Actor, id: unknown): void {
  requirePartner(actor, 'delete receipts — the practice must keep them')
  const rowId = idArg(id, 'receipt')
  const before = db.prepare('SELECT * FROM payment_receipts WHERE id = ?').get(rowId) as Row | undefined
  if (!before) throw new UserFacingError('That receipt no longer exists.')
  db.transaction(() => {
    db.prepare('DELETE FROM payment_receipts WHERE id = ?').run(rowId)
    writeAudit(db, actor, 'Deleted receipt', 'payment_receipts', rowId, auditRow('payment_receipts', before), null)
  })()
}
