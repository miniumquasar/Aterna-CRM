import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  addYears,
  civilDate,
  compareDates,
  dayOfWeek,
  daysBetween,
  endOfMonth,
  formatCivilDate,
  formatInstant,
  instantToLondonDate,
  isCivilDate,
  isLastDayOfMonth,
  parseCivilDate,
  todayInLondon
} from '@shared/domain/dates'

describe('civil dates', () => {
  it.each([
    ['2026-10-20', true],
    ['2024-02-29', true],
    ['2026-02-29', false],
    ['1900-02-29', false],
    ['2000-02-29', true],
    ['2026-04-31', false],
    ['2026-13-01', false],
    ['2026-1-01', false],
    ['20-10-2026', false],
    ['', false]
  ])('%s is a date: %s', (text, valid) => {
    expect(isCivilDate(text)).toBe(valid)
  })

  it('parses and builds', () => {
    expect(parseCivilDate('2026-10-20')).toEqual({ year: 2026, month: 10, day: 20 })
    expect(parseCivilDate(20261020)).toBeNull()
    expect(civilDate(2026, 3, 9)).toBe('2026-03-09')
    expect(() => civilDate(2026, 2, 30)).toThrow(RangeError)
  })

  it('knows today in the UK, whatever the instant’s UTC date', () => {
    // 23:30 UTC on 29 March 2026 is 00:30 BST on 30 March.
    expect(todayInLondon(new Date('2026-03-29T23:30:00Z'))).toBe('2026-03-30')
    // In winter, UK time is UTC.
    expect(todayInLondon(new Date('2026-01-15T23:59:59Z'))).toBe('2026-01-15')
    // The night the clocks go back.
    expect(instantToLondonDate('2026-10-24T23:30:00Z')).toBe('2026-10-25')
    expect(instantToLondonDate('2026-10-25T23:30:00Z')).toBe('2026-10-25')
  })

  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2026-05-15', 9, '2027-02-15'],
    ['2026-12-31', 1, '2027-01-31'],
    ['2026-08-31', -12, '2025-08-31'],
    ['2026-06-30', 9, '2027-03-30']
  ])('%s + %i months = %s (clamped)', (from, months, to) => {
    expect(addMonths(from, months)).toBe(to)
  })

  it.each([
    // Companies House: a year end on a month’s last day files by the last day of the month nine months on.
    ['2026-06-30', 9, '2027-03-31'],
    ['2026-02-28', 12, '2027-02-28'],
    ['2027-02-28', 12, '2028-02-29'],
    ['2026-09-30', 3, '2026-12-31'],
    ['2026-06-15', 9, '2027-03-15']
  ])('%s + %i months = %s (month end kept)', (from, months, to) => {
    expect(addMonths(from, months, { monthEnd: 'keep' })).toBe(to)
  })

  it('adds days and years and measures between dates', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30') // across the clocks going forward
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28')
    expect(daysBetween('2026-10-20', '2026-10-27')).toBe(7)
    expect(daysBetween('2026-10-27', '2026-10-20')).toBe(-7)
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31)
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365)
    expect(compareDates('2026-01-02', '2026-01-10')).toBe(-1)
    expect(compareDates('2026-01-10', '2026-01-10')).toBe(0)
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError)
  })

  it('knows month ends and weekdays', () => {
    expect(endOfMonth('2028-02-03')).toBe('2028-02-29')
    expect(isLastDayOfMonth('2026-04-30')).toBe(true)
    expect(isLastDayOfMonth('2026-05-30')).toBe(false)
    expect(dayOfWeek('2026-10-20')).toBe(2) // a Tuesday
    expect(dayOfWeek('1970-01-01')).toBe(4)
  })

  it('formats the UK way', () => {
    expect(formatCivilDate('2026-10-20')).toBe('20 Oct 2026')
    expect(formatCivilDate('2026-09-05')).toBe('5 Sep 2026')
    expect(formatCivilDate('2026-10-20', 'long')).toBe('20 October 2026')
    expect(formatCivilDate('2026-10-20', 'weekday')).toBe('Tue 20 Oct 2026')
    expect(formatCivilDate(null)).toBe('—')
    expect(formatCivilDate('nonsense', 'short', '')).toBe('')
    expect(formatInstant('2026-07-01T14:05:00Z')).toBe('1 Jul 2026, 15:05')
    expect(formatInstant('2026-12-01T14:05:00Z', { time: false })).toBe('1 Dec 2026')
    expect(formatInstant('not a time')).toBe('—')
  })
})
