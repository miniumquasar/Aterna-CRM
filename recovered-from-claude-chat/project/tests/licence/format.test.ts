import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  base32Decode, base32Encode, cleanFirmName, decodePayload, encodePayload, firmBytes, formatMachineCode, isLegacyKey, MAX_FIRM_BYTES,
  normaliseCode, parseMachineCode, splitKey, type LicencePayload
} from '../../src/main/licence/format'
import { vendor } from './helpers'

const SYMBOLS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

describe('Crockford base32', () => {
  it('round-trips and rejects foreign symbols, wrong lengths and non-zero padding', () => {
    for (let i = 0; i < 50; i += 1) {
      const b = new Uint8Array(randomBytes(80))
      expect(base32Decode(base32Encode(b), 80)).toEqual(b)
    }
    expect(base32Decode('U'.repeat(128), 80)).toBeNull()
    expect(base32Decode('0'.repeat(127), 80)).toBeNull()
    expect(base32Decode(`${'0'.repeat(12)}1`, 8)).toBeNull()
  })
  it('accepts keys however they were typed', () => {
    expect(normaliseCode('ab-cd oil')).toBe('ABCD011')
  })
})

describe('the firm’s name', () => {
  it('is tidied the same way before signing and when shown', () => {
    expect(cleanFirmName('  Made Up   Accountants\tLtd \n')).toBe('Made Up Accountants Ltd')
    expect(cleanFirmName('Café & Co')).toBe('Café & Co') // one form of é, whichever was typed
    expect(firmBytes('Café & Co')).toBe(10)
  })
})

describe('signed payload', () => {
  const p: LicencePayload = {
    version: 2, signingKeyId: 3, product: 1, type: 'term', term: { unit: 'months', amount: 12 },
    serial: 123456, issuedOn: '2026-10-02', startsOn: '2026-11-15', machine: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    firm: 'Made Up Accountants Ltd'
  }
  it('round-trips every field, the firm’s name and start date included', () => {
    const d = decodePayload(encodePayload(p))
    expect('payload' in d && d.payload).toEqual(p)
    const anyPc = decodePayload(encodePayload({ ...p, machine: null, firm: 'Ünïcødé Partners LLP' }))
    expect('payload' in anyPc && anyPc.payload).toMatchObject({ machine: null, firm: 'Ünïcødé Partners LLP' })
  })
  it('refuses values the format cannot carry', () => {
    expect(() => encodePayload({ ...p, serial: 0 })).toThrow()
    expect(() => encodePayload({ ...p, term: { unit: 'months', amount: 128 } })).toThrow()
    expect(() => encodePayload({ ...p, signingKeyId: 16 })).toThrow()
    expect(() => encodePayload({ ...p, firm: '' })).toThrow(/must name the firm/)
    expect(() => encodePayload({ ...p, firm: 'x'.repeat(MAX_FIRM_BYTES + 1) })).toThrow(/100 bytes/)
    expect(() => encodePayload({ ...p, version: 1 })).toThrow(/version 2/)
    expect(encodePayload({ ...p, type: 'clock_reset', firm: '' }).length).toBe(19) // a clock reset key need not name the firm
  })
  it('notices a firm’s name that doesn’t match its length or isn’t tidy', () => {
    const b = encodePayload(p)
    const cut = b.slice(0, -1)
    expect(decodePayload(cut)).toEqual({ problem: 'bad_firm' })
    const padded = new Uint8Array([...b.slice(0, 18), 4, 0x41, 0x20, 0x20, 0x42]) // "A  B": two spaces
    expect(decodePayload(padded)).toEqual({ problem: 'bad_firm' })
  })
})

describe('licence keys', () => {
  it('carry the firm’s name, are grouped in 8s, and survive being retyped', () => {
    const k = vendor().key({ serial: 1, issuedOn: '2026-10-02', firm: 'Made Up Accountants Ltd' })
    expect(k).toMatch(/^([0-9A-HJKMNP-TV-Z]{8}-)+[0-9A-HJKMNP-TV-Z]{1,8}$/)
    expect(k.replace(/-/g, '')).toHaveLength(170) // 19 + 23 + 64 bytes
    const retyped = k.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l')
    expect(splitKey(`  ${retyped}\n`)?.canonical).toBe(k.replace(/-/g, ''))
    expect(splitKey(k.slice(0, -2))).toBeNull()
    expect(splitKey(k.slice(0, -10))).toBeNull()
  })
  it('recognise a key in the older format, so the app can say it needs replacing', () => {
    const older = base32Encode(new Uint8Array([0x10, 0x11, 12, ...new Array(77).fill(7)]))
    expect(older).toHaveLength(128)
    expect(isLegacyKey(older)).toBe(true)
    expect(splitKey(older)).toBeNull()
    expect(isLegacyKey(vendor().key({ serial: 1, issuedOn: '2026-10-02' }))).toBe(false)
  })
})

describe('machine codes', () => {
  it('round-trip, and the check symbol catches every single-character typo', () => {
    const bytes = new Uint8Array(randomBytes(8))
    const code = formatMachineCode(bytes)
    expect(code).toMatch(/^.{5}-.{5}-.{4}$/)
    expect(parseMachineCode(code)).toEqual(bytes)
    const plain = code.replace(/-/g, '')
    let tried = 0
    let caught = 0
    for (let i = 0; i < 13; i += 1) {
      for (const c of SYMBOLS) {
        if (c === plain[i]) continue
        tried += 1
        if (parseMachineCode(plain.slice(0, i) + c + plain.slice(i + 1)) === null) caught += 1
      }
    }
    expect(caught).toBe(tried)
  })
})
