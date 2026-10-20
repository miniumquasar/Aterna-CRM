import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ObligationType, OpenDeadline } from '@shared/types'
import { OBLIGATION_LABELS } from '@shared/types'
import { openClient } from '@renderer/lib/open-client'
import { todayIso } from '@renderer/lib/dates'
import { call, Notice, Section, smallButton } from './references/ui'

/** Short names for the busy cells; the day's list below gives the full ones. */
const SHORT: Record<ObligationType, string> = {
  confirmation_statement: 'Confirmation statement',
  annual_accounts: 'Accounts',
  ct600: 'CT600',
  ct_payment: 'CT payment',
  vat_return: 'VAT return',
  self_assessment: 'Self assessment',
  p11d: 'P11D',
  ae_redeclaration: 'Pension re-declaration',
  payroll_rti: 'Payroll RTI',
  cis_return: 'CIS return',
  other: 'Other'
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const PER_CELL = 3

const pad = (n: number): string => String(n).padStart(2, '0')
const isoOf = (y: number, m: number, d: number): string => `${y}-${pad(m + 1)}-${pad(d)}`
const daysIn = (y: number, m: number): number => new Date(y, m + 1, 0).getDate()
const parse = (iso: string): { y: number; m: number; d: number } => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1, d: Number(iso.slice(8, 10)) })
const shift = (iso: string, days: number): string => {
  const { y, m, d } = parse(iso)
  const t = new Date(y, m, d + days, 12)
  return isoOf(t.getFullYear(), t.getMonth(), t.getDate())
}
const between = (from: string, to: string): number => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

/** "October 2026". */
export const monthName = (y: number, m: number): string => new Date(y, m, 1, 12).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

/** "Tuesday 20 October 2026" (built in two parts: some versions of the date data put a comma after the weekday). */
export const longDay = (iso: string): string => {
  const { y, m, d } = parse(iso)
  const t = new Date(y, m, d, 12)
  return `${t.toLocaleDateString('en-GB', { weekday: 'long' })} ${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
}

/**
 * The weeks of a month, Monday first, as the UK reads a calendar: each a row
 * of seven dates (YYYY-MM-DD), null outside the month.
 */
export function monthWeeks(y: number, m: number): Array<Array<string | null>> {
  const lead = (new Date(y, m, 1, 12).getDay() + 6) % 7 // Monday = 0
  const cells: Array<string | null> = [...Array.from({ length: lead }, () => null), ...Array.from({ length: daysIn(y, m) }, (_, i) => isoOf(y, m, i + 1))]
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7))
}

/** How far ahead the open-deadline list must look to cover a month (overdue ones always come). */
export const daysToCover = (today: string, y: number, m: number): number => Math.min(3650, Math.max(0, between(today, isoOf(y, m, daysIn(y, m)))))

/** A day's deadlines as a button's name: "Tuesday 20 October 2026: 3 deadlines, 1 overdue". */
export function dayLabel(iso: string, items: readonly OpenDeadline[]): string {
  const late = items.filter((d) => d.days < 0).length
  if (!items.length) return longDay(iso)
  return `${longDay(iso)}: ${items.length} deadline${items.length === 1 ? '' : 's'}${late ? `, ${late} overdue` : ''}`
}

/**
 * Work → Calendar: the open deadlines month by month, from the same list as
 * Compliance → Deadlines and Home. Overdue ones stay on the day they were due,
 * marked. Arrow keys move between days, Page Up and Page Down between months;
 * Enter shows a day's deadlines below, each opening its client file.
 */
export function Calendar(): JSX.Element {
  const today = todayIso()
  const [month, setMonth] = useState(() => ({ y: parse(today).y, m: parse(today).m }))
  const [rows, setRows] = useState<OpenDeadline[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(today)
  const [chosen, setChosen] = useState<string | null>(today)
  const cells = useRef(new Map<string, HTMLButtonElement>())
  const ticket = useRef(0)

  const within = daysToCover(today, month.y, month.m)
  const load = useCallback(async () => {
    const mine = ++ticket.current
    setError(null)
    const r = await call(window.api.deadlines.list({ withinDays: within }), (m) => mine === ticket.current && setError(m))
    if (mine === ticket.current && r) setRows(r)
  }, [within])
  useEffect(() => {
    void load()
  }, [load])

  const weeks = useMemo(() => monthWeeks(month.y, month.m), [month])
  const byDay = useMemo(() => {
    const map = new Map<string, OpenDeadline[]>()
    for (const d of rows ?? []) map.set(d.due_date, [...(map.get(d.due_date) ?? []), d])
    return map
  }, [rows])
  const inMonth = (rows ?? []).filter((d) => d.due_date.slice(0, 7) === `${month.y}-${pad(month.m + 1)}`)
  const lateInMonth = inMonth.filter((d) => d.days < 0).length

  const goToMonth = (y: number, m: number, focusDay?: string): void => {
    const t = new Date(y, m, 1, 12)
    setMonth({ y: t.getFullYear(), m: t.getMonth() })
    const day = focusDay ?? isoOf(t.getFullYear(), t.getMonth(), Math.min(parse(focused).d, daysIn(t.getFullYear(), t.getMonth())))
    setFocused(day)
  }
  const moveFocus = (iso: string): void => {
    const { y, m } = parse(iso)
    if (y !== month.y || m !== month.m) {
      // Another month: its days exist once it has drawn.
      goToMonth(y, m, iso)
      requestAnimationFrame(() => cells.current.get(iso)?.focus())
    } else {
      // This month: move at once, so keys pressed in quick succession each start from the right day.
      setFocused(iso)
      cells.current.get(iso)?.focus()
    }
  }
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, iso: string): void => {
    const weekday = (new Date(parse(iso).y, parse(iso).m, parse(iso).d, 12).getDay() + 6) % 7
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday }
    if (e.key in steps) {
      e.preventDefault()
      moveFocus(shift(iso, steps[e.key]))
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      const { y, m, d } = parse(iso)
      const t = new Date(y, m + (e.key === 'PageUp' ? -1 : 1), 1, 12)
      moveFocus(isoOf(t.getFullYear(), t.getMonth(), Math.min(d, daysIn(t.getFullYear(), t.getMonth()))))
    }
  }

  const chosenItems = chosen ? (byDay.get(chosen) ?? []) : []

  return (
    <div className="mx-auto max-w-[96rem] space-y-6" data-testid="calendar-screen">
      <p className="max-w-prose text-sm text-white/60">
        Open deadlines by the day they fall due, from the same list as Compliance → Deadlines. Overdue ones stay on the day they were due, marked.
      </p>
      {error && <Notice tone="error">{error}</Notice>}

      <Section
        title={monthName(month.y, month.m)}
        description={rows === null ? 'Reading the deadlines…' : inMonth.length ? `${inMonth.length} deadline${inMonth.length === 1 ? '' : 's'} this month${lateInMonth ? `, ${lateInMonth} of them overdue` : ''}.` : 'Nothing open falls due this month.'}
        actions={
          <div className="flex items-center gap-1.5">
            <button type="button" className={smallButton} onClick={() => goToMonth(month.y, month.m - 1)} aria-label="Previous month" data-testid="calendar-previous">
              <ChevronLeft size={14} aria-hidden />
            </button>
            <button
              type="button"
              className={smallButton}
              onClick={() => {
                goToMonth(parse(today).y, parse(today).m, today)
                setChosen(today)
              }}
            >
              Today
            </button>
            <button type="button" className={smallButton} onClick={() => goToMonth(month.y, month.m + 1)} aria-label="Next month" data-testid="calendar-next">
              <ChevronRight size={14} aria-hidden />
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] table-fixed border-separate border-spacing-1" aria-label={`Deadlines in ${monthName(month.y, month.m)}`} aria-busy={rows === null}>
            <thead>
              <tr>
                {WEEKDAYS.map((d) => (
                  <th key={d} scope="col" className="pb-1 text-left text-xs font-normal text-white/55">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, w) => (
                <tr key={w}>
                  {week.map((iso, i) => {
                    if (!iso) return <td key={i} className="h-28 rounded-xl bg-white/[0.01]" />
                    const items = byDay.get(iso) ?? []
                    const late = items.some((d) => d.days < 0)
                    const isToday = iso === today
                    const isChosen = iso === chosen
                    return (
                      <td key={iso} className="h-28 align-top">
                        <button
                          type="button"
                          ref={(el) => {
                            if (el) cells.current.set(iso, el)
                            else cells.current.delete(iso)
                          }}
                          tabIndex={iso === focused ? 0 : -1}
                          aria-label={dayLabel(iso, items)}
                          aria-pressed={isChosen}
                          onClick={() => {
                            setFocused(iso)
                            setChosen(iso)
                          }}
                          onKeyDown={(e) => onKey(e, iso)}
                          className={`flex h-full w-full flex-col items-stretch gap-1 rounded-xl border p-2 text-left transition-colors ${
                            isChosen ? 'border-aether/50 bg-aether/[0.07]' : items.length ? 'border-white/10 bg-white/[0.03] hover:border-white/25' : 'border-white/5 bg-white/[0.015] hover:border-white/15'
                          }`}
                          data-testid={`calendar-day-${iso}`}
                        >
                          <span className="flex items-center justify-between">
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums ${isToday ? 'bg-aether font-medium text-black' : 'text-white/70'}`}>
                              {parse(iso).d}
                            </span>
                            {late && <AlertTriangle size={12} className="text-rose-300" aria-hidden />}
                          </span>
                          {items.slice(0, PER_CELL).map((d) => (
                            <span key={d.key} className={`truncate text-[11px] leading-snug ${d.days < 0 ? 'text-rose-200' : 'text-white/75'}`} aria-hidden>
                              {d.client_name}: {SHORT[d.obligation]}
                            </span>
                          ))}
                          {items.length > PER_CELL && (
                            <span className="text-[11px] text-white/60" aria-hidden>
                              {items.length - PER_CELL} more
                            </span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-white/55">Arrow keys move between days; Page Up and Page Down change the month; Enter shows the day below.</p>
      </Section>

      {chosen && (
        <Section title={longDay(chosen)} description={chosenItems.length ? undefined : 'No open deadline falls due on this day.'}>
          {chosenItems.length > 0 && (
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10" data-testid="calendar-day-list" aria-live="polite">
              {chosenItems.map((d) => (
                <li key={d.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="text-white/90">{d.client_name}</span>
                    <span className="ml-2 text-white/70">{OBLIGATION_LABELS[d.obligation]}</span>
                    <span className={`ml-2 inline-flex items-center gap-1 text-xs ${d.days < 0 ? 'text-rose-200' : 'text-white/60'}`}>
                      {d.days < 0 && <AlertTriangle size={11} aria-hidden />}
                      {d.days < 0 ? `${-d.days} day${d.days === -1 ? '' : 's'} overdue` : d.days === 0 ? 'Due today' : `In ${d.days} day${d.days === 1 ? '' : 's'}`}
                    </span>
                    <span className="ml-2 text-xs text-white/55">{d.person ?? 'Nobody yet'}</span>
                  </span>
                  {d.client_ref && (
                    <button type="button" className={smallButton} onClick={() => openClient({ id: d.client_id, ref: d.client_ref })} aria-label={`Open ${d.client_name}’s client file`}>
                      Open the client file
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  )
}
