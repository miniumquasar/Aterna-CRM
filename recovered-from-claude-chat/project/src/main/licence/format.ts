/**
 * Licence key format v2 — shared by the app (verifies) and the vendor tool
 * (signs). Pure functions; no I/O.
 *
 * A key is the signed payload followed by its 64-byte Ed25519 signature,
 * written in Crockford base32 and shown in groups of 8. Crockford base32
 * ignores case and treats O as 0 and I/L as 1, so keys survive being read
 * aloud or retyped. A key for "Dynamic Accountants Ltd" is about 170
 * characters; it is pasted, not typed.
 *
 * Signed payload (19 bytes + the firm's name)
 *   0      format version (high nibble, = 2) | signing-key id (low nibble, 0–15)
 *   1      product (high nibble, 1 = CRM)    | key type (low nibble: 1 term, 2 clock reset)
 *   2      term unit (bit 7: 0 months, 1 days) | term amount (bits 0–6, 1–127)
 *   3–5    serial number, 24-bit, unique per signing key
 *   6–7    issue date, days since 2024-01-01 (big-endian)
 *   8–9    first day covered, days since 2024-01-01 (big-endian)
 *   10–17  machine code (64-bit); all zeros = valid on any computer
 *   18     length of the firm's name in bytes (0–100)
 *   19…    the firm's name, UTF-8
 * Signature (64 bytes): Ed25519 over "AETERNA-CRM/licence/v2\0" ‖ payload
 *
 * Every field is signed, so changing one character — the firm's name, a date —
 * breaks the key. Each key says exactly which days it covers, so the same key
 * gives the same answer on every PC: a new PC needs only the current key.
 *
 * Version 1 keys (128 characters, no firm name, no start date) are recognised
 * only to say they need replacing.
 */

export const FORMAT_VERSION = 2
export const PRODUCT_CRM = 1
/** Payload bytes before the firm's name. */
export const FIXED_BYTES = 19
export const SIGNATURE_BYTES = 64
export const MACHINE_BYTES = 8
export const MAX_FIRM_BYTES = 100
export const SIGNING_DOMAIN = 'AETERNA-CRM/licence/v2\0'
/** A version 1 key: 80 bytes, 128 characters. */
export const LEGACY_KEY_CHARS = 128

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CHECK_SYMBOLS = ALPHABET + '*~$=U'
const EPOCH_MS = Date.UTC(2024, 0, 1)
const DAY_MS = 86_400_000

export type KeyType = 'term' | 'clock_reset'
export interface Term {
  unit: 'months' | 'days'
  amount: number
}

export interface LicencePayload {
  version: number
  signingKeyId: number
  product: number
  type: KeyType
  term: Term
  serial: number
  /** YYYY-MM-DD: when the key was issued. */
  issuedOn: string
  /** YYYY-MM-DD: the first day the key covers. */
  startsOn: string
  /** 8 bytes, or null when the key works on any computer. */
  machine: Uint8Array | null
  /** The licensed firm, exactly as signed. Empty only on clock-reset keys. */
  firm: string
}

// ── Crockford base32 ─────────────────────────────────────────────────────────

/** Upper-cases, drops separators and maps the look-alikes Crockford allows. */
export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[\s\-_.]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
}

export function base32Encode(bytes: Uint8Array): string {
  let out = ''
  let value = 0
  let bits = 0
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
    value &= (1 << bits) - 1
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

/** Decodes exactly `byteLength` bytes. Rejects bad symbols, wrong lengths and non-zero padding. */
export function base32Decode(text: string, byteLength: number): Uint8Array | null {
  if (text.length !== Math.ceil((byteLength * 8) / 5)) return null
  const out = new Uint8Array(byteLength)
  let value = 0
  let bits = 0
  let i = 0
  for (const ch of text) {
    const v = ALPHABET.indexOf(ch)
    if (v < 0) return null
    value = (value << 5) | v
    bits += 5
    if (bits >= 8) {
      out[i++] = (value >>> (bits - 8)) & 255
      bits -= 8
      value &= (1 << bits) - 1
    }
  }
  return i === byteLength && value === 0 ? out : null
}

/** Decodes a base32 string of any length that encodes whole bytes; null otherwise. */
function base32DecodeAny(text: string): Uint8Array | null {
  const byteLength = Math.floor((text.length * 5) / 8)
  if (byteLength === 0) return null
  return base32Decode(text, byteLength)
}

export const group = (code: string, size: number): string => code.match(new RegExp(`.{1,${size}}`, 'g'))?.join('-') ?? ''

// ── Dates ────────────────────────────────────────────────────────────────────

export function dayNumber(isoDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) throw new Error(`Not a date: ${isoDate}`)
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - EPOCH_MS) / DAY_MS)
}

export function dateFromDayNumber(day: number): string {
  return new Date(EPOCH_MS + day * DAY_MS).toISOString().slice(0, 10)
}

// ── The firm's name ──────────────────────────────────────────────────────────

/**
 * A firm's name as it is signed: Unicode-normalised, control characters
 * removed, runs of spaces made single, trimmed. The vendor tool signs exactly
 * this, and the app shows exactly what was signed.
 */
export function cleanFirmName(name: string): string {
  return Array.from(String(name ?? '').normalize('NFC'), (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

const utf8 = new TextEncoder()

/** Bytes a firm's name takes in a key. */
export const firmBytes = (name: string): number => utf8.encode(cleanFirmName(name)).length

// ── Payload ──────────────────────────────────────────────────────────────────

export function encodePayload(p: LicencePayload): Uint8Array {
  const issued = dayNumber(p.issuedOn)
  const starts = dayNumber(p.startsOn)
  const typeCode = p.type === 'term' ? 1 : 2
  const firm = utf8.encode(cleanFirmName(p.firm))
  if (p.version !== FORMAT_VERSION) throw new Error(`Only format version ${FORMAT_VERSION} keys can be issued`)
  if (p.signingKeyId < 0 || p.signingKeyId > 15) throw new Error('Signing key id must be 0–15')
  if (p.serial < 1 || p.serial > 0xffffff) throw new Error('Serial must be 1–16777215')
  if (p.term.amount < 1 || p.term.amount > 127) throw new Error('Term must be 1–127 months or days')
  if (issued < 0 || issued > 0xffff || starts < 0 || starts > 0xffff) throw new Error('Date out of range')
  if (p.machine && p.machine.length !== MACHINE_BYTES) throw new Error('Machine code must be 8 bytes')
  if (firm.length > MAX_FIRM_BYTES) throw new Error(`The firm's name must fit in ${MAX_FIRM_BYTES} bytes`)
  if (p.type === 'term' && cleanFirmName(p.firm).length < 2) throw new Error("A licence key must name the firm")
  const b = new Uint8Array(FIXED_BYTES + firm.length)
  b[0] = (p.version << 4) | p.signingKeyId
  b[1] = (p.product << 4) | typeCode
  b[2] = (p.term.unit === 'days' ? 0x80 : 0) | p.term.amount
  b[3] = (p.serial >>> 16) & 255
  b[4] = (p.serial >>> 8) & 255
  b[5] = p.serial & 255
  b[6] = (issued >>> 8) & 255
  b[7] = issued & 255
  b[8] = (starts >>> 8) & 255
  b[9] = starts & 255
  if (p.machine) b.set(p.machine, 10)
  b[18] = firm.length
  b.set(firm, FIXED_BYTES)
  return b
}

export type PayloadProblem = 'unsupported_version' | 'wrong_product' | 'unknown_type' | 'bad_term' | 'bad_serial' | 'bad_firm'

const strictUtf8 = new TextDecoder('utf-8', { fatal: true })

export function decodePayload(b: Uint8Array): { payload: LicencePayload } | { problem: PayloadProblem } {
  const version = b[0] >> 4
  if (version !== FORMAT_VERSION) return { problem: 'unsupported_version' }
  const product = b[1] >> 4
  if (product !== PRODUCT_CRM) return { problem: 'wrong_product' }
  const typeCode = b[1] & 15
  if (typeCode !== 1 && typeCode !== 2) return { problem: 'unknown_type' }
  const amount = b[2] & 0x7f
  if (amount < 1) return { problem: 'bad_term' }
  const serial = (b[3] << 16) | (b[4] << 8) | b[5]
  if (serial < 1) return { problem: 'bad_serial' }
  if (b.length < FIXED_BYTES || b[18] !== b.length - FIXED_BYTES || b[18] > MAX_FIRM_BYTES) return { problem: 'bad_firm' }
  let firm: string
  try {
    firm = strictUtf8.decode(b.slice(FIXED_BYTES))
  } catch {
    return { problem: 'bad_firm' }
  }
  const type: KeyType = typeCode === 1 ? 'term' : 'clock_reset'
  if (firm !== cleanFirmName(firm) || (type === 'term' && firm.length < 2)) return { problem: 'bad_firm' }
  const machine = b.slice(10, 18)
  return {
    payload: {
      version,
      signingKeyId: b[0] & 15,
      product,
      type,
      term: { unit: b[2] & 0x80 ? 'days' : 'months', amount },
      serial,
      issuedOn: dateFromDayNumber((b[6] << 8) | b[7]),
      startsOn: dateFromDayNumber((b[8] << 8) | b[9]),
      machine: machine.some((x) => x !== 0) ? machine : null,
      firm
    }
  }
}

export function signingInput(payload: Uint8Array): Uint8Array {
  const domain = utf8.encode(SIGNING_DOMAIN)
  const out = new Uint8Array(domain.length + payload.length)
  out.set(domain)
  out.set(payload, domain.length)
  return out
}

// ── Keys ─────────────────────────────────────────────────────────────────────

export function assembleKey(payload: Uint8Array, signature: Uint8Array): string {
  if (payload.length < FIXED_BYTES || signature.length !== SIGNATURE_BYTES) throw new Error('Bad key parts')
  const bytes = new Uint8Array(payload.length + SIGNATURE_BYTES)
  bytes.set(payload)
  bytes.set(signature, payload.length)
  return group(base32Encode(bytes), 8)
}

/** Splits a typed or pasted key into its parts; null if it cannot be a v2 key. */
export function splitKey(input: string): { canonical: string; payload: Uint8Array; signature: Uint8Array } | null {
  const canonical = normaliseCode(input)
  const bytes = base32DecodeAny(canonical)
  if (!bytes || bytes.length < FIXED_BYTES + SIGNATURE_BYTES || bytes.length > FIXED_BYTES + MAX_FIRM_BYTES + SIGNATURE_BYTES) return null
  const payload = bytes.slice(0, bytes.length - SIGNATURE_BYTES)
  if (payload[18] !== payload.length - FIXED_BYTES) return null
  return { canonical, payload, signature: bytes.slice(payload.length) }
}

/** A complete key in the older format 1 (no firm name), which this version no longer accepts. */
export function isLegacyKey(input: string): boolean {
  const canonical = normaliseCode(input)
  if (canonical.length !== LEGACY_KEY_CHARS) return false
  const bytes = base32Decode(canonical, 80)
  return !!bytes && bytes[0] >> 4 === 1
}

export const termLabel = (t: Term): string => `${t.amount} ${t.unit === 'months' ? (t.amount === 1 ? 'month' : 'months') : t.amount === 1 ? 'day' : 'days'}`

// ── Machine codes ────────────────────────────────────────────────────────────

/** 8 bytes → 13 symbols + a Crockford mod-37 check symbol, grouped 5-5-4. */
export function formatMachineCode(bytes: Uint8Array): string {
  if (bytes.length !== MACHINE_BYTES) throw new Error('Machine code must be 8 bytes')
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  const check = CHECK_SYMBOLS[Number(n % 37n)]
  const code = base32Encode(bytes) + check
  return `${code.slice(0, 5)}-${code.slice(5, 10)}-${code.slice(10)}`
}

export function parseMachineCode(input: string): Uint8Array | null {
  const s = normaliseCode(input)
  if (s.length !== 14) return null
  const bytes = base32Decode(s.slice(0, 13), MACHINE_BYTES)
  if (!bytes) return null
  return formatMachineCode(bytes).replace(/-/g, '') === s ? bytes : null
}
