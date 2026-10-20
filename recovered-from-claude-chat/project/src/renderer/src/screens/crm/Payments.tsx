import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PoundSterling, Clock, CheckCircle2, Plus, Search, Trash2 } from 'lucide-react'
import { cn, formatDeadline } from '../../lib/utils'
import { useUiStore } from '../../stores/ui'
import { useAuthStore } from '../../stores/crm/auth'
import type { ARSummary, Payment, Client } from '@shared/types'
import { formatPence, parsePounds, vatOn } from '@shared/money'

const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const inDays = (n: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Draft {
  client_ref: string
  invoice_no: string
  net: string
  vat: string
  addVat: boolean
  invoice_date: string
  due_date: string
  notes: string
}

const freshDraft = (): Draft => ({ client_ref: '', invoice_no: '', net: '', vat: '', addVat: true, invoice_date: today(), due_date: inDays(14), notes: '' })

/**
 * What an invoice's state is, from what is still owed on it after receipts (the
 * same working as every balance): settled, part paid, overdue or not yet due.
 */
const shownStatus = (p: Payment): string => {
  if (p.status === 'cancelled') return 'cancelled'
  const gross = (p.amount_pence ?? 0) + (p.vat_pence ?? 0)
  const owed = p.owed_pence ?? gross
  if (p.status === 'paid' || owed <= 0) return 'paid'
  if (p.due_date && p.due_date < today()) return 'overdue'
  return owed < gross ? 'part paid' : 'pending'
}

export function Payments(): React.JSX.Element {
  const [payments, setPayments] = useState<Payment[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [summary, setSummary] = useState<ARSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [draft, setDraft] = useState<Draft>(freshDraft)
  const [formError, setFormError] = useState<string | null>(null)
  const { hidePrivateData } = useUiStore()
  const isPartner = useAuthStore((s) => s.user?.role === 'partner')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [p, c, s] = await Promise.all([
        window.api.getPayments(),
        window.api.getClients(),
        window.api.getARSummary()
      ])
      setPayments(p)
      setClients(c)
      setSummary(s)
    } finally {
      setLoading(false)
    }
  }

  // Net and VAT are typed in pounds and stored in whole pence.
  const net = parsePounds(draft.net, { label: 'The amount' })
  const vatTyped = parsePounds(draft.vat, { label: 'The VAT' })
  const netPence = net.ok ? net.pence : null
  const vatPence = draft.addVat ? (netPence !== null ? vatOn(netPence, 20) : null) : vatTyped.ok ? vatTyped.pence : null
  const grossPence = netPence !== null ? netPence + (vatPence ?? 0) : null

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!net.ok) return setFormError(net.error)
    if (netPence === null || netPence === 0) return setFormError('Enter the amount, before VAT.')
    if (!draft.addVat && !vatTyped.ok) return setFormError(vatTyped.error)
    const res = await window.api.createPayment({
      client_ref: draft.client_ref,
      invoice_no: draft.invoice_no.trim() || null,
      amount_pence: netPence,
      vat_pence: vatPence ?? 0,
      status: 'pending',
      invoice_date: draft.invoice_date || null,
      due_date: draft.due_date || null,
      notes: draft.notes.trim() || null
    })
    if (res.success) {
      setShowAddModal(false)
      setDraft(freshDraft())
      loadData()
    } else {
      setFormError(res.error || 'The invoice couldn’t be saved.')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this invoice? The practice must normally keep invoices for six years.')) return
    const res = await window.api.deletePayment(id)
    if (res.success) loadData()
    else alert(res.error || 'The invoice couldn’t be deleted.')
  }

  const q = searchQuery.toLowerCase()
  const filtered = payments.filter(p =>
    !q ||
    p.client_name?.toLowerCase().includes(q) ||
    p.client_ref?.toLowerCase().includes(q) ||
    p.invoice_no?.toLowerCase().includes(q) ||
    p.notes?.toLowerCase().includes(q)
  )

  return (
    <div className="flex flex-col h-full bg-background p-6 space-y-6 overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Payments & Fees</h2>
          <p className="text-sm text-muted-foreground mt-1">Invoices raised, money received and what is still owed.</p>
        </div>
        <button
          onClick={() => { setFormError(null); setShowAddModal(true) }}
          className="h-10 px-4 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-2 hover:opacity-90 transition-all shadow-sm"
        >
          <Plus size={16} /> Create Invoice
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Invoiced (with VAT)" pence={summary?.invoiced_pence ?? 0} icon={<PoundSterling size={16} />} color="text-indigo-600" />
        <StatCard title="Received" pence={summary?.received_pence ?? 0} icon={<CheckCircle2 size={16} />} color="text-emerald-600" />
        <StatCard
          title="Owed"
          pence={summary?.outstanding_pence ?? 0}
          icon={<Clock size={16} />}
          color="text-amber-600"
          note={summary && summary.overdue_pence > 0 ? `${formatPence(summary.overdue_pence)} overdue on ${summary.overdue_count} invoice${summary.overdue_count === 1 ? '' : 's'}` : undefined}
        />
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by client, invoice number or notes…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex-1 overflow-auto border border-border rounded-xl bg-card shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-muted/50 backdrop-blur-md border-b border-border z-10">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Client</th>
              <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Invoice</th>
              <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Total</th>
              <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Date</th>
              <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Due Date</th>
              <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground animate-pulse">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground italic">No invoices found.</td></tr>
            ) : (
              filtered.map(p => {
                const status = shownStatus(p)
                const total = (p.amount_pence ?? 0) + (p.vat_pence ?? 0)
                return (
                  <tr key={p.id} className="hover:bg-accent/30 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold">{p.client_name}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">{p.client_ref}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{p.invoice_no || '—'}</td>
                    <td className="px-6 py-4 font-mono text-sm">
                      <p className="font-bold">{hidePrivateData ? '••••••••' : formatPence(total)}</p>
                      {!hidePrivateData && (p.vat_pence ?? 0) > 0 && (
                        <p className="text-[10px] text-muted-foreground">incl. VAT {formatPence(p.vat_pence)}</p>
                      )}
                      {!hidePrivateData && status !== 'paid' && status !== 'cancelled' && p.owed_pence !== undefined && p.owed_pence < total && (
                        <p className="text-[10px] text-amber-600">{formatPence(p.owed_pence)} still owed</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{formatDeadline(p.invoice_date)}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{formatDeadline(p.due_date)}</td>
                    <td className="px-6 py-4">
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold uppercase', {
                        'bg-emerald-500/10 text-emerald-600': status === 'paid',
                        'bg-amber-500/10 text-amber-600': status === 'pending' || status === 'part paid',
                        'bg-red-500/10 text-red-600': status === 'overdue',
                        'bg-muted text-muted-foreground': status === 'cancelled'
                      })}>
                        {status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isPartner && (
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleDelete(p.id)}
                            aria-label={`Delete invoice ${p.invoice_no || p.id}`}
                            title="Delete invoice (partners only)"
                            className="p-2 hover:bg-background rounded-lg text-muted-foreground hover:text-destructive transition-all shadow-sm border border-transparent hover:border-border"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Invoice Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddModal(false)} className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6">
              <h3 className="text-lg font-bold mb-6">Create New Invoice</h3>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label htmlFor="inv-client" className="text-xs font-semibold text-muted-foreground block mb-1">Client</label>
                  <select
                    id="inv-client"
                    required autoFocus
                    value={draft.client_ref}
                    className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
                    onChange={e => setDraft({ ...draft, client_ref: e.target.value })}
                  >
                    <option value="">Select Client</option>
                    {clients.filter(c => c.ref).map(c => <option key={c.id} value={c.ref || ''}>{c.client_name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="inv-no" className="text-xs font-semibold text-muted-foreground block mb-1">Invoice number</label>
                    <input
                      id="inv-no"
                      className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
                      value={draft.invoice_no}
                      onChange={e => setDraft({ ...draft, invoice_no: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-net" className="text-xs font-semibold text-muted-foreground block mb-1">Amount before VAT (£)</label>
                    <input
                      id="inv-net"
                      inputMode="decimal" required
                      placeholder="0.00"
                      className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
                      value={draft.net}
                      onChange={e => setDraft({ ...draft, net: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 items-end">
                  <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground h-10">
                    <input type="checkbox" checked={draft.addVat} onChange={e => setDraft({ ...draft, addVat: e.target.checked })} />
                    Add VAT at 20%
                  </label>
                  <div>
                    <label htmlFor="inv-vat" className="text-xs font-semibold text-muted-foreground block mb-1">VAT (£)</label>
                    <input
                      id="inv-vat"
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={draft.addVat}
                      className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm disabled:opacity-60"
                      value={draft.addVat ? (vatPence !== null ? (vatPence / 100).toFixed(2) : '') : draft.vat}
                      onChange={e => setDraft({ ...draft, vat: e.target.value })}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  Total: <span className="font-semibold text-foreground">{grossPence !== null ? formatPence(grossPence) : '—'}</span>
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="inv-date" className="text-xs font-semibold text-muted-foreground block mb-1">Invoice Date</label>
                    <input
                      id="inv-date"
                      type="date"
                      className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
                      value={draft.invoice_date}
                      onChange={e => setDraft({ ...draft, invoice_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-due" className="text-xs font-semibold text-muted-foreground block mb-1">Due Date</label>
                    <input
                      id="inv-due"
                      type="date"
                      className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
                      value={draft.due_date}
                      onChange={e => setDraft({ ...draft, due_date: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="inv-notes" className="text-xs font-semibold text-muted-foreground block mb-1">Notes / Description</label>
                  <input
                    id="inv-notes"
                    className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
                    value={draft.notes}
                    placeholder="e.g. Annual Accounts Fee 2025"
                    onChange={e => setDraft({ ...draft, notes: e.target.value })}
                  />
                </div>
                {formError && <p role="alert" className="text-xs text-red-500">{formError}</p>}
                <div className="flex justify-end gap-3 mt-8">
                  <button type="button" onClick={() => setShowAddModal(false)} className="h-10 px-4 rounded-xl border border-input text-sm font-medium hover:bg-accent">Cancel</button>
                  <button type="submit" className="h-10 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-lg hover:opacity-90 transition-all">Create Invoice</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StatCard({ title, pence, icon, color, note }: { title: string; pence: number; icon: React.ReactNode; color: string; note?: string }) {
  const { hidePrivateData } = useUiStore()
  return (
    <div className="bg-card border border-border p-5 rounded-2xl shadow-sm relative overflow-hidden group">
      <div className="flex items-center gap-3 mb-2 relative z-10">
        <div className="relative">
          <div className={cn('p-2 rounded-lg bg-current opacity-10', color)} />
          <div className={cn('absolute inset-0 flex items-center justify-center', color)}>{icon}</div>
        </div>
        <span className="text-xs font-semibold text-muted-foreground uppercase">{title}</span>
      </div>
      <p className="text-2xl font-bold relative z-10">
        {hidePrivateData ? '••••••••' : formatPence(pence)}
      </p>
      {note && !hidePrivateData && <p className="text-[11px] text-red-500 mt-1 relative z-10">{note}</p>}
      {/* Decorative background shape */}
      <div className={cn('absolute -right-4 -bottom-4 w-24 h-24 rounded-full opacity-[0.03] group-hover:scale-110 transition-transform duration-500', color.replace('text-', 'bg-'))} />
    </div>
  )
}
