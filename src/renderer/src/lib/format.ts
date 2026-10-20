/**
 * How the app writes things for people: money '£1,250.00', counts '1,250',
 * dates '20 Oct 2026', times '20 Oct 2026, 15:36' (UK time), plurals.
 */
import { formatCivilDate, formatInstant, type CivilDate, type DateStyle } from '@shared/domain/dates'
import { formatPence } from '@shared/domain/money'

export { formatPence as formatMoney }

const count = new Intl.NumberFormat('en-GB')
const percent = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 })

export function formatCount(n: number | null | undefined, fallback = '—'): string {
  return n === null || n === undefined || !Number.isFinite(n) ? fallback : count.format(n)
}

/** 0.42 → '42%'. */
export function formatPercent(fraction: number | null | undefined, fallback = '—'): string {
  return fraction === null || fraction === undefined || !Number.isFinite(fraction) ? fallback : percent.format(fraction)
}

export function formatDate(date: CivilDate | null | undefined, style: DateStyle = 'short', fallback = '—'): string {
  return formatCivilDate(date, style, fallback)
}

export function formatDateTime(instant: string | Date | null | undefined, fallback = '—'): string {
  return formatInstant(instant, { time: true }, fallback)
}

/** '1 client', '3 clients'; pass the plural when it isn't just +s. */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatCount(n)} ${n === 1 ? singular : pluralForm}`
}

/** 'just now', '5 minutes ago', '3 hours ago', 'yesterday', or the date. */
export function formatRelative(instant: string | Date | null | undefined, now: Date = new Date(), fallback = '—'): string {
  if (!instant) return fallback
  const at = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(at.getTime())) return fallback
  const seconds = Math.round((now.getTime() - at.getTime()) / 1000)
  if (seconds < 0) return formatDateTime(at)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${plural(minutes, 'minute')} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${plural(hours, 'hour')} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return formatInstant(at, { time: false })
}

/** A person's initials for an avatar: 'Pat Partner' → 'PP'. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : (parts[0][1] ?? '')
  return (first + last).toUpperCase()
}
