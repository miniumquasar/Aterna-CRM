/**
 * Civil dates (a day on the calendar, no time and no zone) as the practice
 * uses them: stored and passed as 'YYYY-MM-DD', worked out in UK time, and
 * shown as '20 Oct 2026'.
 *
 * Arithmetic runs on whole days counted from 1970-01-01, never on local
 * Date objects, so a date can't slip a day across midnight UTC or a clock
 * change. "Today" is today in Europe/London, whatever the PC's own zone.
 */

/** A calendar date, 'YYYY-MM-DD'. */
export type CivilDate = string

export interface DateParts {
  year: number
  /** 1 to 12. */
  month: number
  /** 1 to 31. */
  day: number
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
export const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
] as const
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export const UK_TIME_ZONE = 'Europe/London'

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/** The parts of a real calendar date, or null for anything else ('2026-02-30' is null). */
export function parseCivilDate(value: unknown): DateParts | null {
  if (typeof value !== 'string') return null
  const m = ISO_DATE.exec(value)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

export function isCivilDate(value: unknown): value is CivilDate {
  return parseCivilDate(value) !== null
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

/** Builds a date from its parts; throws a RangeError for a date that doesn't exist. */
export function civilDate(year: number, month: number, day: number): CivilDate {
  const text = `${pad(year, 4)}-${pad(month)}-${pad(day)}`
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || !isCivilDate(text)) {
    throw new RangeError(`There is no date ${year}-${month}-${day}.`)
  }
  return text
}

function partsOf(date: CivilDate): DateParts {
  const parts = parseCivilDate(date)
  if (!parts) throw new RangeError(`“${String(date)}” isn’t a date in the form YYYY-MM-DD.`)
  return parts
}

/** Whole days since 1970-01-01. */
function toEpochDays(date: CivilDate): number {
  const { year, month, day } = partsOf(date)
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000)
}

function fromEpochDays(days: number): CivilDate {
  const d = new Date(days * 86_400_000)
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

const londonDateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})

export interface LondonDateTime {
  date: CivilDate
  hour: number
  minute: number
  second: number
}

/** The date and time in the UK at an instant. */
export function londonDateTime(instant: Date | string | number = new Date()): LondonDateTime {
  const at = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(at.getTime())) throw new RangeError(`“${String(instant)}” isn’t a point in time.`)
  const parts = londonDateFormat.formatToParts(at)
  const pick = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value)
  return {
    date: `${pad(pick('year'), 4)}-${pad(pick('month'))}-${pad(pick('day'))}`,
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second')
  }
}

/** Today's date in the UK. */
export function todayInLondon(now: Date = new Date()): CivilDate {
  return londonDateTime(now).date
}

/** The UK calendar date an instant falls on ('2026-03-29T23:30:00Z' is 30 March in BST). */
export function instantToLondonDate(instant: Date | string | number): CivilDate {
  return londonDateTime(instant).date
}

export function addDays(date: CivilDate, days: number): CivilDate {
  if (!Number.isInteger(days)) throw new RangeError('Days to add must be a whole number.')
  return fromEpochDays(toEpochDays(date) + days)
}

export interface AddMonthsOptions {
  /**
   * What happens at the end of a month.
   *  - 'clamp' (default): the same day number, or the target month's last day
   *    when it is shorter (31 Jan + 1 month = 28 or 29 Feb).
   *  - 'keep': a date on the last day of its month lands on the last day of
   *    the target month (30 Jun + 9 months = 31 Mar), as Companies House
   *    filing deadlines work. Other dates behave as 'clamp'.
   */
  monthEnd?: 'clamp' | 'keep'
}

export function addMonths(date: CivilDate, months: number, options: AddMonthsOptions = {}): CivilDate {
  if (!Number.isInteger(months)) throw new RangeError('Months to add must be a whole number.')
  const { year, month, day } = partsOf(date)
  const index = year * 12 + (month - 1) + months
  const targetYear = Math.floor(index / 12)
  const targetMonth = (index % 12) + 1
  const last = daysInMonth(targetYear, targetMonth)
  const wasLastDay = day === daysInMonth(year, month)
  const targetDay = options.monthEnd === 'keep' && wasLastDay ? last : Math.min(day, last)
  return civilDate(targetYear, targetMonth, targetDay)
}

export function addYears(date: CivilDate, years: number, options: AddMonthsOptions = {}): CivilDate {
  return addMonths(date, years * 12, options)
}

/** Whole days from `from` to `to`: positive when `to` is later. */
export function daysBetween(from: CivilDate, to: CivilDate): number {
  return toEpochDays(to) - toEpochDays(from)
}

export function compareDates(a: CivilDate, b: CivilDate): -1 | 0 | 1 {
  const d = toEpochDays(a) - toEpochDays(b)
  return d < 0 ? -1 : d > 0 ? 1 : 0
}

export function isLastDayOfMonth(date: CivilDate): boolean {
  const { year, month, day } = partsOf(date)
  return day === daysInMonth(year, month)
}

export function startOfMonth(date: CivilDate): CivilDate {
  const { year, month } = partsOf(date)
  return civilDate(year, month, 1)
}

export function endOfMonth(date: CivilDate): CivilDate {
  const { year, month } = partsOf(date)
  return civilDate(year, month, daysInMonth(year, month))
}

/** 0 is Sunday, 6 is Saturday. */
export function dayOfWeek(date: CivilDate): number {
  // 1970-01-01 was a Thursday (4).
  return (((toEpochDays(date) + 4) % 7) + 7) % 7
}

export type DateStyle = 'short' | 'long' | 'weekday'

/**
 * '20 Oct 2026' (short), '20 October 2026' (long) or 'Tue 20 Oct 2026'
 * (weekday). Anything that isn't a date shows as `fallback`.
 */
export function formatCivilDate(date: CivilDate | null | undefined, style: DateStyle = 'short', fallback = '—'): string {
  const parts = parseCivilDate(date)
  if (!parts) return fallback
  const { year, month, day } = parts
  if (style === 'long') return `${day} ${MONTHS_LONG[month - 1]} ${year}`
  const short = `${day} ${MONTHS_SHORT[month - 1]} ${year}`
  return style === 'weekday' ? `${WEEKDAYS_SHORT[dayOfWeek(date as CivilDate)]} ${short}` : short
}

/** '20 Oct 2026, 15:36' in UK time; `fallback` for anything that isn't a point in time. */
export function formatInstant(instant: Date | string | number | null | undefined, options: { time?: boolean } = {}, fallback = '—'): string {
  if (instant === null || instant === undefined || instant === '') return fallback
  const at = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(at.getTime())) return fallback
  const { date, hour, minute } = londonDateTime(at)
  const day = formatCivilDate(date)
  return options.time === false ? day : `${day}, ${pad(hour)}:${pad(minute)}`
}
