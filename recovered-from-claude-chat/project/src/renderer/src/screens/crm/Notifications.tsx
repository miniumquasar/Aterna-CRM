import { useCallback, useEffect, useMemo, useState } from 'react'
import { BellOff } from 'lucide-react'
import type { AppNotification, NotificationKind } from '@shared/types'
import { NotificationItem } from '@renderer/components/notifications/NotificationItem'
import { dayText } from '@renderer/lib/dates'
import { openTarget } from '@renderer/lib/targets'
import { useNotificationsStore } from '@renderer/stores/notifications'
import { call, Notice, smallButton } from './references/ui'

type Show = 'open' | 'done'
type KindFilter = 'all' | NotificationKind | 'practice'

const KIND_FILTERS: ReadonlyArray<{ value: KindFilter; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: 'deadline', label: 'Deadlines' },
  { value: 'companies_house', label: 'Companies House' },
  { value: 'follow_up', label: 'Follow-ups' },
  { value: 'task', label: 'Tasks' },
  { value: 'practice', label: 'Backups and licence' }
]

const matches = (n: AppNotification, f: KindFilter): boolean => f === 'all' || (f === 'practice' ? n.kind === 'backup' || n.kind === 'licence' : n.kind === f)

/** "No … notifications need attention." for each choice of kind. */
const NONE_OF: Record<Exclude<KindFilter, 'all'>, string> = {
  deadline: 'deadline',
  companies_house: 'Companies House',
  follow_up: 'follow-up',
  task: 'task',
  backup: 'backup',
  licence: 'licence',
  practice: 'backup or licence'
}

/** "Today", "Yesterday", or the date, for grouping by when something happened. */
function dayLabel(sqliteUtc: string, now = new Date()): string {
  const d = new Date(`${sqliteUtc.replace(' ', 'T')}Z`)
  const start = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(now) - start(d)) / 86_400_000)
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : dayText(sqliteUtc)
}

/**
 * The list in groups, each heading once. Open: the urgent ones first, then the
 * rest by the day they came, newest first. Done: by the day they were done.
 */
export function groupNotifications(items: readonly AppNotification[], show: 'open' | 'done', now = new Date()): Array<{ label: string; items: AppNotification[] }> {
  const out: Array<{ label: string; items: AppNotification[] }> = []
  const urgent = show === 'open' ? items.filter((n) => n.severity === 'urgent') : []
  if (urgent.length) out.push({ label: 'Urgent', items: urgent })
  const byDay = new Map<string, AppNotification[]>()
  for (const n of items) {
    if (show === 'open' && n.severity === 'urgent') continue
    const label = dayLabel(show === 'open' ? n.created_at : (n.done_at ?? n.created_at), now)
    const list = byDay.get(label)
    if (list) list.push(n)
    else byDay.set(label, [n])
  }
  for (const [label, list] of byDay) out.push({ label, items: list })
  return out
}

/**
 * Activity → Notifications: everything this person has been told — deadlines,
 * Companies House changes, follow-ups, tasks, and for partners and managers the
 * backups and licence — to work through. Open goes where it points; Done takes
 * it off the list. The app marks a notification done itself when what it was
 * about is dealt with (a deadline filed, a task completed).
 */
export function Notifications(): JSX.Element {
  const { open, urgent, version } = useNotificationsStore()
  const [show, setShow] = useState<Show>('open')
  const [kind, setKind] = useState<KindFilter>('all')
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await call(window.api.notifications.list({ show, limit: 500 }), setError)
    if (r) {
      setError(null)
      setItems(r)
    }
  }, [show])

  // Up to date when the screen opens, then whenever notifications change.
  useEffect(() => {
    void window.api.notifications.refresh().catch(() => null)
  }, [])
  useEffect(() => {
    void load()
  }, [load, version])

  const shown = useMemo(() => (items ?? []).filter((n) => matches(n, kind)), [items, kind])
  const groups = useMemo(() => groupNotifications(shown, show), [shown, show])

  const done = async (ids: number[] | 'all'): Promise<void> => {
    const r = await call(window.api.notifications.done(ids), setError)
    if (r) setNote(r.done === 1 ? 'Marked done.' : `${r.done} marked done.`)
    await load()
  }
  const reopen = async (n: AppNotification): Promise<void> => {
    if (await call(window.api.notifications.reopen(n.id), setError) !== null) setNote('Back on your list.')
    await load()
  }

  const allDone = (): void => {
    const ids = shown.map((n) => n.id)
    if (!ids.length) return
    if (!window.confirm(kind === 'all' ? `Mark all ${ids.length} notifications done?` : `Mark these ${ids.length} notifications done?`)) return
    void done(kind === 'all' ? 'all' : ids)
  }

  return (
    <div className="max-w-4xl space-y-5" data-testid="notifications-screen">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div role="tablist" aria-label="Which notifications" className="flex gap-1 rounded-xl border border-white/10 p-1">
          {(['open', 'done'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={show === s}
              onClick={() => {
                setNote(null)
                setItems(null)
                setShow(s)
              }}
              className={`rounded-lg px-3 py-1.5 text-sm ${show === s ? 'bg-aether/15 text-aether' : 'text-white/55 hover:text-white/85'}`}
              data-testid={`notifications-${s}`}
            >
              {s === 'open' ? `Needs attention${open ? ` (${open})` : ''}` : 'Done'}
            </button>
          ))}
        </div>
        {show === 'open' && shown.length > 0 && (
          <button type="button" className={smallButton} onClick={allDone} data-testid="notifications-all-done">
            Mark {kind === 'all' ? 'all' : 'these'} done
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind">
        {KIND_FILTERS.map((f) => {
          const count = (items ?? []).filter((n) => matches(n, f.value)).length
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={kind === f.value}
              onClick={() => setKind(f.value)}
              className={`rounded-full border px-3 py-1 text-xs ${kind === f.value ? 'border-aether/50 bg-aether/10 text-aether' : 'border-white/10 text-white/55 hover:text-white/85'}`}
            >
              {f.label}
              {items && f.value !== 'all' && count > 0 ? <span className="ml-1 tabular-nums text-white/40">{count}</span> : null}
            </button>
          )
        })}
      </div>

      {show === 'open' && urgent > 0 && <p className="text-sm text-rose-200/90">{urgent} urgent: overdue, a red flag at Companies House, or something wrong with backups or the licence.</p>}
      {note && (
        <p role="status" className="text-sm text-emerald-200/90">
          {note}
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {items === null ? (
        <p className="text-sm text-white/50" aria-busy="true">
          Loading notifications…
        </p>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center">
          <BellOff size={22} className="text-white/25" aria-hidden />
          <p className="text-sm text-white/60">
            {show === 'open' ? (kind === 'all' ? 'Nothing needs your attention.' : `No ${NONE_OF[kind]} notifications need attention.`) : 'Nothing marked done in the last 90 days.'}
          </p>
          {show === 'open' && <p className="max-w-md text-xs text-white/40">Deadlines, Companies House changes, follow-ups and tasks appear here as they come up, with a note on the bell.</p>}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h2 className="mb-2 text-xs uppercase tracking-[0.15em] text-white/35">{g.label}</h2>
              <ul className="space-y-2">
                {g.items.map((n) => (
                  <NotificationItem key={n.id} n={n} onOpen={(x) => openTarget(x.target)} onDone={(x) => void done([x.id])} onReopen={(x) => void reopen(x)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
