/**
 * Licence service — verifies keys, applies them, and reports status.
 * Electron-free (storage and clock are injected), so it is fully unit-tested.
 */

import type { KeyObject } from 'node:crypto'
import type { LicenceActivation, LicenceErrorCode, LicenceStatus } from '@shared/types'
import { addDays, todayIso, type IsoDate } from '../import/core/rules'
import { publicKeyFromRaw, fromBase64Url, verifyEd25519 } from './ed25519'
import { computeStatus, endOf, type TermKey } from './engine'
import { decodePayload, formatMachineCode, isLegacyKey, signingInput, splitKey, termLabel, type LicencePayload } from './format'
import { machineCodeBytes } from './machine'
import { merge, open, seal, stateKey, TRIAL_FORFEITED, type MarkerSink, type Markers } from './store'

export const TRIAL_DAYS = 60
export const REMINDER_DAYS = 30
/** After a licence ends: this many days with a banner, then read-only. */
export const GRACE_DAYS = 3
const CLOCK_TOLERANCE_HOURS = 48
const CACHE_MS = 10 * 60_000
const HOUR_MS = 3_600_000

export class LicenceError extends Error {
  constructor(readonly code: LicenceErrorCode, message: string) {
    super(message)
    this.name = 'LicenceError'
  }
}

export interface LicenceServiceOptions {
  sinks: MarkerSink[]
  machineId: string
  /** Signing-key id → base64url raw Ed25519 public key. */
  trustedKeys: Readonly<Record<number, string>>
  /** `${signingKeyId}:${serial}` of withdrawn keys. */
  revoked?: ReadonlySet<string>
  now?: () => Date
  trialDays?: number
  reminderDays?: number
  graceDays?: number
  log?: (message: string) => void
}

interface VerifiedKey {
  id: string
  canonical: string
  payload: LicencePayload
}

interface Evaluation {
  status: LicenceStatus
  markers: Markers
  effective: Date
}

/** The start of the hour: the latest-time-seen mark is kept to the hour, so it is saved at most hourly. */
const hourOf = (d: Date): string => new Date(Math.floor(d.getTime() / HOUR_MS) * HOUR_MS).toISOString()

export class LicenceService {
  readonly machineCode: string
  private readonly machine: Uint8Array
  private readonly sealKey: Buffer
  private readonly signers = new Map<number, KeyObject>()
  private readonly revoked: ReadonlySet<string>
  private readonly now: () => Date
  private readonly trialDays: number
  private readonly reminderDays: number
  private readonly graceDays: number
  private readonly log: (message: string) => void
  /** What each copy held when last read or written, so an unchanged copy is not written again. */
  private readonly lastSeen = new Map<string, string | null>()
  private cache: { status: LicenceStatus; at: number } | null = null

  constructor(private readonly opts: LicenceServiceOptions) {
    this.machine = machineCodeBytes(opts.machineId)
    this.machineCode = formatMachineCode(this.machine)
    this.sealKey = stateKey(opts.machineId)
    this.revoked = opts.revoked ?? new Set()
    this.now = opts.now ?? (() => new Date())
    this.trialDays = opts.trialDays ?? TRIAL_DAYS
    this.reminderDays = opts.reminderDays ?? REMINDER_DAYS
    this.graceDays = opts.graceDays ?? GRACE_DAYS
    this.log = opts.log ?? ((m) => console.warn(`[licence] ${m}`))
    for (const [id, key] of Object.entries(opts.trustedKeys)) {
      try {
        this.signers.set(Number(id), publicKeyFromRaw(fromBase64Url(key)))
      } catch {
        this.log(`trusted key ${id} is not a valid Ed25519 public key — ignored`)
      }
    }
  }

  // ── public API ─────────────────────────────────────────────────────────────

  status(): LicenceStatus {
    const ev = this.evaluate()
    this.save({ ...ev.markers, highWater: hourOf(ev.effective) }, false)
    return ev.status
  }

  /** Cheap check for the IPC write gate; recomputes at most every 10 minutes or when the day changes. */
  isActive(): boolean {
    const c = this.cache
    const fresh = c && this.now().getTime() - c.at < CACHE_MS && c.status.today === todayIso(this.now())
    return (fresh ? c.status : this.status()).active
  }

  activate(input: string): LicenceActivation {
    const key = this.verify(input)
    const before = this.evaluate()
    const markers = before.markers
    const existing = this.storedIds(markers.keys)
    if (existing.has(key.id)) {
      throw existing.get(key.id) === key.canonical
        ? new LicenceError('already_used', 'This key has already been entered on this computer.')
        : new LicenceError('serial_conflict', 'A different key with the same serial number is already entered here. Contact your supplier.')
    }
    markers.keys = [...markers.keys, key.canonical]

    if (key.payload.type === 'clock_reset') {
      if (!key.payload.machine) throw new LicenceError('invalid', 'Clock reset keys must be issued for this computer.')
      this.save({ ...markers, highWater: hourOf(this.now()) }, true)
      const after = this.evaluate()
      return {
        kind: 'clock_reset', added: 'Clock check reset', previousValidUntil: before.status.validUntil, newValidUntil: after.status.validUntil,
        licensedTo: after.status.licensedTo, status: after.status
      }
    }

    this.save({ ...markers, highWater: hourOf(before.effective) }, true)
    const after = this.evaluate()
    return {
      kind: 'term',
      added: termLabel(key.payload.term),
      previousValidUntil: before.status.state === 'licensed' || before.status.state === 'grace' ? before.status.validUntil : null,
      newValidUntil: after.status.validUntil,
      licensedTo: key.payload.firm,
      status: after.status
    }
  }

  /** Returns the status once per day while a reminder is due, otherwise null. */
  takeReminder(): LicenceStatus | null {
    const ev = this.evaluate()
    if (!ev.status.remind || ev.markers.lastReminderOn === ev.status.today) return null
    this.save({ ...ev.markers, lastReminderOn: ev.status.today, highWater: hourOf(ev.effective) }, false)
    return ev.status
  }

  // ── verification ──────────────────────────────────────────────────────────

  verify(input: string): VerifiedKey {
    const parts = splitKey(input)
    if (!parts) {
      if (isLegacyKey(input)) {
        throw new LicenceError('unsupported_version', 'This key is in an older format, which doesn’t name your firm. Ask your supplier for a replacement key — it costs nothing.')
      }
      throw new LicenceError('format', 'That isn’t a complete licence key. Paste the whole key from your licence email; dashes and spaces don’t matter.')
    }
    if (this.signers.size === 0) {
      throw new LicenceError('not_configured', 'This copy of the app has no licence verification key configured. Contact your supplier.')
    }
    const signingKeyId = parts.payload[0] & 15
    const signer = this.signers.get(signingKeyId)
    if (!signer) {
      throw (parts.payload[0] >> 4) === 2
        ? new LicenceError('untrusted_signer', 'This key was issued under a signing key this version does not trust. Update the app or contact your supplier.')
        : new LicenceError('invalid', 'This key is not valid. Check it was copied exactly.')
    }
    if (!verifyEd25519(signer, signingInput(parts.payload), parts.signature)) {
      throw new LicenceError('invalid', 'This key is not valid. Check it was copied exactly.')
    }
    // Only authentic keys reach the content checks, so typos never produce misleading messages.
    const decoded = decodePayload(parts.payload)
    if ('problem' in decoded) {
      if (decoded.problem === 'unsupported_version') throw new LicenceError('unsupported_version', 'This key needs a newer version of the app.')
      if (decoded.problem === 'wrong_product') throw new LicenceError('wrong_product', 'This key is for a different product.')
      throw new LicenceError('invalid', 'This key is not valid. Contact your supplier.')
    }
    const payload = decoded.payload
    const id = `${payload.signingKeyId}:${payload.serial}`
    if (this.revoked.has(id)) throw new LicenceError('revoked', 'This key has been withdrawn. Contact your supplier.')
    if (payload.machine && !payload.machine.every((b, i) => b === this.machine[i])) {
      throw new LicenceError('other_machine', `This key was issued for a different computer. This computer's machine code is ${this.machineCode}.`)
    }
    return { id, canonical: parts.canonical, payload }
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private storedIds(keys: string[]): Map<string, string> {
    const ids = new Map<string, string>()
    for (const k of keys) {
      const p = splitKey(k)
      if (p) ids.set(`${p.payload[0] & 15}:${(p.payload[3] << 16) | (p.payload[4] << 8) | p.payload[5]}`, p.canonical)
    }
    return ids
  }

  private load(): { markers: Markers; tampered: boolean } {
    const copies = this.opts.sinks.map((s) => {
      try {
        const text = s.read()
        this.lastSeen.set(s.name, text)
        return open(text, this.sealKey, s.name)
      } catch (err) {
        this.log(`could not read ${s.name}: ${(err as Error).message}`)
        this.lastSeen.delete(s.name)
        return null
      }
    })
    const merged = merge(copies)
    if (merged.tampered) this.log('a licence state copy failed its integrity check')
    return merged
  }

  private save(markers: Markers, mustSucceed: boolean): void {
    const text = seal(markers, this.sealKey)
    let written = 0
    for (const s of this.opts.sinks) {
      if (this.lastSeen.get(s.name) === text) {
        written += 1 // already holds exactly this
        continue
      }
      try {
        s.write(text)
        this.lastSeen.set(s.name, text)
        written += 1
      } catch (err) {
        this.log(`could not write ${s.name}: ${(err as Error).message}`)
      }
    }
    if (mustSucceed && written === 0) {
      throw new LicenceError('storage', 'The licence could not be saved on this computer. Check disk space and permissions, then try again.')
    }
  }

  private evaluate(): Evaluation {
    const { markers, tampered } = this.load()
    const nowDate = this.now()
    const highWater = markers.highWater ? Date.parse(markers.highWater) : Number.NaN
    const effective = new Date(Number.isFinite(highWater) ? Math.max(nowDate.getTime(), highWater) : nowDate.getTime())
    const clockWarning = Number.isFinite(highWater) && highWater - nowDate.getTime() > CLOCK_TOLERANCE_HOURS * HOUR_MS
    const today = todayIso(effective)
    if (!markers.trialStartedOn) markers.trialStartedOn = today // first run on this computer

    const termKeys: TermKey[] = []
    const labels = new Map<string, LicencePayload>()
    for (const k of markers.keys) {
      try {
        const v = this.verify(k)
        if (v.payload.type !== 'term') continue
        labels.set(v.id, v.payload)
        termKeys.push({
          id: v.id, signingKeyId: v.payload.signingKeyId, serial: v.payload.serial, term: v.payload.term,
          issuedOn: v.payload.issuedOn as IsoDate, startsOn: v.payload.startsOn as IsoDate, machineBound: v.payload.machine !== null,
          firm: v.payload.firm
        })
      } catch (err) {
        this.log(`stored key ignored: ${(err as LicenceError).code ?? (err as Error).message}`)
      }
    }

    const e = computeStatus({
      keys: termKeys, trialStartedOn: markers.trialStartedOn as IsoDate, today,
      trialDays: this.trialDays, reminderDays: this.reminderDays, graceDays: this.graceDays
    })
    const forfeited = markers.trialStartedOn === TRIAL_FORFEITED
    const status: LicenceStatus = {
      state: e.state,
      active: e.active,
      validUntil: e.validUntil,
      daysRemaining: e.daysRemaining,
      remind: e.remind,
      trialStartedOn: forfeited ? null : e.trialStartedOn,
      trialEndsOn: forfeited ? null : e.trialEndsOn,
      pendingFrom: e.pendingFrom,
      graceEndsOn: e.graceEndsOn,
      licensedTo: e.licensedTo,
      periods: termKeys
        .map((k) => {
          const p = labels.get(k.id) as LicencePayload
          return {
            serial: `${p.signingKeyId ? `${p.signingKeyId}/` : ''}${String(p.serial).padStart(6, '0')}`,
            firm: p.firm, term: termLabel(p.term), issuedOn: p.issuedOn, startsOn: p.startsOn, validUntil: addDays(endOf(k.startsOn, k.term), -1),
            machineBound: p.machine !== null
          }
        })
        .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.serial.localeCompare(b.serial)),
      machineCode: this.machineCode,
      clockWarning,
      stateTampered: forfeited && tampered,
      configured: this.signers.size > 0,
      today
    }
    this.cache = { status, at: nowDate.getTime() }
    return { status, markers, effective }
  }
}
