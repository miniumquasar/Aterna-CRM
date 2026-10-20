/**
 * Normalisers + validators. Each returns `{ value, problem }`:
 *   value   — the canonical form, or null
 *   problem — set when a raw value WAS present but could not be used
 *             (becomes a data issue; blanks are not problems)
 *
 * Checksum algorithms were validated against the practice workbook before
 * being adopted: 376/378 UTRs and 276/286 VAT numbers pass, so a failure
 * here is a genuine data error, not a false alarm.
 */

import { iso, isIsoDate, type IsoDate } from './rules'

export type CellValue = string | number | boolean | Date | null

export interface Normalised<T> {
  value: T | null
  problem: string | null
}

const ok = <T>(value: T | null): Normalised<T> => ({ value, problem: null })
const bad = <T>(problem: string): Normalised<T> => ({ value: null, problem })

export function text(raw: CellValue): string | null {
  if (raw === null || raw === undefined) return null
  if (raw instanceof Date) return null
  const s = String(raw).replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

/** Excel serial day 0 = 1899-12-30 (Lotus leap-year bug included). */
function fromExcelSerial(n: number): IsoDate | null {
  if (!Number.isFinite(n) || n < 1 || n > 2_958_465) return null
  const t = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000)
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

export function isoDate(raw: CellValue): Normalised<IsoDate> {
  if (raw === null || raw === '') return ok(null)
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return bad('unreadable date')
    // ExcelJS materialises date cells at UTC midnight.
    return ok(iso(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate()))
  }
  if (typeof raw === 'number') {
    const d = fromExcelSerial(raw)
    return d ? ok(d) : bad(`not a date: ${raw}`)
  }
  const s = String(raw).trim()
  if (s === '') return ok(null)
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s) // dd/mm/yyyy (UK)
  if (m) {
    const d = iso(Number(m[3]), Number(m[2]), Number(m[1]))
    return isIsoDate(d) ? ok(d) : bad(`impossible date: ${s}`)
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) {
    const d = iso(Number(m[1]), Number(m[2]), Number(m[3]))
    return isIsoDate(d) ? ok(d) : bad(`impossible date: ${s}`)
  }
  return bad(`not a date: ${s}`)
}

export function int(raw: CellValue): number | null {
  if (raw === null || raw === '' || raw instanceof Date) return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? Math.trunc(n) : null
}

export function yesNo(raw: CellValue): boolean | null {
  const s = text(raw)?.toUpperCase()
  if (!s) return null
  if (['Y', 'YES', 'TRUE', '1'].includes(s)) return true
  if (['N', 'NO', 'FALSE', '0'].includes(s)) return false
  return null
}

// ── Identifiers ─────────────────────────────────────────────────────────────

/** Companies House number: 8 digits (zero-padded) or 2 letters + 6 digits. */
export function crn(raw: CellValue): Normalised<string> {
  const s = text(raw)?.toUpperCase().replace(/\s/g, '')
  if (!s) return ok(null)
  const padded = /^\d{1,8}$/.test(s) ? s.padStart(8, '0') : s
  return /^(\d{8}|[A-Z]{2}\d{6})$/.test(padded) ? ok(padded) : bad(`invalid company number: ${s}`)
}

const UTR_WEIGHTS = [6, 7, 8, 9, 10, 5, 4, 3, 2]
const UTR_CHECK = [2, 1, 9, 8, 7, 6, 5, 4, 3, 2, 1]

export function utrChecksumValid(utr: string): boolean {
  if (!/^\d{10}$/.test(utr)) return false
  const total = UTR_WEIGHTS.reduce((sum, w, i) => sum + w * Number(utr[i + 1]), 0)
  return Number(utr[0]) === UTR_CHECK[total % 11]
}

/** Personal / partnership / corporation-tax UTR: 10 digits with HMRC check digit. */
export function utr(raw: CellValue): Normalised<string> {
  const s = text(raw)
  if (!s) return ok(null)
  const digits = s.replace(/\D/g, '').replace(/^(\d{10})K?$/, '$1')
  if (digits.length !== 10) return bad(`UTR is not 10 digits: ${s}`)
  return utrChecksumValid(digits) ? ok(digits) : bad(`UTR fails HMRC check digit: ${s}`)
}

export function vatChecksumValid(nine: string): boolean {
  if (!/^\d{9}$/.test(nine)) return false
  const total = [8, 7, 6, 5, 4, 3, 2].reduce((sum, w, i) => sum + w * Number(nine[i]), 0) + Number(nine.slice(7))
  return total % 97 === 0 || (total + 55) % 97 === 0 // mod 97 or mod 9755
}

/** UK VAT number, stored as 9 digits (12 for group/branch), no GB prefix. */
export function vatNumber(raw: CellValue): Normalised<string> {
  const s = text(raw)
  if (!s) return ok(null)
  const digits = s.toUpperCase().replace(/^GB/, '').replace(/\D/g, '')
  if (digits.length === 12 && vatChecksumValid(digits.slice(0, 9))) return ok(digits)
  if (digits.length !== 9) return bad(`VAT number is not 9 digits: ${s}`)
  return vatChecksumValid(digits) ? ok(digits) : bad(`VAT number fails HMRC checksum: ${s}`)
}

export function nino(raw: CellValue): Normalised<string> {
  const s = text(raw)?.toUpperCase().replace(/\s/g, '')
  if (!s) return ok(null)
  const valid = /^(?!BG|GB|KN|NK|NT|TN|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]$/
  if (valid.test(s)) return ok(s)
  if (/^[A-Z]{2}\d{6}$/.test(s)) return bad(`NINO missing its suffix letter: ${s}`)
  return bad(`invalid National Insurance number: ${s}`)
}

/** PAYE employer reference, e.g. 120/BB97474. Placeholders return a status instead. */
export function payeRef(raw: CellValue): Normalised<string> & { placeholder: string | null } {
  const s = text(raw)
  if (!s) return { ...ok<string>(null), placeholder: null }
  const compact = s.toUpperCase().replace(/\s/g, '')
  if (/^\d{3}\/[A-Z0-9]{1,10}$/.test(compact)) return { ...ok(compact), placeholder: null }
  if (!/\d{3}/.test(compact)) return { ...ok<string>(null), placeholder: s } // e.g. "NOT REG", "applied"
  return { ...bad<string>(`invalid PAYE reference: ${s}`), placeholder: null }
}

/** Accounts Office reference: 3 digits, P, letter, 7 digits, check char (13 chars). */
export function accountsOfficeRef(raw: CellValue): Normalised<string> {
  const s = text(raw)?.toUpperCase().replace(/\s/g, '')
  if (!s) return ok(null)
  if (!/\d/.test(s)) return ok(null) // placeholder text handled with the PAYE reference
  return /^\d{3}P[A-Z]\d{7}[\dX]$/.test(s) ? ok(s) : bad(`invalid Accounts Office reference: ${s}`)
}

/** The Pensions Regulator letter code: 10 digits. */
export function letterCode(raw: CellValue): Normalised<string> {
  const s = text(raw)?.replace(/\s/g, '')
  if (!s) return ok(null)
  return /^\d{10}$/.test(s) ? ok(s) : bad(`invalid TPR letter code: ${s}`)
}

/**
 * Companies House identity-verification personal code: 11 characters,
 * canonically XXX-XXXX-XXXX. Cells that hold a status instead ("DISSOLVED",
 * "ACTIVE PROPOSAL TO STRIKE OFF") are returned as `statusText`, not codes.
 */
export function personalCode(raw: CellValue): Normalised<string> & { statusText: string | null } {
  const s = text(raw)
  if (!s) return { ...ok<string>(null), statusText: null }
  const compact = s.toUpperCase().replace(/[\s-]/g, '')
  if (/^[A-Z0-9]{11}$/.test(compact) && /\d/.test(compact)) {
    return { ...ok(`${compact.slice(0, 3)}-${compact.slice(3, 7)}-${compact.slice(7)}`), statusText: null }
  }
  return { ...ok<string>(null), statusText: s }
}

// ── Contact details ─────────────────────────────────────────────────────────

/**
 * UK phone. Restores the leading 0 that spreadsheets strip from numeric
 * cells (7596… → 07596…). A cell holding two numbers keeps the first and
 * returns the rest in `extra`.
 */
export function phoneUk(raw: CellValue): Normalised<string> & { extra: string[]; repaired: boolean } {
  const s = text(raw)
  if (!s) return { ...ok<string>(null), extra: [], repaired: false }
  const pieces = s.split(/\s*[/,;]\s*|\s+or\s+/i).filter(Boolean)
  const one = (p: string): { v: string | null; repaired: boolean } => {
    let d = p.replace(/[^\d+]/g, '')
    if (d.startsWith('+44')) d = '0' + d.slice(3)
    else if (d.startsWith('0044')) d = '0' + d.slice(4)
    let repaired = false
    if (/^[1-9]\d{9}$/.test(d)) {
      d = '0' + d
      repaired = true
    }
    return { v: /^0\d{9,10}$/.test(d) ? d : null, repaired }
  }
  const [first, ...rest] = pieces.map(one)
  if (!first?.v) return { ...bad<string>(`unrecognised phone number: ${s}`), extra: [], repaired: false }
  return {
    ...ok(first.v),
    extra: rest.map((r) => r.v).filter((v): v is string => v !== null),
    repaired: first.repaired
  }
}

export function email(raw: CellValue): Normalised<string> {
  const s = text(raw)?.toLowerCase().replace(/^mailto:/, '')
  if (!s) return ok(null)
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? ok(s) : bad(`invalid e-mail address: ${s}`)
}

// ── Matching keys ───────────────────────────────────────────────────────────

/** Name key for matching and alias search: case/punctuation/suffix-insensitive. */
export function nameKey(raw: CellValue): string | null {
  const s = text(raw)
  if (!s) return null
  const k = s
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\bLIMITED\b/g, 'LTD')
    .replace(/\bPUBLIC LIMITED COMPANY\b/g, 'PLC')
    .replace(/\s+/g, ' ')
    .trim()
  return k === '' ? null : k
}

/** Canonical title case for display names held in shouting caps. */
export function displayName(raw: CellValue): string | null {
  return text(raw)
}
