import { describe, expect, it } from 'vitest'
import { formatPence, formatPenceNoSymbol, isPence, MAX_PENCE, parsePounds, penceToPounds, sumPence, vatOn } from '../../src/shared/money'

const pence = (input: string | number | null | undefined, allowNegative = false): number | null => {
  const r = parsePounds(input, { allowNegative })
  if (!r.ok) throw new Error(r.error)
  return r.pence
}

describe('money in whole pence', () => {
  it('reads amounts the way people type them', () => {
    expect(pence('1,234.56')).toBe(123456)
    expect(pence('£1234.5')).toBe(123450)
    expect(pence('  95 ')).toBe(9500)
    expect(pence('0.10')).toBe(10)
    expect(pence('.5')).toBe(50)
    expect(pence('5.')).toBe(500)
    expect(pence('1 234.00')).toBe(123400)
    expect(pence('GBP 12')).toBe(1200)
    expect(pence(12.34)).toBe(1234)
    expect(pence(0.1 + 0.2)).toBe(30) // float noise is not a third decimal place
    expect(pence('')).toBeNull()
    expect(pence(null)).toBeNull()
    expect(pence('0')).toBe(0)
  })

  it('reads negatives only where allowed, in either style', () => {
    expect(pence('-12.50', true)).toBe(-1250)
    expect(pence('(12.50)', true)).toBe(-1250)
    expect(pence('-£12.50', true)).toBe(-1250)
    expect(pence('£-12.50', true)).toBe(-1250)
    expect(parsePounds('-12.50')).toEqual({ ok: false, error: 'The amount can’t be below zero.' })
    expect(pence('-0', true)).toBe(0)
    expect(Object.is(pence('-0.00', true), -0)).toBe(false)
  })

  it('refuses rather than guesses', () => {
    expect(parsePounds('12.345')).toMatchObject({ ok: false, error: expect.stringMatching(/two decimal places/) })
    expect(parsePounds(12.345)).toMatchObject({ ok: false })
    expect(parsePounds('1,2345')).toMatchObject({ ok: false })
    expect(parsePounds('twelve')).toMatchObject({ ok: false })
    expect(parsePounds('.')).toMatchObject({ ok: false })
    expect(parsePounds('1e5')).toMatchObject({ ok: false })
    expect(parsePounds(Number.NaN)).toMatchObject({ ok: false })
    expect(parsePounds('1000000000.01')).toMatchObject({ ok: false, error: expect.stringMatching(/more than £1,000,000,000/) })
    expect(pence('1000000000.00')).toBe(MAX_PENCE)
    expect(parsePounds('£12.5x', { label: 'The fee' })).toMatchObject({ ok: false, error: expect.stringMatching(/^The fee/) })
  })

  it('shows pounds, and writes them back for editing', () => {
    expect(formatPence(123456)).toBe('£1,234.56')
    expect(formatPence(-1250)).toBe('-£12.50')
    expect(formatPence(0)).toBe('£0.00')
    expect(formatPence(null)).toBe('—')
    expect(formatPence(undefined, { fallback: '' })).toBe('')
    expect(formatPence(123456, { whole: true })).toBe('£1,235')
    expect(formatPenceNoSymbol(123456)).toBe('1,234.56')
    expect(penceToPounds(123456)).toBe('1234.56')
    expect(penceToPounds(5)).toBe('0.05')
    expect(penceToPounds(-1250)).toBe('-12.50')
    expect(penceToPounds(null)).toBe('')
    for (const p of [0, 1, 99, 100, 123456, 99999999]) expect(pence(penceToPounds(p))).toBe(p)
  })

  it('adds exactly and works out VAT to the penny', () => {
    expect(sumPence([10, 20, null, undefined, 30])).toBe(60)
    expect(sumPence(Array(10).fill(10))).toBe(100) // ten lots of 10p is £1.00 exactly
    expect(vatOn(100000, 20)).toBe(20000)
    expect(vatOn(1, 20)).toBe(0) // 0.2p rounds down
    expect(vatOn(3, 20)).toBe(1) // 0.6p rounds up
    expect(vatOn(25, 20)).toBe(5)
    expect(vatOn(12345, 5)).toBe(617) // 617.25p
    expect(vatOn(-1000, 20)).toBe(-200)
  })

  it('knows whole pence when it sees them', () => {
    expect(isPence(100)).toBe(true)
    expect(isPence(1.5)).toBe(false)
    expect(isPence(-1)).toBe(false)
    expect(isPence(-1, true)).toBe(true)
    expect(isPence('100')).toBe(false)
    expect(isPence(MAX_PENCE + 1)).toBe(false)
  })
})
