/** The auth rules both processes share: passwords, usernames, idle times, invitation codes and the firm's reference checks. */
import { describe, expect, it } from 'vitest'
import {
  checkFirmField,
  effectiveIdleMinutes,
  formatInviteCode,
  idleLabel,
  normaliseInviteCode,
  passwordProblem,
  passwordStrength,
  suggestUsername,
  usernameProblem,
  utrChecksumOk,
  vatChecksumOk
} from '@shared/contracts/auth'

describe('passwords', () => {
  it.each([
    ['short', /at least 10/],
    [' padded password ', /space/],
    ['aaaaaaaaaaaa', /too easy/],
    ['Password123', /too easy/],
    ['1234567890', /too easy/],
    ['x'.repeat(201), /at most 200/]
  ])('refuses %j', (pw, message) => {
    expect(passwordProblem(pw)).toMatch(message)
  })

  it('refuses the username or the name', () => {
    expect(passwordProblem('jane.smith', { username: 'Jane.Smith' })).toMatch(/isn’t your username/)
    expect(passwordProblem('janesmithy', { name: 'Jane Smithy' })).toMatch(/isn’t your name/)
    expect(passwordProblem('a long enough phrase', { username: 'jane', name: 'Jane' })).toBeNull()
  })

  it('gives a rough strength as you type', () => {
    expect(passwordStrength('short').label).toBe('Too short')
    expect(passwordStrength('aaaaaaaaaaaa').label).toBe('Weak')
    expect(passwordStrength('abcdefghijkl').label).toBe('Weak')
    expect(passwordStrength('greenhouse7').label).toBe('Fair')
    expect(passwordStrength('Green house 7 lamps').label).toBe('Strong')
  })
})

describe('usernames', () => {
  it('checks the shape', () => {
    expect(usernameProblem('jane.smith')).toBeNull()
    expect(usernameProblem('  ')).toBe('Enter a username.')
    expect(usernameProblem('ja')).toMatch(/3 to 64/)
    expect(usernameProblem('.jane')).toMatch(/starting with a letter or number/)
    expect(usernameProblem('jane smith')).toMatch(/3 to 64/)
  })

  it.each([
    ['Jane Smith', 'jane.smith'],
    ['Jane O’Brien-Smith', 'jane.obrien-smith'],
    ['Zoë Ångström', 'zoe.angstrom'],
    ['  Al  ', 'aluser'],
    ['!!!', 'user']
  ])('suggests one from %j', (name, username) => {
    expect(suggestUsername(name)).toBe(username)
    expect(usernameProblem(suggestUsername(name))).toBeNull()
  })
})

describe('idle sign-out', () => {
  it('reads plainly and takes the shorter of the two', () => {
    expect([5, 30, 60, 120].map(idleLabel)).toEqual(['5 minutes', '30 minutes', '1 hour', '2 hours'])
    expect(effectiveIdleMinutes(30, null)).toBe(30)
    expect(effectiveIdleMinutes(30, 10)).toBe(10)
    expect(effectiveIdleMinutes(30, 60)).toBe(30)
  })
})

describe('invitation codes', () => {
  it('accept any case, spaces and dashes, and only the safe letters', () => {
    expect(normaliseInviteCode('abcd-efgh-jkmn')).toBe('ABCDEFGHJKMN')
    expect(normaliseInviteCode(' ABCD EFGH JKMN ')).toBe('ABCDEFGHJKMN')
    expect(normaliseInviteCode('ABCD-EFGH-JKM0')).toBeNull()
    expect(normaliseInviteCode('ABCD-EFGH')).toBeNull()
    expect(formatInviteCode('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN')
  })
})

describe('the firm’s references', () => {
  it('check UTRs and VAT numbers', () => {
    expect(utrChecksumOk('1234567802')).toBe(true)
    expect(utrChecksumOk('2234567802')).toBe(false)
    expect(vatChecksumOk('999999973')).toBe(true)
    expect(vatChecksumOk('999999974')).toBe(false)
  })

  it.each([
    ['companyNumber', '1234567', { value: '01234567' }],
    ['companyNumber', 'sc 123456', { value: 'SC123456' }],
    ['companyNumber', 'QQ123456', { value: 'QQ123456', warning: expect.stringMatching(/isn’t a prefix/) }],
    ['vatNumber', '999 9999 73', { value: 'GB999999973' }],
    ['vatNumber', '12345', { value: '12345', warning: expect.stringMatching(/9 digits/) }],
    ['utr', '12345 67802K', { value: '1234567802' }],
    ['utr', '2234567802', { value: '2234567802', warning: expect.stringMatching(/UTR check/) }],
    ['payeRef', '123 / ab45678', { value: '123/AB45678' }],
    ['payeRef', 'AB45678', { value: 'AB45678', warning: expect.stringMatching(/3-digit office number/) }],
    ['postcode', 'sw1a1aa', { value: 'SW1A 1AA' }],
    ['postcode', 'not a code', { value: 'NOT A CODE', warning: expect.stringMatching(/UK postcode/) }],
    ['email', 'office@example', { value: 'office@example', problem: expect.stringMatching(/email address/) }],
    ['phone', '0113 496 0000', { value: '0113 496 0000' }],
    ['phone', '496 0000', { value: '496 0000', warning: expect.stringMatching(/looks short/) }],
    ['phone', 'call me', { value: 'call me', problem: expect.any(String) }],
    ['website', 'www.example.co.uk', { value: 'www.example.co.uk' }],
    ['name', '   ', { value: null, problem: 'Enter the firm’s name.' }],
    ['country', '', { value: 'United Kingdom' }],
    ['town', '  Leeds  ', { value: 'Leeds' }]
  ] as const)('%s %j', (field, raw, expected) => {
    expect(checkFirmField(field, raw)).toEqual(expected)
  })

  it('leaves a postcode outside the UK alone', () => {
    expect(checkFirmField('postcode', 'd02 x285', 'Ireland')).toEqual({ value: 'D02 X285' })
  })
})
