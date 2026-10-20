/**
 * Licence engine — pure functions, no I/O, no clock.
 *
 * Each key says which days it covers: from its start date for its full term.
 * The vendor sets the start date when issuing it — for a renewal, the day after
 * the firm's current licence ends — so renewing early never loses time, and the
 * same key gives the same answer on every PC.
 *
 *   licensed   a key covers today
 *   trial      the 60 days from the first run on this PC
 *   grace      the 3 days after a licence ends: everything still works, with a banner
 *   expired / trial_expired
 *              read-only: everything stays viewable and exportable
 *
 * Everything here derives from signed data (start date, term) — there is no
 * locally stored date that could be edited to gain time.
 */

import { addDays, addMonths, daysBetween, type IsoDate } from '../import/core/rules'
import type { Term } from './format'

export interface TermKey {
  id: string
  signingKeyId: number
  serial: number
  term: Term
  issuedOn: IsoDate
  startsOn: IsoDate
  machineBound: boolean
  /** The licensed firm, as signed in the key. */
  firm: string
}

/** Half-open interval: access from `start` up to, not including, `end`. */
export interface Interval {
  keyId: string
  start: IsoDate
  end: IsoDate
}

export const endOf = (start: IsoDate, term: Term): IsoDate => (term.unit === 'months' ? addMonths(start, term.amount) : addDays(start, term.amount))

/** The days each key covers, earliest first. The order keys were entered in never matters. */
export function timeline(keys: readonly TermKey[]): Interval[] {
  return keys
    .map((k) => ({ keyId: k.id, start: k.startsOn, end: endOf(k.startsOn, k.term) }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.keyId.localeCompare(b.keyId))
}

export type LicenceStateName = 'trial' | 'licensed' | 'grace' | 'trial_expired' | 'expired'

export interface EngineStatus {
  state: LicenceStateName
  active: boolean
  /** Last day of the licence or trial, inclusive. */
  validUntil: IsoDate | null
  /** Days of access left, counting today — during grace, days of grace left. 0 when inactive. */
  daysRemaining: number
  remind: boolean
  trialStartedOn: IsoDate | null
  /** Last trial day, inclusive. */
  trialEndsOn: IsoDate | null
  /** A paid period that has not started yet. */
  pendingFrom: IsoDate | null
  /** Last day of grace after the licence ended, inclusive. */
  graceEndsOn: IsoDate | null
  /** The firm named in the key that applies now (or applied last, or applies next). */
  licensedTo: string | null
  intervals: Interval[]
}

/** The most recently issued key among these: a replacement key (a firm's new name) wins. */
function newest(keys: readonly TermKey[]): TermKey | null {
  return [...keys].sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.signingKeyId - a.signingKeyId || b.serial - a.serial)[0] ?? null
}

export function computeStatus(input: {
  keys: readonly TermKey[]
  trialStartedOn: IsoDate | null
  today: IsoDate
  trialDays: number
  reminderDays: number
  graceDays: number
}): EngineStatus {
  const { today, keys } = input
  const intervals = timeline(keys)
  const byId = new Map(keys.map((k) => [k.id, k]))
  const keyOf = (i: Interval): TermKey => byId.get(i.keyId) as TermKey
  const trialEnd = input.trialStartedOn ? addDays(input.trialStartedOn, input.trialDays) : null
  const pending = intervals.filter((i) => i.start > today)
  const base = {
    trialStartedOn: input.trialStartedOn,
    trialEndsOn: trialEnd ? addDays(trialEnd, -1) : null,
    pendingFrom: pending[0]?.start ?? null,
    intervals
  }

  const covering = intervals.filter((i) => i.start <= today && today < i.end)
  if (covering.length) {
    // Run on across back-to-back or overlapping periods, so "valid until" is the real last day.
    let runEnd = covering.map((i) => i.end).sort().at(-1) as IsoDate
    for (const i of intervals) {
      if (i.start > runEnd) break
      if (i.end > runEnd) runEnd = i.end
    }
    const days = daysBetween(today, runEnd)
    return {
      ...base, state: 'licensed', active: true, validUntil: addDays(runEnd, -1), daysRemaining: days, remind: days <= input.reminderDays,
      graceEndsOn: addDays(runEnd, input.graceDays - 1), licensedTo: newest(covering.map(keyOf))?.firm ?? null
    }
  }

  const ended = intervals.filter((i) => i.end <= today)
  const lastEnd = ended.map((i) => i.end).sort().at(-1) ?? null
  const lastFirm = lastEnd ? newest(ended.filter((i) => i.end === lastEnd).map(keyOf))?.firm ?? null : null
  const nextFirm = pending.length ? newest(pending.filter((i) => i.start === pending[0].start).map(keyOf))?.firm ?? null : null

  if (trialEnd && today < trialEnd) {
    const days = Math.min(daysBetween(today, trialEnd), input.trialDays)
    return {
      ...base, state: 'trial', active: true, validUntil: addDays(trialEnd, -1), daysRemaining: days, remind: days <= input.reminderDays,
      graceEndsOn: null, licensedTo: nextFirm ?? lastFirm
    }
  }

  if (lastEnd) {
    const graceEnd = addDays(lastEnd, input.graceDays)
    if (today < graceEnd) {
      return {
        ...base, state: 'grace', active: true, validUntil: addDays(lastEnd, -1), daysRemaining: daysBetween(today, graceEnd), remind: true,
        graceEndsOn: addDays(graceEnd, -1), licensedTo: lastFirm
      }
    }
    return {
      ...base, state: 'expired', active: false, validUntil: addDays(lastEnd, -1), daysRemaining: 0, remind: false,
      graceEndsOn: addDays(graceEnd, -1), licensedTo: lastFirm
    }
  }

  return { ...base, state: 'trial_expired', active: false, validUntil: base.trialEndsOn, daysRemaining: 0, remind: false, graceEndsOn: null, licensedTo: nextFirm }
}
