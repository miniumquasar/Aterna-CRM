/**
 * Licence engine — pure functions, no I/O, no clock.
 *
 * Stacking rule (the business rule, in one line):
 *   each key starts at max(end of the previous licence, the key's issue date)
 *   and runs for its full term.
 *
 *  - Paid early: the new year starts when the current one ends, so nothing is lost.
 *  - Paid after lapsing: the year starts on the issue date (the payment date),
 *    so the customer still gets a full year.
 *  - Keys are ordered by issue date, so the order they are typed in doesn't matter.
 *
 * Everything here derives from signed data (issue date, term) — there is no
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
  machineBound: boolean
}

/** Half-open interval: access from `start` up to, not including, `end`. */
export interface Interval {
  keyId: string
  start: IsoDate
  end: IsoDate
}

export function timeline(keys: readonly TermKey[]): Interval[] {
  const ordered = [...keys].sort((a, b) =>
    a.issuedOn.localeCompare(b.issuedOn) || a.signingKeyId - b.signingKeyId || a.serial - b.serial)
  const out: Interval[] = []
  let previousEnd: IsoDate | null = null
  for (const k of ordered) {
    const start: IsoDate = previousEnd !== null && previousEnd > k.issuedOn ? previousEnd : k.issuedOn
    const end = k.term.unit === 'months' ? addMonths(start, k.term.amount) : addDays(start, k.term.amount)
    out.push({ keyId: k.id, start, end })
    previousEnd = end
  }
  return out
}

export type LicenceStateName = 'trial' | 'licensed' | 'trial_expired' | 'expired'

export interface EngineStatus {
  state: LicenceStateName
  active: boolean
  /** Last day of access, inclusive. */
  validUntil: IsoDate | null
  /** Days of access left, counting today. 0 when inactive. */
  daysRemaining: number
  remind: boolean
  trialStartedOn: IsoDate | null
  /** Last trial day, inclusive. */
  trialEndsOn: IsoDate | null
  /** A paid period that has not started yet (key issued with a future date). */
  pendingFrom: IsoDate | null
  intervals: Interval[]
}

export function computeStatus(input: {
  keys: readonly TermKey[]
  trialStartedOn: IsoDate | null
  today: IsoDate
  trialDays: number
  reminderDays: number
}): EngineStatus {
  const { today } = input
  const intervals = timeline(input.keys)
  const trialEnd = input.trialStartedOn ? addDays(input.trialStartedOn, input.trialDays) : null
  const pendingFrom = intervals.find((i) => i.start > today)?.start ?? null
  const base = {
    trialStartedOn: input.trialStartedOn,
    trialEndsOn: trialEnd ? addDays(trialEnd, -1) : null,
    pendingFrom,
    intervals
  }

  const currentIndex = intervals.findIndex((i) => i.start <= today && today < i.end)
  if (currentIndex >= 0) {
    // Extend across back-to-back periods so "valid until" is the real last day.
    let runEnd = intervals[currentIndex].end
    for (let i = currentIndex + 1; i < intervals.length && intervals[i].start <= runEnd; i += 1) {
      if (intervals[i].end > runEnd) runEnd = intervals[i].end
    }
    const days = daysBetween(today, runEnd)
    return { ...base, state: 'licensed', active: true, validUntil: addDays(runEnd, -1), daysRemaining: days, remind: days <= input.reminderDays }
  }

  if (trialEnd && today < trialEnd) {
    const days = Math.min(daysBetween(today, trialEnd), input.trialDays)
    return { ...base, state: 'trial', active: true, validUntil: addDays(trialEnd, -1), daysRemaining: days, remind: days <= input.reminderDays }
  }

  const lastEnd = intervals.filter((i) => i.end <= today).map((i) => i.end).sort().at(-1) ?? null
  return {
    ...base,
    state: intervals.length ? 'expired' : 'trial_expired',
    active: false,
    validUntil: lastEnd ? addDays(lastEnd, -1) : base.trialEndsOn,
    daysRemaining: 0,
    remind: false
  }
}
