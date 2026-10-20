/**
 * Local licence state ("markers"), kept in several places at once.
 *
 * Each copy is sealed with an HMAC keyed to this machine, so a copy edited by
 * hand or moved from another computer fails its check. Merge rules never let
 * tampering help the person tampering:
 *   - licence keys: union of every copy (each key proves itself by signature)
 *   - trial start:  earliest valid copy; if the only copies were tampered,
 *                   the trial is treated as used up
 *   - clock high-water mark: latest valid copy, so winding the clock back
 *     cannot recover days
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Database } from 'better-sqlite3-multiple-ciphers'

export interface Markers {
  trialStartedOn: string | null
  /** ISO timestamp: the latest time this installation has seen. */
  highWater: string | null
  /** Canonical licence keys applied on this computer. */
  keys: string[]
  lastReminderOn: string | null
}

export interface MarkerSink {
  readonly name: string
  read(): string | null
  write(text: string): void
}

/** Sentinel trial start meaning "trial used up" after tampering. */
export const TRIAL_FORFEITED = '2000-01-01'

export function stateKey(machineId: string): Buffer {
  return createHash('sha256').update('AETERNA-CRM/state/v1\0').update(machineId).digest()
}

function canonical(m: Markers): string {
  return JSON.stringify({
    trialStartedOn: m.trialStartedOn, highWater: m.highWater, keys: [...m.keys].sort(), lastReminderOn: m.lastReminderOn
  })
}

const mac = (key: Buffer, m: Markers): string => createHmac('sha256', key).update(canonical(m)).digest('base64url')

export function seal(m: Markers, key: Buffer): string {
  return JSON.stringify({ v: 1, data: { ...m, keys: [...m.keys].sort() }, mac: mac(key, m) })
}

export interface OpenedCopy {
  sink: string
  markers: Markers
  valid: boolean
}

/** null = absent or unreadable; valid=false = readable but failed its seal. */
export function open(text: string | null, key: Buffer, sink: string): OpenedCopy | null {
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as { v?: number; data?: Partial<Markers>; mac?: string }
    const d = parsed.data ?? {}
    const markers: Markers = {
      trialStartedOn: typeof d.trialStartedOn === 'string' ? d.trialStartedOn : null,
      highWater: typeof d.highWater === 'string' ? d.highWater : null,
      keys: Array.isArray(d.keys) ? d.keys.filter((k): k is string => typeof k === 'string') : [],
      lastReminderOn: typeof d.lastReminderOn === 'string' ? d.lastReminderOn : null
    }
    const expected = Buffer.from(mac(key, markers))
    const given = Buffer.from(typeof parsed.mac === 'string' ? parsed.mac : '')
    const valid = parsed.v === 1 && given.length === expected.length && timingSafeEqual(given, expected)
    return { sink, markers, valid }
  } catch {
    return { sink, markers: { trialStartedOn: null, highWater: null, keys: [], lastReminderOn: null }, valid: false }
  }
}

export function merge(copies: Array<OpenedCopy | null>): { markers: Markers; tampered: boolean; present: number } {
  const present = copies.filter((c): c is OpenedCopy => c !== null)
  const valid = present.filter((c) => c.valid)
  const tampered = present.length > valid.length
  const pick = (values: Array<string | null>, latest: boolean): string | null => {
    const v = values.filter((x): x is string => !!x).sort()
    return (latest ? v.at(-1) : v[0]) ?? null
  }
  let trialStartedOn = pick(valid.map((c) => c.markers.trialStartedOn), false)
  if (!trialStartedOn && tampered) trialStartedOn = TRIAL_FORFEITED
  return {
    markers: {
      trialStartedOn,
      highWater: pick(valid.map((c) => c.markers.highWater), true),
      keys: [...new Set(present.flatMap((c) => c.markers.keys))].sort(),
      lastReminderOn: pick(valid.map((c) => c.markers.lastReminderOn), true)
    },
    tampered,
    present: present.length
  }
}

// ── Sinks ────────────────────────────────────────────────────────────────────

/** A file written atomically (temp file + rename), so a crash never leaves half a copy. */
export function fileSink(path: string, name = path): MarkerSink {
  return {
    name,
    read() {
      try {
        return readFileSync(path, 'utf8')
      } catch {
        return null
      }
    },
    write(text) {
      mkdirSync(dirname(path), { recursive: true })
      const tmp = `${path}.${process.pid}.tmp`
      writeFileSync(tmp, text)
      renameSync(tmp, path)
    }
  }
}

/** One sealed row in the practice database (table from migration 0009). */
export function dbSink(db: Database): MarkerSink {
  return {
    name: 'database',
    read() {
      const row = db.prepare('SELECT sealed FROM licence_markers WHERE id = 1').get() as { sealed: string } | undefined
      return row?.sealed ?? null
    },
    write(text) {
      db.prepare(`INSERT INTO licence_markers (id, sealed, updated_at) VALUES (1, ?, datetime('now'))
        ON CONFLICT (id) DO UPDATE SET sealed = excluded.sealed, updated_at = excluded.updated_at`).run(text)
    }
  }
}
