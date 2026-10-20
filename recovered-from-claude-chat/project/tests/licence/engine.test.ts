import { describe, expect, it } from 'vitest'
import { computeStatus, timeline, type TermKey } from '../../src/main/licence/engine'

const key = (n: number, startsOn: string, o: { issuedOn?: string; term?: TermKey['term']; firm?: string } = {}): TermKey => ({
  id: `0:${n}`, signingKeyId: 0, serial: n, term: o.term ?? { unit: 'months', amount: 12 }, issuedOn: o.issuedOn ?? startsOn, startsOn,
  machineBound: false, firm: o.firm ?? 'Made Up Accountants Ltd'
})
const at = (keys: TermKey[], today: string, trialStartedOn = '2025-01-01') =>
  computeStatus({ keys, trialStartedOn, today, trialDays: 60, reminderDays: 30, graceDays: 3 })

describe('what each key covers', () => {
  it('runs a full year from the start date in the key, naming the firm', () => {
    expect(at([key(1, '2026-10-02')], '2026-10-02'))
      .toMatchObject({ state: 'licensed', validUntil: '2027-10-01', daysRemaining: 365, remind: false, licensedTo: 'Made Up Accountants Ltd' })
  })
  it('an early renewal starts where the current year ends, so nothing is lost', () => {
    // issued in August, starting the day after the current licence ends
    const s = at([key(1, '2026-10-02'), key(2, '2027-10-02', { issuedOn: '2027-08-01' })], '2027-08-01')
    expect(s.intervals[1]).toEqual({ keyId: '0:2', start: '2027-10-02', end: '2028-10-02' })
    expect(s.validUntil).toBe('2028-10-01')
  })
  it('a new PC needs only the current key: each key carries its own dates', () => {
    expect(at([key(2, '2027-10-02', { issuedOn: '2027-08-01' })], '2027-11-01', '2027-11-01')).toMatchObject({ state: 'licensed', validUntil: '2028-10-01' })
  })
  it('gives the same result whatever order keys are entered in', () => {
    const keys = [key(1, '2026-10-02'), key(2, '2027-10-02'), key(3, '2028-10-02')]
    expect(timeline([...keys].reverse())).toEqual(timeline(keys))
  })
  it('supports day-based keys', () => {
    expect(at([key(1, '2026-10-02', { term: { unit: 'days', amount: 30 } })], '2026-10-02').validUntil).toBe('2026-10-31')
  })
  it('shows the newest name when a firm’s key was replaced after a change of name', () => {
    const old = key(1, '2026-10-02', { firm: 'Old Name Ltd' })
    const renamed = key(9, '2026-10-02', { issuedOn: '2027-03-01', firm: 'New Name Ltd' })
    expect(at([renamed, old], '2027-03-02')).toMatchObject({ licensedTo: 'New Name Ltd', validUntil: '2027-10-01' }) // same dates: no extra time
  })
})

describe('reminders, grace and expiry', () => {
  it('reminds at 30 days or fewer, not 31', () => {
    expect(at([key(1, '2026-10-02')], '2027-09-01')).toMatchObject({ daysRemaining: 31, remind: false })
    expect(at([key(1, '2026-10-02')], '2027-09-02')).toMatchObject({ daysRemaining: 30, remind: true })
  })
  it('keeps everything working for 3 days after a licence ends, then goes read-only', () => {
    const k = [key(1, '2026-10-02')] // last day 1 October 2027
    expect(at(k, '2027-10-01')).toMatchObject({ state: 'licensed', daysRemaining: 1, graceEndsOn: '2027-10-04' })
    expect(at(k, '2027-10-02')).toMatchObject({ state: 'grace', active: true, validUntil: '2027-10-01', graceEndsOn: '2027-10-04', daysRemaining: 3, remind: true })
    expect(at(k, '2027-10-04')).toMatchObject({ state: 'grace', active: true, daysRemaining: 1 })
    expect(at(k, '2027-10-05')).toMatchObject({ state: 'expired', active: false, validUntil: '2027-10-01', daysRemaining: 0, licensedTo: 'Made Up Accountants Ltd' })
  })
  it('gives a 60-day trial with no grace, reminds in its last 30 days, then goes read-only', () => {
    expect(at([], '2026-10-02', '2026-10-02')).toMatchObject({ state: 'trial', daysRemaining: 60, validUntil: '2026-11-30', remind: false, licensedTo: null })
    expect(at([], '2026-10-31', '2026-10-02')).toMatchObject({ daysRemaining: 31, remind: false })
    expect(at([], '2026-11-01', '2026-10-02')).toMatchObject({ daysRemaining: 30, remind: true })
    expect(at([], '2026-12-01', '2026-10-02')).toMatchObject({ state: 'trial_expired', active: false, graceEndsOn: null })
  })
  it('reports a paid period that hasn’t started yet, and whose it is', () => {
    expect(at([key(1, '2026-12-01')], '2026-10-02', '2026-10-01')).toMatchObject({ state: 'trial', pendingFrom: '2026-12-01', licensedTo: 'Made Up Accountants Ltd' })
    expect(at([key(1, '2025-01-01')], '2026-03-01')).toMatchObject({ state: 'expired', active: false, validUntil: '2025-12-31' })
  })
})
