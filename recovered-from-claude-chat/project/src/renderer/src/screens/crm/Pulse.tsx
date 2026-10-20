import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Activity, Bell, Building2, Database, HardDrive, KeyRound, RefreshCw } from 'lucide-react'
import type { AppNotification, ChChange, HealthTone, PulseDay, PulseHealth, PulseKind } from '@shared/types'
import { NotificationItem } from '@renderer/components/notifications/NotificationItem'
import { dayText, todayIso } from '@renderer/lib/dates'
import { openClient } from '@renderer/lib/open-client'
import { openTarget } from '@renderer/lib/targets'
import { useAuthStore } from '@renderer/stores/crm/auth'
import { useNotificationsStore } from '@renderer/stores/notifications'
import { useUiStore } from '@renderer/stores/ui'
import { usePulseTarget } from './data/target'
import { call, inputClass, Notice, Section, smallButton } from './references/ui'

const TONE_DOT: Record<HealthTone, string> = {
  ok: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
  attention: 'bg-amber-300',
  problem: 'bg-rose-400',
  off: 'bg-white/25'
}
const TONE_WORDS: Record<HealthTone, string> = { ok: 'Working', attention: 'Needs a look', problem: 'Needs attention now', off: 'Off' }

export const KIND_WORDS: Record<PulseKind, string> = {
  clients: 'Clients',
  compliance: 'Compliance',
  billing: 'Billing',
  communications: 'Communications',
  tasks: 'Tasks',
  documents: 'Documents',
  people: 'People and settings',
  imports: 'Imports',
  other: 'Other'
}

/** "09:41" for an audit time (SQLite UTC). */
const clock = (sqliteUtc: string): string => new Date(`${sqliteUtc.replace(' ', 'T')}Z`).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
/** Who did it; the app itself is "The app". */
export const whoText = (who: string | null): string => (!who || who === 'system' ? 'The app' : who)

function HealthTile({ icon, title, tone, text, action, testid }: { icon: ReactNode; title: string; tone: HealthTone; text: string; action?: ReactNode; testid?: string }): JSX.Element {
  return (
    <div className="flex min-h-[8.5rem] flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-4" data-testid={testid}>
      <div className="flex items-center gap-2 text-xs text-white/50">
        <span className="text-white/35" aria-hidden>{icon}</span>
        {title}
        <span className="ml-auto flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
          <span className="sr-only">{TONE_WORDS[tone]}</span>
        </span>
      </div>
      <p className="mt-2 flex-1 text-sm text-white/80">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

const linkButton = 'text-xs text-aether/90 hover:underline disabled:opacity-40'

/** When the next scheduled backup is due, in words; "due now" once that time has passed. */
export function nextBackupText(nextDue: string | null, now = new Date()): string {
  if (!nextDue) return ''
  const at = new Date(nextDue)
  if (Number.isNaN(at.getTime())) return ''
  return at.getTime() <= now.getTime()
    ? ' Next backup: due now.'
    : ` Next backup: ${at.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`
}

/** The app, the database, the licence, backups and Companies House at a glance. */
function Health({ canManage }: { canManage: boolean }): JSX.Element {
  const navigateTo = useUiStore((s) => s.navigateTo)
  const [health, setHealth] = useState<PulseHealth | null>(null)
  const [answeredIn, setAnsweredIn] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [checkNote, setCheckNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    const t = performance.now()
    await window.api.ping().catch(() => null)
    setAnsweredIn(Math.max(1, Math.round(performance.now() - t)))
    const h = await call(window.api.pulse.health(), setError)
    if (h) {
      setError(null)
      setHealth(h)
      setProgress(h.companiesHouse?.running ?? null)
    }
  }, [])

  useEffect(() => {
    void load()
    const off = window.api.pulse.onCompaniesHouseProgress((p) => {
      setProgress(p)
      if (!p) void load()
    })
    const every = setInterval(() => void load(), 60_000)
    return () => {
      off()
      clearInterval(every)
    }
  }, [load])

  const checkNow = async (): Promise<void> => {
    setCheckNote(null)
    const r = await call(window.api.pulse.syncCompaniesHouse(), setError)
    if (!r) return
    setCheckNote(r.started ? `Checking ${r.total} compan${r.total === 1 ? 'y' : 'ies'} at about one a second. Changes appear below as they’re found.` : r.reason)
    if (r.started) setProgress({ done: 0, total: r.total })
  }

  if (error) return <Notice tone="error">{error}</Notice>
  if (!health) return <div className="h-[8.5rem] animate-pulse rounded-2xl border border-white/5 bg-white/[0.02]" aria-busy="true" />
  const ch = health.companiesHouse
  return (
    <section aria-label="Health" className="space-y-2">
      <div className={`grid gap-3 sm:grid-cols-2 ${canManage ? 'xl:grid-cols-4' : 'xl:grid-cols-2'}`}>
        <HealthTile
          testid="health-app"
          icon={<Database size={14} />}
          title="This computer"
          tone={health.database.tone}
          text={`${health.database.text}${answeredIn !== null ? ` The app answered in ${answeredIn} ms.` : ''}`}
        />
        <HealthTile
          testid="health-licence"
          icon={<KeyRound size={14} />}
          title="Licence"
          tone={health.licence.tone}
          text={health.licence.text}
          action={<button type="button" className={linkButton} onClick={() => navigateTo('licence')}>Licence</button>}
        />
        {health.backups && (
          <HealthTile
            testid="health-backups"
            icon={<HardDrive size={14} />}
            title="Backups"
            tone={health.backups.tone}
            text={`${health.backups.text}${nextBackupText(health.backups.nextDue)}`}
            action={<button type="button" className={linkButton} onClick={() => navigateTo('settings')}>Backups in Settings</button>}
          />
        )}
        {ch && (
          <HealthTile
            testid="health-ch"
            icon={<Building2 size={14} />}
            title="Companies House"
            tone={ch.tone}
            text={`${progress ? `Checking ${progress.done} of ${progress.total} companies…` : ch.text}${ch.notFound ? ` ${ch.notFound} not found there: check their company numbers.` : ''}${ch.stream.on ? ` Stream: ${ch.stream.problem ?? `${ch.stream.connected} of ${ch.stream.streams} connected`}.` : ''}`}
            action={
              <div className="flex flex-wrap gap-3">
                {ch.apiKey && (
                  <button type="button" className={`${linkButton} inline-flex items-center gap-1`} disabled={!!progress} onClick={() => void checkNow()} data-testid="ch-check-now">
                    <RefreshCw size={11} className={progress ? 'animate-spin' : ''} aria-hidden /> {progress ? 'Checking…' : 'Check now'}
                  </button>
                )}
                <button type="button" className={linkButton} onClick={() => navigateTo('settings')}>
                  {ch.apiKey ? 'Settings' : 'Add the key in Settings'}
                </button>
              </div>
            }
          />
        )}
      </div>
      {checkNote && (
        <p role="status" className="text-xs text-white/55">
          {checkNote}
        </p>
      )}
    </section>
  )
}

/** The notifications waiting, with the three most pressing. */
function NeedsAttention(): JSX.Element {
  const { open, urgent, version } = useNotificationsStore()
  const navigateTo = useUiStore((s) => s.navigateTo)
  const [top, setTop] = useState<AppNotification[] | null>(null)
  const load = useCallback(async () => {
    const r = await window.api.notifications.list({ show: 'open', limit: 3 })
    if (r.ok) setTop(r.data)
  }, [])
  useEffect(() => {
    void load()
  }, [load, version])
  const done = async (n: AppNotification): Promise<void> => {
    await window.api.notifications.done([n.id])
    await load()
  }
  return (
    <Section
      title="Needs attention"
      description={open ? `${open} notification${open === 1 ? '' : 's'} waiting${urgent ? `, ${urgent} urgent` : ''}.` : 'Nothing waiting. New deadlines, Companies House changes, follow-ups and tasks appear here.'}
      actions={
        <button type="button" className={`${smallButton} flex items-center gap-1.5`} onClick={() => navigateTo('notifications')} data-testid="pulse-open-notifications">
          <Bell size={12} aria-hidden /> All notifications
        </button>
      }
    >
      {top && top.length > 0 && (
        <ul className="space-y-2">
          {top.map((n) => (
            <NotificationItem key={n.id} n={n} compact onOpen={(x) => openTarget(x.target)} onDone={(x) => void done(x)} />
          ))}
        </ul>
      )}
    </Section>
  )
}

/** Companies House changes for the person's clients: the last 14 days, live as they come in. */
function CompaniesHouseChanges(): JSX.Element {
  const target = usePulseTarget()
  const [focus, setFocus] = useState<string | null>(() => target.clientRef)
  const [redOnly, setRedOnly] = useState(false)
  const [rows, setRows] = useState<ChChange[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (target.clientRef === null) return
    setFocus(target.clientRef)
    target.focus(null)
  }, [target])

  const load = useCallback(async () => {
    const r = await call(window.api.pulse.changes({ days: 14, clientRef: focus ?? undefined, redFlagsOnly: redOnly || undefined }), setError)
    if (r) {
      setError(null)
      setRows(r)
    }
  }, [focus, redOnly])
  useEffect(() => {
    void load()
  }, [load])
  // New changes appear as they are found (the daily check or the stream).
  useEffect(
    () =>
      window.api.pulse.onCompaniesHouseChange((c) => {
        if ((focus && c.client_ref !== focus) || (redOnly && !c.red_flag)) return
        setRows((list) => (list && !list.some((x) => x.id === c.id) ? [c, ...list] : list))
      }),
    [focus, redOnly]
  )

  const focusName = focus ? rows?.find((r) => r.client_ref === focus)?.client_name ?? focus : null
  return (
    <Section
      title="Companies House changes"
      description={focus ? `For ${focusName}, in the last 14 days.` : 'For your clients, in the last 14 days: filings, officers, status and anything overdue there.'}
      actions={
        <div className="flex items-center gap-3">
          {focus && (
            <button type="button" className={linkButton} onClick={() => setFocus(null)}>
              Show every client
            </button>
          )}
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input type="checkbox" checked={redOnly} onChange={(e) => setRedOnly(e.target.checked)} className="accent-[#00f5e8]" />
            Red flags only
          </label>
        </div>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {rows === null ? (
        <p className="text-sm text-white/50" aria-busy="true">Loading changes…</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-sm text-white/45">{redOnly ? 'No red flags in the last 14 days.' : 'No changes found in the last 14 days.'}</p>
      ) : (
        <ul className="divide-y divide-white/5" data-testid="ch-changes">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5 text-sm">
              <span className="w-24 shrink-0 text-xs tabular-nums text-white/40">{dayText(c.published_at ?? c.found_at)}</span>
              <button
                type="button"
                className="w-56 shrink-0 truncate text-left text-white/80 hover:text-aether disabled:hover:text-white/80"
                disabled={c.client_id === null}
                onClick={() => c.client_id !== null && openClient({ id: c.client_id, ref: c.client_ref })}
                title={`Company ${c.company_number}`}
              >
                {c.client_name}
              </button>
              <span className={`min-w-0 flex-1 ${c.red_flag ? 'text-rose-200' : 'text-white/70'}`}>
                {c.red_flag && <span className="mr-2 rounded-full border border-rose-400/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-rose-200">Red flag</span>}
                {c.summary}
              </span>
              <span className="text-[11px] text-white/30">{c.source === 'stream' ? 'Stream' : 'Daily check'}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/** The day's changes from the audit log: who did what, to which client. */
function DayChanges({ canManage }: { canManage: boolean }): JSX.Element {
  const [day, setDay] = useState(todayIso())
  const [who, setWho] = useState<'everyone' | 'me'>('everyone')
  const [kind, setKind] = useState<PulseKind | 'all'>('all')
  const [data, setData] = useState<PulseDay | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await call(window.api.pulse.today({ day, who }), setError)
    if (r) {
      setError(null)
      setData(r)
    }
  }, [day, who])
  useEffect(() => {
    void load()
    if (day !== todayIso()) return
    const every = setInterval(() => void load(), 60_000)
    return () => clearInterval(every)
  }, [load, day])

  const items = useMemo(() => (data ? data.items.filter((i) => kind === 'all' || i.kind === kind) : []), [data, kind])
  const kinds = useMemo(() => (data ? (Object.entries(data.counts) as Array<[PulseKind, number]>).sort((a, b) => b[1] - a[1]) : []), [data])
  const yesterday = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return todayIso(d)
  })()
  const total = data ? Object.values(data.counts).reduce((s, n) => s + (n ?? 0), 0) : 0

  return (
    <Section
      title={day === todayIso() ? 'Today’s changes' : `Changes on ${dayText(day)}`}
      description={canManage ? 'Everything recorded in the audit log, newest first.' : 'What you changed, and changes to your clients, newest first.'}
      actions={
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" className={smallButton} aria-pressed={day === todayIso()} onClick={() => setDay(todayIso())}>Today</button>
          <button type="button" className={smallButton} aria-pressed={day === yesterday} onClick={() => setDay(yesterday)}>Yesterday</button>
          <input type="date" aria-label="Day" className={`${inputClass} w-40 py-1`} value={day} max={todayIso()} onChange={(e) => e.target.value && setDay(e.target.value)} />
          {canManage && (
            <select aria-label="Whose changes" className={`${inputClass} w-36 py-1`} value={who} onChange={(e) => setWho(e.target.value as 'everyone' | 'me')}>
              <option value="everyone">Everyone’s</option>
              <option value="me">Mine</option>
            </select>
          )}
        </div>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {data && kinds.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Kind of change">
          <button
            type="button"
            aria-pressed={kind === 'all'}
            onClick={() => setKind('all')}
            className={`rounded-full border px-3 py-1 text-xs ${kind === 'all' ? 'border-aether/50 bg-aether/10 text-aether' : 'border-white/10 text-white/55 hover:text-white/85'}`}
          >
            All <span className="tabular-nums text-white/40">{total}</span>
          </button>
          {kinds.map(([k, n]) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1 text-xs ${kind === k ? 'border-aether/50 bg-aether/10 text-aether' : 'border-white/10 text-white/55 hover:text-white/85'}`}
            >
              {KIND_WORDS[k]} <span className="tabular-nums text-white/40">{n}</span>
            </button>
          ))}
        </div>
      )}
      {data === null ? (
        <p className="text-sm text-white/50" aria-busy="true">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-sm text-white/45">Nothing recorded{day === todayIso() ? ' yet today' : ' that day'}.</p>
      ) : (
        <ul className="divide-y divide-white/5" data-testid="pulse-changes">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 text-sm">
              <span className="w-12 shrink-0 text-xs tabular-nums text-white/40">{clock(i.at)}</span>
              <span className="min-w-0 flex-1 text-white/80">{i.action}</span>
              {i.client_name && (
                <button
                  type="button"
                  className="max-w-[16rem] truncate text-xs text-white/60 hover:text-aether"
                  onClick={() => i.client_id !== null && openClient({ id: i.client_id, ref: i.client_ref })}
                >
                  {i.client_name}
                </button>
              )}
              <span className="w-32 truncate text-right text-xs text-white/40">{whoText(i.who)}</span>
            </li>
          ))}
        </ul>
      )}
      {data?.truncated && <p className="mt-2 text-xs text-white/40">Only the latest 500 are listed. The audit log holds them all.</p>}
    </Section>
  )
}

/**
 * Activity → Today (Pulse): how things stand — the app, the licence, backups
 * and Companies House — what needs attention, Companies House changes for the
 * practice's clients, and the day's changes. Staff see their own clients.
 */
export function Pulse(): JSX.Element {
  const role = useAuthStore((s) => s.user?.role)
  const canManage = role === 'partner' || role === 'manager'
  return (
    <div className="max-w-[96rem] space-y-6" data-testid="pulse-screen">
      <p className="flex items-center gap-2 text-sm text-white/50">
        <Activity size={14} aria-hidden /> {canManage ? 'The practice today.' : 'Your day, and your clients.'}
      </p>
      <Health canManage={canManage} />
      <div className="grid gap-6 2xl:grid-cols-[2fr_3fr]">
        <NeedsAttention />
        <CompaniesHouseChanges />
      </div>
      <DayChanges canManage={canManage} />
    </div>
  )
}
