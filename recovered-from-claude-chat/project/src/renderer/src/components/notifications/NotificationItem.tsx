import { Building2, CalendarClock, CheckSquare, HardDrive, KeyRound, PhoneCall, type LucideIcon } from 'lucide-react'
import type { AppNotification, NotificationKind, NotificationSeverity } from '@shared/types'
import { shortWhen } from '@renderer/lib/dates'
import { smallButton } from '@renderer/screens/crm/references/ui'

export const KIND_LABELS: Record<NotificationKind, string> = {
  deadline: 'Deadline',
  companies_house: 'Companies House',
  follow_up: 'Follow-up',
  task: 'Task',
  backup: 'Backup',
  licence: 'Licence'
}

export const KIND_ICONS: Record<NotificationKind, LucideIcon> = {
  deadline: CalendarClock,
  companies_house: Building2,
  follow_up: PhoneCall,
  task: CheckSquare,
  backup: HardDrive,
  licence: KeyRound
}

/** The thin bar down a notification's edge: red for urgent, amber for soon, the accent otherwise. */
export const SEVERITY_BAR: Record<NotificationSeverity, string> = {
  urgent: 'bg-rose-400/80',
  warning: 'bg-amber-300/80',
  info: 'bg-aether/50'
}

/** The words a screen reader hears before the title. */
const SEVERITY_WORDS: Record<NotificationSeverity, string> = { urgent: 'Urgent: ', warning: 'Soon: ', info: '' }

/**
 * One notification: what it is, when, and Open (where it points) with Done —
 * or Open again, once done. `compact` for the bell's panel.
 */
export function NotificationItem({ n, compact = false, onOpen, onDone, onReopen }: {
  n: AppNotification
  compact?: boolean
  onOpen: (n: AppNotification) => void
  onDone: (n: AppNotification) => void
  onReopen?: (n: AppNotification) => void
}): JSX.Element {
  const Icon = KIND_ICONS[n.kind] ?? CalendarClock
  const done = n.done_at !== null
  return (
    <li
      className={`relative flex gap-3 overflow-hidden rounded-xl border border-white/10 ${done ? 'bg-transparent' : 'bg-white/[0.025]'} ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}
      data-testid="notification"
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${done ? 'bg-white/10' : SEVERITY_BAR[n.severity]}`} aria-hidden />
      <Icon size={compact ? 14 : 16} className={`mt-0.5 shrink-0 ${done ? 'text-white/30' : 'text-white/55'}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`${compact ? 'text-[13px]' : 'text-sm'} ${done ? 'text-white/55' : 'text-white/90'}`}>
          <span className="sr-only">{done ? '' : SEVERITY_WORDS[n.severity]}</span>
          {n.title}
        </p>
        {n.body && <p className={`mt-0.5 text-xs text-white/50 ${compact ? 'line-clamp-2' : ''}`}>{n.body}</p>}
        <p className="mt-1 text-[11px] text-white/35">
          {KIND_LABELS[n.kind]} · {shortWhen(n.created_at)}
          {done && n.done_by ? ` · Done by ${n.done_by}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start">
        {n.target && (
          <button type="button" className={smallButton} onClick={() => onOpen(n)} data-testid="notification-open">
            Open
          </button>
        )}
        {!done ? (
          <button type="button" className={smallButton} onClick={() => onDone(n)} aria-label={`Mark done: ${n.title}`} data-testid="notification-done">
            Done
          </button>
        ) : (
          onReopen && (
            <button type="button" className={smallButton} onClick={() => onReopen(n)} aria-label={`Open again: ${n.title}`}>
              Open again
            </button>
          )
        )}
      </div>
    </li>
  )
}
