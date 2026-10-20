/**
 * When scheduled backups are due, and which of them are kept.
 *
 *   schedule   off, every hour, every 4 hours, daily at a time, or weekly on a
 *              day at a time (this PC's local time). A backup missed because the
 *              PC was off is made at the next start.
 *   keeping    every scheduled backup from the last 2 days, then the newest of
 *              each day for 2 weeks, of each week for 8 weeks, and of each month
 *              for a year — about 36 backups for a daily schedule. The newest is
 *              always kept. Backups made by hand are kept until someone deletes them.
 */
export type BackupSchedule = 'off' | 'hourly' | 'every-4-hours' | 'daily' | 'weekly'
export const SCHEDULES: readonly BackupSchedule[] = ['off', 'hourly', 'every-4-hours', 'daily', 'weekly']

export interface ScheduleSettings {
  schedule: BackupSchedule
  /** "HH:MM", for daily and weekly. */
  time: string
  /** 0 = Sunday … 6 = Saturday, for weekly. */
  weekday: number
}

export const DEFAULT_SCHEDULE: ScheduleSettings = { schedule: 'daily', time: '12:30', weekday: 5 }

const HOUR = 3_600_000
const DAY = 24 * HOUR

export function parseTime(time: string): { h: number; m: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time ?? ''))
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null
}

/** The latest moment at or before `now` that the schedule names (daily or weekly), in local time. */
function lastSlot(s: ScheduleSettings, now: Date): Date {
  const t = parseTime(s.time) ?? { h: 12, m: 30 }
  const slot = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.h, t.m, 0, 0)
  if (s.schedule === 'weekly') {
    const back = (now.getDay() - s.weekday + 7) % 7
    slot.setDate(slot.getDate() - back)
    if (slot > now) slot.setDate(slot.getDate() - 7)
  } else if (slot > now) slot.setDate(slot.getDate() - 1)
  return slot
}

/** When the next scheduled backup is due (possibly already), or null when backups are off. */
export function nextDue(s: ScheduleSettings, last: Date | null, now: Date): Date | null {
  switch (s.schedule) {
    case 'off':
      return null
    case 'hourly':
      return last ? new Date(last.getTime() + HOUR) : now
    case 'every-4-hours':
      return last ? new Date(last.getTime() + 4 * HOUR) : now
    case 'daily':
    case 'weekly': {
      const slot = lastSlot(s, now)
      if (!last || last < slot) return slot
      const next = new Date(slot)
      next.setDate(next.getDate() + (s.schedule === 'weekly' ? 7 : 1))
      return next
    }
  }
}

export const isDue = (s: ScheduleSettings, last: Date | null, now: Date): boolean => {
  const due = nextDue(s, last, now)
  return due !== null && due.getTime() <= now.getTime()
}

const localDay = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
const localMonth = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}`
/** The Monday that starts the week, as a day key. */
const localWeek = (d: Date): string => {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return localDay(monday)
}

/** The scheduled backups to remove; never the newest. */
export function scheduledToRemove(backups: ReadonlyArray<{ id: number; createdAt: Date }>, now: Date): number[] {
  const newestFirst = [...backups].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)
  const keep = new Set<number>()
  const days = new Set<string>()
  const weeks = new Set<string>()
  const months = new Set<string>()
  newestFirst.forEach((b, i) => {
    const age = now.getTime() - b.createdAt.getTime()
    let kept = i === 0 || age < 2 * DAY
    const day = localDay(b.createdAt)
    if (!days.has(day)) {
      days.add(day)
      if (age < 14 * DAY) kept = true
    }
    const week = localWeek(b.createdAt)
    if (!weeks.has(week)) {
      weeks.add(week)
      if (age < 56 * DAY) kept = true
    }
    const month = localMonth(b.createdAt)
    if (!months.has(month)) {
      months.add(month)
      if (age < 365 * DAY) kept = true
    }
    if (kept) keep.add(b.id)
  })
  return newestFirst.filter((b) => !keep.has(b.id)).map((b) => b.id)
}

/** How a schedule reads on screen. */
export function describeSchedule(s: ScheduleSettings): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  switch (s.schedule) {
    case 'off':
      return 'Scheduled backups are off'
    case 'hourly':
      return 'Every hour'
    case 'every-4-hours':
      return 'Every 4 hours'
    case 'daily':
      return `Every day at ${s.time}`
    case 'weekly':
      return `Every ${days[s.weekday] ?? 'week'} at ${s.time}`
  }
}
