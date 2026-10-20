/**
 * Forecast (Oracle): where the work falls in the months ahead, and the money
 * with it — deadlines by month, by kind of work and by person; tasks and work
 * in progress; the billing the recorded fees add up to; money received and
 * falling due; and, on request, a briefing from the assistant on this
 * computer. One row of choices at the top (whose work, how many months)
 * scopes everything below it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CalendarRange } from 'lucide-react'
import type { Forecast, ForecastNoteCode, ForecastWhose } from '@shared/types'
import { formatPence } from '@shared/money'
import { AssistantBriefing } from '@renderer/components/assistant/AssistantPanels'
import { ColumnChart, FiguresTable, FiguresToggle, HeatTable, type ColumnDatum, type HeatRow } from '@renderer/components/charts/Charts'
import { compactPounds, niceMax } from '@renderer/components/charts/scale'
import { useAuthStore } from '@renderer/stores/crm/auth'
import { useUiStore } from '@renderer/stores/ui'
import type { NavRoute } from '@renderer/navigation/routes'
import { call, inputClass, Notice, smallButton } from './references/ui'

const MONTH_CHOICES = [3, 6, 12] as const
type Months = (typeof MONTH_CHOICES)[number]

const count = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

/** The choices in "Whose": staff narrow within their own clients; partners and managers pick anyone. */
export function whoseOptions(role: 'partner' | 'manager' | 'staff' | undefined, me: string | null, people: readonly string[]): Array<{ value: ForecastWhose; label: string }> {
  if (role === 'staff') return [{ value: 'everyone', label: 'All my clients' }, { value: 'mine', label: 'Assigned to me' }]
  const others = people.filter((p) => p.toLowerCase() !== (me ?? '').toLowerCase())
  return [
    { value: 'everyone', label: 'Everyone’s' },
    ...(me ? [{ value: 'mine' as const, label: `Mine (${me})` }] : []),
    { value: 'nobody', label: 'Nobody’s yet' },
    ...others.map((p) => ({ value: `person:${p}` as ForecastWhose, label: p }))
  ]
}

/** The four figures at the top. */
export function headline(f: Forecast): Array<{ key: string; label: string; value: string; detail: string; alert?: boolean; quiet?: boolean }> {
  const w = f.workload
  const ahead = sum(w.byMonth)
  const span = f.months.length === 1 ? 'this month' : `the next ${f.months.length} months`
  return [
    {
      key: 'overdue',
      label: 'Overdue now',
      value: w.overdue.toLocaleString('en-GB'),
      detail: w.overdue ? `The oldest is ${count(w.oldestOverdueDays, 'day')} late.` : 'Nothing is overdue.',
      alert: w.overdue > 0,
      quiet: w.overdue === 0
    },
    {
      key: 'ahead',
      label: `Due in ${span}`,
      value: ahead.toLocaleString('en-GB'),
      detail: ahead ? `Across ${count(w.byObligation.filter((o) => sum(o.byMonth) > 0).length, 'kind')} of work.` : 'No deadlines fall due.',
      quiet: ahead === 0
    },
    {
      key: 'busiest',
      label: 'Busiest month',
      value: w.busiest ? w.busiest.label : 'None',
      detail: w.busiest ? `${count(w.busiest.count, 'deadline')} fall due.` : 'Nothing falls due in these months.',
      quiet: !w.busiest
    },
    f.cash.invoices
      ? {
          key: 'owed',
          label: 'Owed to the practice',
          value: formatPence(f.cash.owedPence, { whole: true }),
          detail: f.cash.overduePence ? `${formatPence(f.cash.overduePence, { whole: true })} of it overdue.` : 'Nothing overdue.',
          alert: f.cash.overduePence > 0
        }
      : { key: 'owed', label: 'Owed to the practice', value: 'None recorded', detail: 'No invoices yet.', quiet: true }
  ]
}

/** Rows for the "what falls due" heat table: every kind of work with a deadline in view. */
export const obligationRows = (f: Forecast): HeatRow[] =>
  f.workload.byObligation.map((o) => ({ key: o.obligation, label: o.label, overdue: o.overdue, byMonth: o.byMonth, total: o.total }))

/** Rows for "who has what": each person, and nobody's last. */
export const personRows = (f: Forecast): HeatRow[] =>
  f.workload.byPerson.map((p) => ({ key: p.person ?? '(nobody)', label: p.person ?? 'Nobody yet', overdue: p.overdue, byMonth: p.byMonth, total: p.total }))

const monthData = (f: Forecast, values: readonly number[]): ColumnDatum[] => f.months.map((m, i) => ({ key: m.key, label: m.label, value: values[i] ?? 0 }))

function Tile({ label, value, detail, alert, quiet }: { label: string; value: string; detail: string; alert?: boolean; quiet?: boolean }): JSX.Element {
  return (
    <div className="flex min-h-[7.5rem] flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <span className="flex items-center gap-1.5 text-xs text-white/50">
        {alert && <AlertTriangle size={12} className="text-rose-300" aria-hidden />}
        {label}
      </span>
      <span className={`mt-1.5 text-2xl font-medium ${alert ? 'text-rose-200' : quiet ? 'text-white/45' : 'text-white/90'}`}>{value}</span>
      <span className="mt-auto pt-1 text-xs text-white/50">{detail}</span>
    </div>
  )
}

function Panel({ title, description, children, testid }: { title: string; description?: string; children: ReactNode; testid?: string }): JSX.Element {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-label={title} data-testid={testid}>
      <h2 className="text-sm font-medium text-white/85">{title}</h2>
      {description && <p className="mt-1 max-w-prose text-xs text-white/50">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** A gap in the records, with the way to fill it. */
function Gap({ text, action, route }: { text: string; action: string; route: NavRoute }): JSX.Element {
  const navigateTo = useUiStore((s) => s.navigateTo)
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <p className="max-w-prose flex-1 text-sm text-white/65">{text}</p>
      <button type="button" className={smallButton} onClick={() => navigateTo(route)}>
        {action}
      </button>
    </div>
  )
}

export function Oracle(): JSX.Element {
  const me = useAuthStore((s) => s.user)
  const [whose, setWhose] = useState<ForecastWhose>('everyone')
  const [months, setMonths] = useState<Months>(12)
  const [f, setF] = useState<Forecast | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Only the latest choice's figures are shown, however the answers arrive.
  const latest = useRef(0)

  const load = useCallback(async () => {
    const ticket = ++latest.current
    setLoading(true)
    const r = await call(window.api.forecast.get({ whose, months }), (m) => ticket === latest.current && setError(m))
    if (ticket !== latest.current) return
    if (r) {
      setF(r)
      setError(null)
    }
    setLoading(false)
  }, [whose, months])

  useEffect(() => {
    void load()
  }, [load])

  const note = useCallback((code: ForecastNoteCode): string | null => f?.notes.find((n) => n.code === code)?.text ?? null, [f])
  const options = useMemo(() => whoseOptions(me?.role, me?.name ?? null, f?.people ?? []), [me, f?.people])

  if (error && !f) {
    return (
      <div className="space-y-3">
        <Notice tone="error">{error}</Notice>
        <button type="button" className={smallButton} onClick={() => void load()}>
          Try again
        </button>
      </div>
    )
  }
  if (!f) return <p className="text-sm text-white/50" aria-busy="true">Working out the months ahead…</p>

  const w = f.workload
  const named = w.byPerson.some((p) => p.person !== null)
  const tasksAhead = sum(w.tasks.byMonth)
  const openTasks = w.tasks.overdue + w.tasks.undated + tasksAhead
  const feesAhead = sum(f.fees.byMonth)
  const received = f.cash.received.map((r) => ({ key: r.key, label: r.label, value: r.pence }))
  const due = monthData(f, f.cash.expectedByMonth)
  // The two money charts are read side by side, so they share one scale.
  const cashTop = Math.max(0, ...received.map((r) => r.value), ...due.map((d) => d.value))

  return (
    <div className="max-w-[96rem] space-y-6" data-testid="oracle-screen">
      <p className="flex max-w-prose items-center gap-2 text-sm text-white/50">
        <CalendarRange size={14} aria-hidden />
        {f.scope === 'own' ? 'Your clients’ months ahead: deadlines, tasks and money owed.' : 'Where the work falls in the months ahead, and the money with it, from the deadlines, tasks, fees and invoices in the app.'}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-60 flex-col gap-1">
          <span className="text-xs text-white/55">Whose work</span>
          <select className={inputClass} value={whose} onChange={(e) => setWhose(e.target.value as ForecastWhose)} data-testid="oracle-whose">
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-white/55" id="oracle-months-label">Months ahead</span>
          <div className="flex gap-1" role="group" aria-labelledby="oracle-months-label">
            {MONTH_CHOICES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={months === m}
                onClick={() => setMonths(m)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${months === m ? 'border-aether/50 bg-aether/[0.08] text-aether' : 'border-white/10 text-white/60 hover:border-white/20 hover:text-white/85'}`}
                data-testid={`oracle-months-${m}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        {error && <span className="pb-2 text-xs text-rose-300">{error}</span>}
      </div>

      {/* While new figures load, the old ones stay, dimmed: no jump, no flash. */}
      <div className={`space-y-6 transition-opacity duration-200 ${loading ? 'opacity-60' : 'opacity-100'}`} aria-busy={loading}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="oracle-headline">
          {headline(f).map(({ key, ...t }) => (
            <Tile key={key} {...t} />
          ))}
        </div>

        <Panel title="Deadlines falling due, by month" description="Open deadlines in the month they fall due. Those already overdue are counted above, not here." testid="oracle-deadlines">
          {sum(w.byMonth) ? (
            <>
              <ColumnChart data={monthData(f, w.byMonth)} format={(v) => v.toLocaleString('en-GB')} unit={(v) => (v === 1 ? 'deadline' : 'deadlines')} label={`Deadlines falling due in each of the next ${f.months.length} months`} testid="oracle-deadlines-chart" />
              <FiguresToggle>
                <FiguresTable head={['Month', 'Deadlines']} rows={f.months.map((m, i) => [m.label, w.byMonth[i].toLocaleString('en-GB')])} />
              </FiguresToggle>
            </>
          ) : (
            <Notice>No deadlines fall due in these months.</Notice>
          )}
        </Panel>

        {w.byObligation.length > 0 && (
          <Panel title="What falls due, by kind of work" description="Each cell is how many fall due that month: the lighter the cell, the more. Overdue ones sit in their own column." testid="oracle-kinds">
            <HeatTable rows={obligationRows(f)} months={f.months} rowHeader="Kind of work" caption="Deadlines by kind of work and month" testid="oracle-kinds-table" />
          </Panel>
        )}

        {f.scope === 'practice' && (
          <Panel title="Who has what, by month" description="Deadlines by the person they’re with: the client’s person unless the deadline has its own." testid="oracle-people">
            {named ? (
              <HeatTable rows={personRows(f)} months={f.months} rowHeader="Person" caption="Deadlines by person and month" testid="oracle-people-table" />
            ) : w.byPerson.length ? (
              <Gap text={note('unassigned') ?? 'None of these deadlines is assigned to anyone yet.'} action="Open Clients" route="clients" />
            ) : (
              <Notice>No deadlines in view for this choice.</Notice>
            )}
          </Panel>
        )}

        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Tasks" description={f.scope === 'own' ? 'Open tasks for your clients, and tasks given to you.' : 'Open tasks, by when they’re due.'} testid="oracle-tasks">
            {openTasks ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                {[
                  ['Overdue', w.tasks.overdue, w.tasks.overdue > 0],
                  ['Due this month', w.tasks.byMonth[0] ?? 0, false],
                  ['Due later', tasksAhead - (w.tasks.byMonth[0] ?? 0), false],
                  ['No due date', w.tasks.undated, false]
                ].map(([label, n, alert]) => (
                  <div key={String(label)}>
                    <dt className="text-xs text-white/50">{label}</dt>
                    <dd className={`text-lg ${alert ? 'text-rose-200' : n ? 'text-white/90' : 'text-white/40'}`}>{Number(n).toLocaleString('en-GB')}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <Notice>No open tasks.</Notice>
            )}
          </Panel>

          <Panel title="Work in progress" description="Open jobs by the person doing them: late ones are past their deadline." testid="oracle-wip">
            {w.wip.length ? (
              <table className="w-full text-sm">
                <thead className="text-xs text-white/50">
                  <tr>
                    <th scope="col" className="py-1 text-left font-medium">Person</th>
                    <th scope="col" className="py-1 text-right font-medium">Open</th>
                    <th scope="col" className="py-1 text-right font-medium">Late</th>
                    <th scope="col" className="py-1 text-right font-medium">Due this month</th>
                  </tr>
                </thead>
                <tbody>
                  {w.wip.map((j) => (
                    <tr key={j.person ?? '(nobody)'} className="border-t border-white/5">
                      <th scope="row" className="py-1.5 text-left font-normal text-white/80">{j.person ?? 'Nobody yet'}</th>
                      <td className="py-1.5 text-right tabular-nums text-white/85">{j.open}</td>
                      <td className={`py-1.5 text-right tabular-nums ${j.late ? 'text-rose-200' : 'text-white/40'}`}>{j.late}</td>
                      <td className="py-1.5 text-right tabular-nums text-white/70">{j.dueThisMonth}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Notice>No work in progress is open.</Notice>
            )}
          </Panel>
        </div>

        <Panel title="Billing expected, by month" description="What the fees recorded on clients’ services add up to in each month, by how often each is billed." testid="oracle-fees">
          {f.fees.clientsWithFees === 0 ? (
            <Gap text={note('no_fees') ?? 'No fees are recorded yet.'} action="Open Clients" route="clients" />
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-white/70">
                Recurring fees come to {formatPence(f.fees.annualPence, { whole: true })} a year from {count(f.fees.clientsWithFees, 'client')}; {count(f.fees.clientsWithout, 'live client')} {f.fees.clientsWithout === 1 ? 'has' : 'have'} no fee recorded.
                {f.fees.oneOffPence ? ` One-off fees in these months: ${formatPence(f.fees.oneOffPence, { whole: true })}.` : ''}
              </p>
              {feesAhead > 0 && (
                <>
                  <ColumnChart data={monthData(f, f.fees.byMonth)} format={(v) => formatPence(v, { whole: true })} axisFormat={compactPounds} label="Billing expected in each month" testid="oracle-fees-chart" />
                  <FiguresToggle>
                    <FiguresTable head={['Month', 'Expected']} rows={f.months.map((m, i) => [m.label, formatPence(f.fees.byMonth[i])])} />
                  </FiguresToggle>
                </>
              )}
              {f.fees.spreadEvenly > 0 && (
                <p className="text-xs text-white/45">
                  {count(f.fees.spreadEvenly, 'fee')} {f.fees.spreadEvenly === 1 ? 'has' : 'have'} no next date, so {f.fees.spreadEvenly === 1 ? 'it is' : 'they are'} spread evenly over the year.
                </p>
              )}
              {note('unscheduled_fees') && <p className="text-xs text-white/45">{note('unscheduled_fees')}</p>}
            </div>
          )}
        </Panel>

        <Panel title="Money in" description="What was received in each month so far, and what invoices still owe by the month they fall due. Both charts use the same scale." testid="oracle-cash">
          {f.cash.invoices === 0 ? (
            <Gap text={note('no_invoices') ?? 'No invoices yet.'} action="Open Billing" route="payments" />
          ) : (
            <div className="space-y-5">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                {[
                  ['Owed now', formatPence(f.cash.owedPence), false],
                  ['Of it overdue', formatPence(f.cash.overduePence), f.cash.overduePence > 0],
                  ['Held as credit', formatPence(f.cash.creditPence), false],
                  ['Owed with no due date', formatPence(f.cash.undatedPence), false]
                ].map(([label, value, alert]) => (
                  <div key={String(label)}>
                    <dt className="flex items-center gap-1 text-xs text-white/50">
                      {alert ? <AlertTriangle size={11} className="text-rose-300" aria-hidden /> : null}
                      {label}
                    </dt>
                    <dd className={`text-lg ${alert ? 'text-rose-200' : 'text-white/90'}`}>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="text-xs text-white/60">Received, by month</h3>
                  <ColumnChart data={received} format={(v) => formatPence(v, { whole: true })} axisFormat={compactPounds} max={niceMax(Math.max(cashTop, 100))} label="Money received in each of the past months" height={200} testid="oracle-received-chart" />
                  <FiguresToggle>
                    <FiguresTable head={['Month', 'Received']} rows={received.map((r) => [r.label, formatPence(r.value)])} />
                  </FiguresToggle>
                </div>
                <div>
                  <h3 className="text-xs text-white/60">Falling due, by month</h3>
                  <ColumnChart data={due} format={(v) => formatPence(v, { whole: true })} axisFormat={compactPounds} max={niceMax(Math.max(cashTop, 100))} label="Money owed on invoices, by the month it falls due" height={200} testid="oracle-due-chart" />
                  <FiguresToggle>
                    <FiguresTable head={['Month', 'Falling due']} rows={due.map((d) => [d.label, formatPence(d.value)])} />
                  </FiguresToggle>
                </div>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Briefing from the assistant" testid="oracle-briefing">
          <AssistantBriefing
            request={{ kind: 'forecast', query: { whose, months } }}
            intro="A short briefing on these figures, written by the assistant on this computer: where the pressure falls, what is overdue, and the money. It is given the figures on this screen and nothing else."
            testid="oracle-briefing"
          />
        </Panel>
      </div>
    </div>
  )
}
