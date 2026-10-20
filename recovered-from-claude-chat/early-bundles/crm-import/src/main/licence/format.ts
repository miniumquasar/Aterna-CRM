/**
 * Licence key format v1 — shared by the app (verifies) and the vendor
 * generator (signs). Pure functions; no I/O.
 *
 * A key is 80 bytes written as 128 Crockford base32 characters, shown as
 * 16 groups of 8. Crockford base32 ignores case and treats O as 0 and I/L
 * as 1, so keys survive being read aloud or retyped.
 *
 * Signed payload (16 bytes)
 *   0      format version (high nibble, = 1) | signing-key id (low nibble, 0–15)
 *   1      product (high nibble, 1 = CRM)    | key type (low nibble: 1 term, 2 clock reset)
 *   2      term unit (bit 7: 0 months, 1 days) | term amount (bits 0–6, 1–127)
 *   3–5    serial number, 24-bit, unique per signing key
 *   6–7    issue date, days since 2024-01-01 (big-endian)
 *   8–15   machine code (64-bit); all zeros = valid on any computer
 * Signature (64 bytes): Ed25519 over "AETERNA-CRM/licence/v1\0" ‖ payload
 *
 * Why 128 characters and not 48: 48 base32 characters hold 240 bits, and an
 * Ed25519 signature alone is 512 bits. A shorter key can only be checked
 * with a secret embedded in the app — and anything embedded in the app can
 * be extracted and used to mint keys.
 */

export const FORMAT_VERSION = 1
export const PRODUCT_CRM = 1
export const PAYLOAD_BYTES = 16
export const SIGNATURE_BYTES = 64
export const KEY_BYTES = PAYLOAD_BYTES + SIGNATURE_BYTES
export const KEY_CHARS = 128
export const MACHINE_BYTES = 8
export const SIGNING_DOMAIN = 'AETERNA-CRM/licence/v1\0'

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
  /** YYYY-MM-DD */
  issuedOn: string
  /** 8 bytes, or null when the key works on any computer. */
  machine: Uint8Array | null
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

// ── Payload ──────────────────────────────────────────────────────────────────

export function encodePayload(p: LicencePayload): Uint8Array {
  const day = dayNumber(p.issuedOn)
  const typeCode = p.type === 'term' ? 1 : 2
  if (p.signingKeyId < 0 || p.signingKeyId > 15) throw new Error('Signing key id must be 0–15')
  if (p.serial < 1 || p.serial > 0xffffff) throw new Error('Serial must be 1–16777215')
  if (p.term.amount < 1 || p.term.amount > 127) throw new Error('Term must be 1–127 months or days')
  if (day < 0 || day > 0xffff) throw new Error('Issue date out of range')
  if (p.machine && p.machine.length !== MACHINE_BYTES) throw new Error('Machine code must be 8 bytes')
  const b = new Uint8Array(PAYLOAD_BYTES)
  b[0] = (p.version << 4) | p.signingKeyId
  b[1] = (p.product << 4) | typeCode
  b[2] = (p.term.unit === 'days' ? 0x80 : 0) | p.term.amount
  b[3] = (p.serial >>> 16) & 255
  b[4] = (p.serial >>> 8) & 255
  b[5] = p.serial & 255
  b[6] = (day >>> 8) & 255
  b[7] = day & 255
  if (p.machine) b.set(p.machine, 8)
  return b
}

export type PayloadProblem = 'unsupported_version' | 'wrong_product' | 'unknown_type' | 'bad_term' | 'bad_serial'

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
  const machine = b.slice(8, 16)
  return {
    payload: {
      version,
      signingKeyId: b[0] & 15,
      product,
      type: typeCode === 1 ? 'term' : 'clock_reset',
      term: { unit: b[2] & 0x80 ? 'days' : 'months', amount },
      serial,
      issuedOn: dateFromDayNumber((b[6] << 8) | b[7]),
      machine: machine.some((x) => x !== 0) ? machine : null
    }
  }
}

export function signingInput(payload: Uint8Array): Uint8Array {
  const domain = new TextEncoder().encode(SIGNING_DOMAIN)
  const out = new Uint8Array(domain.length + payload.length)
  out.set(domain)
  out.set(payload, domain.length)
  return out
}

// ── Keys ─────────────────────────────────────────────────────────────────────

export function assembleKey(payload: Uint8Array, signature: Uint8Array): string {
  if (payload.length !== PAYLOAD_BYTES || signature.length !== SIGNATURE_BYTES) throw new Error('Bad key parts')
  const bytes = new Uint8Array(KEY_BYTES)
  bytes.set(payload)
  bytes.set(signature, PAYLOAD_BYTES)
  return group(base32Encode(bytes), 8)
}

/** Splits a typed or pasted key into its parts; null if it cannot be a v1 key. */
export function splitKey(input: string): { canonical: string; payload: Uint8Array; signature: Uint8Array } | null {
  const canonical = normaliseCode(input)
  if (canonical.length !== KEY_CHARS) return null
  const bytes = base32Decode(canonical, KEY_BYTES)
  if (!bytes) return null
  return { canonical, payload: bytes.slice(0, PAYLOAD_BYTES), signature: bytes.slice(PAYLOAD_BYTES) }
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
