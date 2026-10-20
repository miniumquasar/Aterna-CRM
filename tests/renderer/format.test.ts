import { describe, expect, it } from 'vitest'
import { formatCount, formatDate, formatDateTime, formatMoney, formatPercent, formatRelative, initials, plural } from '@renderer/lib/format'

describe('formatting for people', () => {
  it('writes counts, money, dates and plurals the UK way', () => {
    expect(formatCount(1250)).toBe('1,250')
    expect(formatCount(null)).toBe('—')
    expect(formatMoney(125000)).toBe('£1,250.00')
    expect(formatPercent(0.42)).toBe('42%')
    expect(formatDate('2026-10-20')).toBe('20 Oct 2026')
    expect(formatDateTime('2026-10-20T14:36:00Z')).toBe('20 Oct 2026, 15:36')
    expect(plural(1, 'client')).toBe('1 client')
    expect(plural(3, 'client')).toBe('3 clients')
    expect(plural(2, 'company', 'companies')).toBe('2 companies')
  })

  it('says how long ago', () => {
    const now = new Date('2026-10-20T12:00:00Z')
    expect(formatRelative('2026-10-20T11:59:40Z', now)).toBe('just now')
    expect(formatRelative('2026-10-20T11:55:00Z', now)).toBe('5 minutes ago')
    expect(formatRelative('2026-10-20T09:00:00Z', now)).toBe('3 hours ago')
    expect(formatRelative('2026-10-19T09:00:00Z', now)).toBe('yesterday')
    expect(formatRelative('2026-10-01T09:00:00Z', now)).toBe('1 Oct 2026')
  })

  it('makes initials', () => {
    expect(initials('Pat Partner')).toBe('PP')
    expect(initials('Mary Ann de la Cruz')).toBe('MC')
    expect(initials('Cher')).toBe('CH')
    expect(initials('  ')).toBe('?')
  })
})
