import { useEffect, useState } from 'react'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, BarChart3, Download, PieChart as PieIcon, Users, Wallet } from 'lucide-react'
import { cn } from '../../lib/utils'
import { formatPence } from '@shared/money'
import type { PracticeReport } from '@shared/types'
import { Loading, LoadProblem } from '@renderer/components/ui/LoadState'

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

/**
 * Practice insights: real figures only — clients, deadlines, money owed and
 * open work — for staff, their own clients. "Export PDF" saves the same
 * figures as a report with the licensed firm on every page.
 */
export function Reports(): React.JSX.Element {
  const [report, setReport] = useState<PracticeReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const load = (): void => {
    setLoading(true)
    setFailed(false)
    window.api.reports
      .practice()
      .then((r) => setReport(r))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const exportPdf = async (): Promise<void> => {
    setExporting(true)
    setNote(null)
    try {
      const r = await window.api.reports.exportPdf()
      if (!r.success) setNote({ ok: false, text: r.error })
      else if (r.saved) setNote({ ok: true, text: `Saved to ${r.path}` })
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <Loading>Working out the figures…</Loading>
  if (failed || !report) return <LoadProblem what="the practice’s figures" onRetry={load} />

  const work90 = report.deadlines.byType.map((d) => ({ name: d.type, value: d.within90 + d.overdue })).filter((d) => d.value > 0)
  const aging = report.money.buckets.map((b) => ({ name: b.label, pounds: b.pence / 100 }))
  const largestStatus = Math.max(1, ...report.clients.byStatus.map((s) => s.count))

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Practice Insights</h2>
          <p className="text-sm text-white/50 mt-1">
            {report.scope === 'own' ? 'The clients assigned to you' : 'The whole practice'} — clients, deadlines, money owed and open work.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={() => void exportPdf()}
            disabled={exporting}
            className="h-10 px-4 rounded-lg bg-white/[0.04] border border-white/15 text-sm font-medium flex items-center gap-2 hover:bg-white/[0.08] transition-all disabled:opacity-50"
          >
            <Download size={16} /> {exporting ? 'Saving…' : 'Export PDF'}
          </button>
          {note && <p role="status" className={cn('max-w-sm text-right text-xs', note.ok ? 'text-emerald-500' : 'text-red-500')}>{note.text}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Clients" value={report.clients.total.toLocaleString('en-GB')} />
        <Stat label="Deadlines overdue" value={report.deadlines.overdue.toLocaleString('en-GB')} warn={report.deadlines.overdue > 0}
          detail={`${report.deadlines.within30} due in 30 days`} />
        <Stat label="Owed" value={formatPence(report.money.outstanding_pence)} warn={report.money.overdue_pence > 0}
          detail={report.money.overdue_pence ? `${formatPence(report.money.overdue_pence)} overdue` : 'Nothing overdue'} />
        <Stat label="Tasks overdue" value={report.work.overdueTasks.toLocaleString('en-GB')} warn={report.work.overdueTasks > 0}
          detail={`${report.work.openTasks} open · ${report.work.openWip} jobs in progress`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card icon={<PieIcon size={18} className="text-aether" />} title="Deadlines: overdue and next 90 days">
          {work90.length ? (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={work90} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value">
                      {/* Each slice is announced with its figure: "VAT return: 4 deadlines". */}
                      {work90.map((d, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} aria-label={`${d.name}: ${d.value} deadline${d.value === 1 ? '' : 's'}`} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <table className="mt-3 w-full text-xs">
                <thead className="text-white/50"><tr><th className="py-1 text-left font-medium">Obligation</th><th className="py-1 text-right font-medium">Overdue</th><th className="py-1 text-right font-medium">30 days</th><th className="py-1 text-right font-medium">90 days</th></tr></thead>
                <tbody>
                  {report.deadlines.byType.map((d, i) => (
                    <tr key={d.type} className="border-t border-white/10">
                      <td className="py-1"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />{d.type}</td>
                      <td className={cn('py-1 text-right tabular-nums', d.overdue && 'text-red-500 font-semibold')}>{d.overdue}</td>
                      <td className="py-1 text-right tabular-nums">{d.within30}</td>
                      <td className="py-1 text-right tabular-nums">{d.within90}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <Empty text="No deadlines overdue or due in the next 90 days." />
          )}
        </Card>

        <Card icon={<Wallet size={18} className="text-aether" />} title="What clients owe, by days past due">
          {report.money.outstanding_pence > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aging}>
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v: number) => `£${v.toLocaleString('en-GB')}`} />
                  <Tooltip formatter={(v: number) => formatPence(Math.round(v * 100))} />
                  <Bar dataKey="pounds" radius={[4, 4, 0, 0]}>
                    {aging.map((_, i) => <Cell key={i} fill={i === 0 ? '#10b981' : i < 3 ? '#f59e0b' : '#ef4444'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty text="No client owes anything." />
          )}
          <p className="mt-3 text-xs text-white/50">
            Invoiced {formatPence(report.money.invoiced_pence)} · received {formatPence(report.money.received_pence)}
            {report.money.credit_pence ? ` · ${formatPence(report.money.credit_pence)} held as credit` : ''}
          </p>
        </Card>

        <Card icon={<Users size={18} className="text-aether" />} title="Clients by status">
          {report.clients.byStatus.length ? (
            <ul className="space-y-2">
              {report.clients.byStatus.map((s) => (
                <li key={s.label} className="text-xs">
                  <div className="flex justify-between"><span>{s.label}</span><span className="tabular-nums font-semibold">{s.count}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/10">
                    <div className="h-1.5 rounded-full bg-aether" style={{ width: `${(s.count / largestStatus) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No clients yet." />
          )}
        </Card>

        <Card icon={<AlertTriangle size={18} className="text-aether" />} title="Clients owing the most">
          {report.money.topOwing.length ? (
            <table className="w-full text-xs">
              <thead className="text-white/50"><tr><th className="py-1 text-left font-medium">Client</th><th className="py-1 text-right font-medium">Owed</th><th className="py-1 text-right font-medium">Overdue</th></tr></thead>
              <tbody>
                {report.money.topOwing.map((o) => (
                  <tr key={o.ref} className="border-t border-white/10">
                    <td className="py-1">{o.name} <span className="text-white/50">{o.ref}</span></td>
                    <td className="py-1 text-right tabular-nums">{formatPence(o.owed_pence)}</td>
                    <td className={cn('py-1 text-right tabular-nums', o.overdue_pence && 'text-red-500')}>{formatPence(o.overdue_pence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty text="No client owes anything." />
          )}
        </Card>
      </div>
    </div>
  )
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="font-bold text-sm uppercase tracking-wider text-white/50">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value, detail, warn = false }: { label: string; value: string; detail?: string; warn?: boolean }): React.JSX.Element {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 shadow-sm space-y-1">
      <p className="text-xs font-medium text-white/50 flex items-center gap-1.5"><BarChart3 size={12} />{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums', warn && 'text-red-500')}>{value}</p>
      {detail && <p className="text-[11px] text-white/50">{detail}</p>}
    </div>
  )
}

function Empty({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="h-40 flex flex-col items-center justify-center gap-3">
      <PieIcon size={36} strokeWidth={1} className="text-white/15" />
      <p className="text-sm text-white/50">{text}</p>
    </div>
  )
}
