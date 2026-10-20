/**
 * Issue register: one JSON line per event — a key issued, or a key withdrawn —
 * hash-chained like a ledger. Each line's hash covers the previous line's hash,
 * so editing or deleting any past line is detected the next time the register
 * is read.
 *
 * An account is one firm's run of keys, named after its first key ("0:12").
 * Renewals and replacements carry the account forward, so a firm that changes
 * its name keeps its history and its renewal date.
 *
 * Lines written by the first version of this tool (format 1 keys, no `v`) are
 * still read and verified; their keys need replacing, and `list` says so.
 */
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'

export interface KeyRecord {
  v: 2
  seq: number
  kind: 'key'
  keyId: number
  serial: number
  type: 'term' | 'clock_reset'
  /** e.g. { unit: 'months', amount: 12 } */
  term: { unit: 'months' | 'days'; amount: number }
  issuedOn: string
  /** First day covered. */
  startsOn: string
  /** Last day covered, inclusive. */
  validUntil: string
  machineCode: string | null
  firm: string
  /** The account: `${keyId}:${serial}` of this firm's first key. */
  account: string
  /** The serial this key replaces (a change of name, a new signing key). */
  replaces: number | null
  reference: string | null
  key: string
  createdAt: string
  prevHash: string
  hash: string
}

export interface RevocationRecord {
  v: 2
  seq: number
  kind: 'revocation'
  keyId: number
  serial: number
  reason: string
  createdAt: string
  prevHash: string
  hash: string
}

/** A line from the first version of the tool. */
export interface LegacyRecord {
  seq: number
  keyId: number
  serial: number
  type: 'term' | 'clock_reset'
  term: string
  issuedOn: string
  machineCode: string | null
  customer: string
  reference: string | null
  key: string
  createdAt: string
  prevHash: string
  hash: string
}

export type RegisterRecord = KeyRecord | RevocationRecord | LegacyRecord

export type NewKeyRecord = Omit<KeyRecord, 'v' | 'seq' | 'kind' | 'prevHash' | 'hash'>
export type NewRevocation = Omit<RevocationRecord, 'v' | 'seq' | 'kind' | 'prevHash' | 'hash'>

const GENESIS = '0'.repeat(64)
const LEGACY_FIELDS: Array<keyof LegacyRecord> = ['seq', 'keyId', 'serial', 'type', 'term', 'issuedOn', 'machineCode', 'customer', 'reference', 'key', 'createdAt', 'prevHash']

const isV2 = (r: RegisterRecord): r is KeyRecord | RevocationRecord => (r as { v?: number }).v === 2
export const isKey = (r: RegisterRecord): r is KeyRecord => isV2(r) && r.kind === 'key'
export const isRevocation = (r: RegisterRecord): r is RevocationRecord => isV2(r) && r.kind === 'revocation'
export const isLegacy = (r: RegisterRecord): r is LegacyRecord => !isV2(r)

/** Every field but the hash, in name order: adding a field later can't change an old line's hash. */
function digest(r: Omit<RegisterRecord, 'hash'>): string {
  const body = isV2(r as RegisterRecord)
    ? Object.keys(r).filter((k) => k !== 'hash').sort().map((k) => [k, (r as Record<string, unknown>)[k]])
    : LEGACY_FIELDS.map((f) => (r as Record<string, unknown>)[f])
  return createHash('sha256').update(JSON.stringify(body)).digest('hex')
}

export function readRegister(path: string): RegisterRecord[] {
  if (!existsSync(path)) return []
  const out: RegisterRecord[] = []
  let prev = GENESIS
  readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
    if (!line.trim()) return
    let r: RegisterRecord
    try {
      r = JSON.parse(line) as RegisterRecord
    } catch {
      throw new Error(`Register line ${i + 1} is not valid JSON — the register has been damaged`)
    }
    const { hash, ...rest } = r
    if (r.prevHash !== prev || digest(rest) !== hash || r.seq !== out.length + 1) {
      throw new Error(`Register line ${i + 1} fails its integrity check — the register has been edited`)
    }
    prev = hash
    out.push(r)
  })
  return out
}

function append<T extends RegisterRecord>(path: string, record: Omit<T, 'seq' | 'prevHash' | 'hash'>): T {
  const existing = readRegister(path)
  const base = { ...record, seq: existing.length + 1, prevHash: existing.at(-1)?.hash ?? GENESIS }
  const full = { ...base, hash: digest(base as Omit<RegisterRecord, 'hash'>) } as T
  appendFileSync(path, `${JSON.stringify(full)}\n`, { mode: 0o600 })
  return full
}

export const appendKey = (path: string, r: NewKeyRecord): KeyRecord => append<KeyRecord>(path, { v: 2, kind: 'key', ...r })
export const appendRevocation = (path: string, r: NewRevocation): RevocationRecord => append<RevocationRecord>(path, { v: 2, kind: 'revocation', ...r })

/** The next serial for a signing key: one more than any serial it has issued. */
export const nextSerial = (records: readonly RegisterRecord[], keyId: number): number =>
  records.filter((r) => !isRevocation(r) && r.keyId === keyId).reduce((m, r) => Math.max(m, r.serial), 0) + 1

/** `${keyId}:${serial}` of every withdrawn key, with why. */
export function revocations(records: readonly RegisterRecord[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of records) if (isRevocation(r)) out.set(`${r.keyId}:${r.serial}`, r.reason)
  return out
}

/** The key records of one account, oldest first. */
export const accountKeys = (records: readonly RegisterRecord[], account: string): KeyRecord[] =>
  records.filter((r): r is KeyRecord => isKey(r) && r.account === account)
