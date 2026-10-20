import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, CheckSquare, Clock, PoundSterling, Search, TriangleAlert, Upload, UserPlus, Users } from 'lucide-react'
import type { DashboardStats } from '@shared/types'
import { formatPence } from '@shared/money'
import { GlassCard } from '@aether/primitives/GlassCard'
import { EASE_PREMIUM } from '@aether/constants'
import { useAuthStore } from '@renderer/stores/crm/auth'
import { useUiStore } from '@renderer/stores/ui'
import { useLicence } from '@renderer/hooks/useLicence'
import { useMotionLevel } from '@renderer/lib/motion'
import { openClient } from '@renderer/lib/open-client'
import { useClientListTarget } from '@renderer/screens/crm/data/target'

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)
export const GO_TO_KEYS = isMac ? '⌘K' : 'Ctrl K'

function greeting(now: Date): string {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

const longToday = (now: Date): string => now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const shortDate = (iso: string): string => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** "in 3 days", "today", "tomorrow". */
function dueIn(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

/** "5 minutes ago" from an audit time (SQLite UTC, "YYYY-MM-DD HH:MM:SS"). */
export function ago(sqliteUtc: string, now = Date.now()): string {
  const t = Date.parse(`${sqliteUtc.replace(' ', 'T')}${/Z|[+-]\d\d:?\d\d$/.test(sqliteUtc) ? '' : 'Z'}`)
  if (Number.isNaN(t)) return ''
  const mins = Math.max(0, Math.round((now - t) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

function Figure({ icon, label, value, detail, tone = 'normal', onClick, testid }: {
  icon: ReactNode
  label: string
  value: string
  detail?: string
  tone?: 'normal' | 'alert' | 'quiet'
  onClick?: () => void
  testid?: string
}): JSX.Element {
  const colour = tone === 'alert' ? 'text-rose-300' : tone === 'quiet' ? 'text-white/45' : 'text-white/90'
  const body = (
    <>
      <div className="flex items-center gap-2 text-xs text-white/50">
        <span className="text-white/35" aria-hidden>{icon}</span>
        {label}
      </div>
      <div className={`mt-2 text-3xl font-light tabular-nums tracking-tight ${colour}`}>{value}</div>
      {detail && <div className="mt-1 text-xs text-white/40">{detail}</div>}
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} data-testid={testid} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.05]">
      {body}
    </button>
  ) : (
    <div data-testid={testid} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">{body}</div>
  )
}

/**
 * Home: what needs attention today, from the practice's own records — the
 * figures, the next deadlines and what has happened lately. Staff see their own
 * clients; partners and managers the whole practice.
 */
export function Home({ onGoTo }: { onGoTo: () => void }): JSX.Element {
  const user = useAuthStore((s) => s.user)
  const navigateTo = useUiStore((s) => s.navigateTo)
  const { status: licence } = useLicence()
  const motionLevel = useMotionLevel()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [failed, setFailed] = useState(false)
  const [firm, setFirm] = useState<string | null>(null)
  const [now] = useState(() => new Date())

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const s = await window.api.getDashboardStats()
      if (s) setStats(s)
      else setFailed(true)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
    void window.api.getFirmData().then((f) => setFirm(f?.name?.trim() || null)).catch(() => setFirm(null))
  }, [load])

  const canManage = user?.role === 'partner' || user?.role === 'manager'
  const practice = licence?.licensedTo ?? firm
  const firstName = user?.name.split(/\s+/)[0] ?? ''
  const reveal = motionLevel === 'none' ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease: EASE_PREMIUM } }

  const newClient = (): void => {
    useClientListTarget.getState().startNewClient(true)
    navigateTo('clients')
  }

  return (
    <motion.div {...reveal} className="mx-auto max-w-[96rem] space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 id="screen-title" tabIndex={-1} className="text-3xl font-light tracking-tight text-white focus:outline-none">
            {greeting(now)}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="mt-1 text-sm text-white/45">
            {longToday(now)}
            {practice ? ` · ${practice}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onGoTo} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm text-white/70 hover:bg-white/[0.08]">
            <Search size={14} aria-hidden /> Go to a client or screen
            <kbd className="ml-1 rounded border border-white/15 px-1.5 text-[10px] text-white/40">{GO_TO_KEYS}</kbd>
          </button>
          <button type="button" onClick={newClient} className="flex items-center gap-2 rounded-xl bg-aether/90 px-3.5 py-2 text-sm font-medium text-black hover:bg-aether">
            <UserPlus size={14} aria-hidden /> New client
          </button>
        </div>
      </header>

      {failed && (
        <p role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          The figures couldn’t be read just now.
          <button type="button" onClick={() => void load()} className="rounded-lg border border-rose-300/30 px-3 py-1 text-xs hover:bg-rose-500/10">
            Try again
          </button>
        </p>
      )}

      {stats && stats.totalClients === 0 && (
        <GlassCard glow="aether" className="p-8">
          <h2 className="text-xl font-light text-white/90">No clients yet</h2>
          <p className="mt-2 max-w-prose text-sm text-white/55">
            {canManage
              ? 'Bring in the practice’s master workbook to load every client, deadline and register at once, or add clients one by one.'
              : 'No clients have been assigned to you yet. A partner or manager assigns clients from the client list.'}
          </p>
          {canManage && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => navigateTo('import')} className="flex items-center gap-2 rounded-xl bg-aether/90 px-4 py-2 text-sm font-medium text-black hover:bg-aether">
                <Upload size={14} aria-hidden /> Import the master workbook
              </button>
              <button type="button" onClick={newClient} className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/[0.06]">
                <UserPlus size={14} aria-hidden /> Add a client
              </button>
            </div>
          )}
        </GlassCard>
      )}

      <section aria-label="Figures" className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        {stats ? (
          <>
            <Figure testid="home-clients" icon={<Users size={14} />} label={user?.role === 'staff' ? 'Your clients' : 'Clients'} value={stats.currentClients.toLocaleString('en-GB')} detail={`${stats.activeClients.toLocaleString('en-GB')} active${stats.noLongerClients ? `, ${stats.noLongerClients.toLocaleString('en-GB')} no longer clients` : ''}`} onClick={() => navigateTo('clients')} />
            <Figure testid="home-overdue" icon={<TriangleAlert size={14} />} label="Overdue deadlines" value={String(stats.overdueCount)} tone={stats.overdueCount ? 'alert' : 'quiet'} detail={stats.overdueCount ? 'Accounts, tax returns and confirmation statements' : 'Nothing overdue'} onClick={() => navigateTo('calendar')} />
            <Figure icon={<CalendarClock size={14} />} label="Due in 30 days" value={String(stats.upcomingDeadlines.length >= 20 ? '20+' : stats.upcomingDeadlines.length)} tone={stats.upcomingDeadlines.length ? 'normal' : 'quiet'} onClick={() => navigateTo('calendar')} />
            <Figure icon={<CheckSquare size={14} />} label="Tasks due today" value={String(stats.tasksToday)} tone={stats.tasksToday ? 'normal' : 'quiet'} onClick={() => navigateTo('tasks')} />
            <Figure icon={<Clock size={14} />} label="Work in progress" value={String(stats.wipCount)} tone={stats.wipCount ? 'normal' : 'quiet'} detail="Jobs not yet completed" onClick={() => navigateTo('wip')} />
            <Figure
              icon={<PoundSterling size={14} />}
              label="Owed to the practice"
              value={formatPence(stats.totalARPence, { whole: true })}
              tone={stats.overdueARPence ? 'alert' : stats.totalARPence ? 'normal' : 'quiet'}
              detail={stats.overdueARPence ? `${formatPence(stats.overdueARPence, { whole: true })} overdue on ${stats.overdueInvoices} invoice${stats.overdueInvoices === 1 ? '' : 's'}` : 'Nothing overdue'}
              onClick={() => navigateTo('payments')}
            />
          </>
        ) : (
          !failed && Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[7.5rem] animate-pulse rounded-2xl border border-white/5 bg-white/[0.02]" aria-hidden />)
        )}
      </section>

      {stats && (
        <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6" aria-labelledby="home-deadlines">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 id="home-deadlines" className="text-base font-medium text-white/85">Next deadlines</h2>
              <button type="button" onClick={() => navigateTo('calendar')} className="text-xs text-aether/90 hover:underline">
                Calendar
              </button>
            </div>
            {stats.upcomingDeadlines.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/40">Nothing due in the next 30 days.</p>
            ) : (
              <ul className="divide-y divide-white/5" data-testid="home-deadlines">
                {stats.upcomingDeadlines.map((d, i) => (
                  <li key={`${d.client_id ?? d.client_name}-${d.type}-${i}`}>
                    <button
                      type="button"
                      disabled={d.client_id === undefined}
                      onClick={() => d.client_id !== undefined && openClient({ id: d.client_id, ref: d.client_ref ?? null })}
                      className="flex w-full items-center gap-4 rounded-lg px-2 py-2.5 text-left hover:bg-white/[0.03] disabled:cursor-default"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-white/85">{d.client_name}</span>
                      <span className="w-36 truncate text-xs text-white/50">{d.type}</span>
                      <span className="w-16 text-right text-xs tabular-nums text-white/60">{shortDate(d.due_date)}</span>
                      <span className={`w-24 text-right text-xs ${d.days_remaining <= 7 ? 'text-amber-200/90' : 'text-white/40'}`}>{dueIn(d.days_remaining)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6" aria-labelledby="home-activity">
            <h2 id="home-activity" className="mb-4 text-base font-medium text-white/85">
              {canManage ? 'Recent activity' : 'Your recent activity'}
            </h2>
            {stats.recentActivity.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/40">Nothing recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {stats.recentActivity.map((a, i) => (
                  <li key={`${a.timestamp}-${i}`} className="flex items-baseline gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate text-white/75" title={a.action}>{a.action}</span>
                    <span className="truncate text-xs text-white/40">{a.user || 'The app'}</span>
                    <span className="w-28 flex-shrink-0 text-right text-xs text-white/35">{ago(a.timestamp)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </motion.div>
  )
}
