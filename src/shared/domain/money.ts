/**
 * Money in whole pence. Every amount is stored and passed as an integer number
 * of pence (`fee_pence`), so adding never drifts; pounds appear only at the
 * edges, when a person types an amount or reads one.
 *
 * The work domain extends this file (invoice totals, aged receivables).
 */

/** £1,000,000,000.00: the largest amount the app accepts. */
export const MAX_PENCE = 100_000_000_000

export type ParsedPounds = { ok: true; pence: number | null } | { ok: false; error: string }

export interface ParseOptions {
  /** Accept amounts below zero ('-12.50', '(12.50)'). Off unless asked. */
  allowNegative?: boolean
  /** How the amount is named in an error, e.g. 'The fee'. Defaults to 'The amount'. */
  label?: string
}

/** Digits with optional thousands separators (comma or space) in the right places, or plain digits. */
const BODY = /^(?:(\d{1,3}(?:([, ])\d{3})*)|(\d+))?(?:\.(\d*))?$/

/**
 * Reads an amount the way people type it: '1,234.56', '£1234.5', '.5', '5.',
 * '1 234.00', 'GBP 12' or a number. Empty input is null (no amount). It
 * refuses rather than guesses: three decimal places, misplaced separators,
 * words and exponents are errors, each a sentence a person can act on.
 */
export function parsePounds(input: string | number | null | undefined, options: ParseOptions = {}): ParsedPounds {
  const label = options.label ?? 'The amount'
  const allowNegative = options.allowNegative ?? false
  const tooBig = `${label} can’t be more than £1,000,000,000.`
  const belowZero = `${label} can’t be below zero.`

  if (input === null || input === undefined) return { ok: true, pence: null }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return { ok: false, error: `${label} must be a number of pounds and pence, like 1,250.00.` }
    const scaled = input * 100
    const pence = Math.round(scaled)
    if (Math.abs(scaled - pence) > 1e-6) return { ok: false, error: `${label} can’t have more than two decimal places.` }
    return finish(pence)
  }

  let text = input.trim()
  if (text === '') return { ok: true, pence: null }

  let negative = false
  const bracketed = /^\((.*)\)$/.exec(text)
  if (bracketed) {
    negative = true
    text = bracketed[1].trim()
  }
  text = text.replace(/^gbp\s*/i, '')
  if (text.startsWith('-')) {
    negative = !negative
    text = text.slice(1).trim()
  }
  if (text.startsWith('£')) text = text.slice(1).trim()
  if (text.startsWith('-')) {
    negative = !negative
    text = text.slice(1).trim()
  }

  const m = BODY.exec(text)
  const whole = m ? (m[1] ?? m[3] ?? '') : ''
  const fraction = m?.[4] ?? ''
  if (!m || (whole === '' && fraction === '')) {
    return { ok: false, error: `${label} must be a number of pounds and pence, like 1,250.00.` }
  }
  if (m[1] && m[2] && m[1].includes(m[2] === ',' ? ' ' : ',')) {
    return { ok: false, error: `${label} must be a number of pounds and pence, like 1,250.00.` }
  }
  if (fraction.length > 2) return { ok: false, error: `${label} can’t have more than two decimal places.` }

  const pounds = whole.replace(/[, ]/g, '') || '0'
  if (pounds.length > 13) return { ok: false, error: tooBig }
  const pence = Number(pounds) * 100 + Number(fraction.padEnd(2, '0') || '0')
  return finish(negative ? -pence : pence)

  function finish(pence: number): ParsedPounds {
    const value = pence === 0 ? 0 : pence // never -0
    if (value < 0 && !allowNegative) return { ok: false, error: belowZero }
    if (Math.abs(value) > MAX_PENCE) return { ok: false, error: tooBig }
    return { ok: true, pence: value }
  }
}

/** True for a whole number of pence within range (and not below zero unless allowed). */
export function isPence(value: unknown, allowNegative = false): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Math.abs(value) <= MAX_PENCE &&
    (allowNegative || value >= 0)
  )
}

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
const currencyWhole = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0, minimumFractionDigits: 0 })
const plain = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export interface FormatPenceOptions {
  /** Round to whole pounds: '£1,235'. */
  whole?: boolean
  /** What to show for no amount. Defaults to '—'. */
  fallback?: string
}

/** '£1,234.56', '-£12.50'; `fallback` for null or undefined. */
export function formatPence(pence: number | null | undefined, options: FormatPenceOptions = {}): string {
  if (pence === null || pence === undefined || !Number.isFinite(pence)) return options.fallback ?? '—'
  return (options.whole ? currencyWhole : currency).format(pence / 100)
}

/** '1,234.56', for tables with the £ in the column heading. */
export function formatPenceNoSymbol(pence: number | null | undefined, fallback = '—'): string {
  if (pence === null || pence === undefined || !Number.isFinite(pence)) return fallback
  return plain.format(pence / 100)
}

/** '1234.56': pounds for an edit box, which parsePounds reads back exactly. */
export function penceToPounds(pence: number | null | undefined): string {
  if (pence === null || pence === undefined || !Number.isFinite(pence)) return ''
  const sign = pence < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(pence))
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** Adds amounts exactly; null and undefined count as nothing. */
export function sumPence(values: Iterable<number | null | undefined>): number {
  let total = 0
  for (const v of values) if (typeof v === 'number') total += v
  return total
}

/** VAT at `ratePercent` on a net amount, to the nearest penny (halves away from zero). */
export function vatOn(netPence: number, ratePercent: number): number {
  const exact = (netPence * ratePercent) / 100
  const rounded = Math.sign(exact) * Math.round(Math.abs(exact) + 1e-9)
  return rounded === 0 ? 0 : rounded
}
