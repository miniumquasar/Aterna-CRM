/**
 * What Companies House says about the practice's clients (records/ch-watch.ts):
 * company numbers, comparing profiles, stream events, saving each change once,
 * and who sees which changes. No network: profiles and events are made up here.
 */
import { describe, expect, it } from 'vitest'
import type { CHStreamEvent } from '../../src/shared/types'
import {
  changesFromEvent, companiesDue, companyNumber, compareProfile, eventCompany, listChanges, personName, readState, recordChanges, recordProblem, recordProfile,
  stateFromProfile, watchedCompanies, type ChProfile
} from '../../src/main/records/ch-watch'
import { auditOf, partner, practice, staffA } from './helpers'

const NOW = new Date('2026-10-19T09:00:00Z')

const profile = (over: Partial<ChProfile> = {}): ChProfile => ({
  company_number: '01234567',
  company_name: 'ALPHA LTD',
  company_status: 'active',
  accounts: { next_due: '2027-06-30', overdue: false, last_accounts: { made_up_to: '2025-09-30' } },
  confirmation_statement: { next_due: '2027-01-14', overdue: false, last_made_up_to: '2025-12-31' },
  registered_office_address: { address_line_1: '1 High Street', locality: 'Leeds', postal_code: 'LS1 1AA' },
  has_insolvency_history: false,
  has_charges: false,
  ...over
})

function withCompanies() {
  const db = practice()
  db.exec(`UPDATE clients SET reg_no = '1234567' WHERE ref = 'C1';
           UPDATE clients SET reg_no = 'sc 12345' WHERE ref = 'C2';
           INSERT INTO clients (ref, client_name, client_category, status, reg_no) VALUES
             ('C4', 'Gone Ltd', 'company', 'Former client', '07654321'),
             ('C5', 'Twin Ltd', 'company', 'Active', '01234567'),
             ('C6', 'Odd Ltd', 'company', 'Active', 'X123')`)
  return db
}

describe('company numbers', () => {
  it('writes them as Companies House does', () => {
    expect(companyNumber('1234567')).toBe('01234567')
    expect(companyNumber(' sc 12345 ')).toBe('SC012345')
    expect(companyNumber('OC301234')).toBe('OC301234')
    expect(companyNumber(1234)).toBe('00001234')
    expect(companyNumber('X123')).toBeNull()
    expect(companyNumber('')).toBeNull()
    expect(companyNumber(null)).toBeNull()
  })

  it('watches live clients with a number, once per company', () => {
    const watched = watchedCompanies(withCompanies())
    expect([...watched.keys()].sort()).toEqual(['01234567', 'SC012345'])
    expect(watched.get('01234567')?.client_ref).toBe('C1') // the first of two clients sharing a number
  })
})

describe('comparing profiles', () => {
  it('reports only red flags at the first check', () => {
    const quiet = stateFromProfile('01234567', profile(), '2026-10-19 09:00:00')
    expect(compareProfile(null, quiet)).toEqual([])
    const troubled = stateFromProfile('01234567', profile({
      company_status_detail: 'active-proposal-to-strike-off',
      accounts: { next_due: '2026-06-30', overdue: true }
    }), '2026-10-19 09:00:00')
    expect(compareProfile(null, troubled).map((c) => [c.category, c.red_flag])).toEqual([['strike_off', true], ['accounts_overdue', true]])
    expect(compareProfile(null, troubled)[1].summary).toBe('Accounts overdue at Companies House: due 30 June 2026 (found at the first check)')
  })

  it('reports what changed since the last check, marking red flags', () => {
    const before = stateFromProfile('01234567', profile(), '2026-10-18 09:00:00')
    const after = stateFromProfile('01234567', profile({
      company_name: 'ALPHA TRADING LTD',
      company_status: 'liquidation',
      accounts: { next_due: '2027-06-30', overdue: false, last_accounts: { made_up_to: '2026-09-30' } },
      confirmation_statement: { next_due: '2027-01-14', overdue: true, last_made_up_to: '2025-12-31' },
      registered_office_address: { address_line_1: '2 Low Road', locality: 'York', postal_code: 'YO1 1AA' },
      has_insolvency_history: true,
      has_charges: true
    }), '2026-10-19 09:00:00')
    const changes = compareProfile(before, after)
    expect(changes.map((c) => [c.category, c.red_flag, c.summary])).toEqual([
      ['status', true, 'Status changed to in liquidation (was active)'],
      ['confirmation_overdue', true, 'Confirmation statement overdue at Companies House: due 14 January 2027'],
      ['accounts', false, 'Accounts filed, made up to 30 September 2026'],
      ['address', false, 'Registered office changed to 2 Low Road, York, YO1 1AA'],
      ['name', false, 'Name changed from ALPHA LTD to ALPHA TRADING LTD'],
      ['insolvency', true, 'Insolvency history now shown at Companies House'],
      ['charges', false, 'A charge is now registered against the company']
    ])
    // The same address written differently is no change.
    const same = stateFromProfile('01234567', profile({ registered_office_address: { address_line_1: '1  high street', locality: 'LEEDS', postal_code: 'ls1 1aa' } }), '2026-10-19 09:00:00')
    expect(compareProfile(before, same)).toEqual([])
  })

  it('says when a strike-off proposal ends', () => {
    const before = stateFromProfile('01234567', profile({ company_status_detail: 'active-proposal-to-strike-off' }), '2026-10-18 09:00:00')
    const after = stateFromProfile('01234567', profile(), '2026-10-19 09:00:00')
    expect(compareProfile(before, after)).toMatchObject([{ category: 'strike_off', red_flag: false }])
  })
})

describe('saving a checked profile', () => {
  it('saves each change once, and brings the client’s dates and status up to date as the app', () => {
    const db = withCompanies()
    const c1 = { company_number: '01234567', client_ref: 'C1', client_id: 1 }
    db.exec("UPDATE clients SET accounts_due = '2026-06-30', company_status = 'Active' WHERE ref = 'C1'")
    const first = recordProfile(db, c1, profile(), NOW)
    expect(first).toMatchObject({ firstCheck: true, changeIds: [], clientUpdated: true })
    expect(db.prepare("SELECT accounts_due, conf_stmt_due, company_status FROM clients WHERE ref = 'C1'").get()).toEqual({ accounts_due: '2027-06-30', conf_stmt_due: '2027-01-14', company_status: 'Active' })
    // Recorded by the app, with what it was before; "Active" and "active" are the same status.
    expect(auditOf(db, 'Updated client from Companies House')).toMatchObject([{ user_name: 'system', old: { accounts_due: '2026-06-30' }, new: { accounts_due: '2027-06-30' } }])

    const later = new Date('2026-10-20T09:00:00Z')
    const struck = profile({ company_status_detail: 'active-proposal-to-strike-off', confirmation_statement: { overdue: true } })
    const second = recordProfile(db, c1, struck, later)
    expect(second.changeIds).toHaveLength(2)
    expect(recordProfile(db, c1, struck, later).changeIds).toEqual([]) // nothing new the second time
    // An empty date from Companies House never clears the one the practice holds.
    expect(db.prepare("SELECT conf_stmt_due FROM clients WHERE ref = 'C1'").get()).toEqual({ conf_stmt_due: '2027-01-14' })
    expect(readState(db, '01234567')).toMatchObject({ status_detail: 'active-proposal-to-strike-off', cs_overdue: 1, problem: null })
  })

  it('notes a company that couldn’t be checked, and checks the oldest first', () => {
    const db = withCompanies()
    expect(companiesDue(db, NOW).map((c) => c.company_number)).toEqual(['01234567', 'SC012345'])
    recordProblem(db, 'SC012345', 'Not found at Companies House', new Date('2026-10-18T08:00:00Z'))
    recordProfile(db, { company_number: '01234567', client_ref: 'C1', client_id: 1 }, profile(), new Date('2026-10-19T08:00:00Z'))
    expect(readState(db, 'SC012345')).toMatchObject({ problem: 'Not found at Companies House', status: null })
    expect(companiesDue(db, NOW).map((c) => c.company_number)).toEqual(['SC012345']) // checked an hour ago: not yet
    expect(companiesDue(db, new Date('2026-10-20T09:00:00Z')).map((c) => c.company_number)).toEqual(['SC012345', '01234567'])
    // A profile after a "not found" is a first check: only red flags.
    expect(recordProfile(db, { company_number: 'SC012345', client_ref: 'C2', client_id: 2 }, profile({ company_number: 'SC012345' }), NOW).firstCheck).toBe(true)
  })

  it('refuses a profile with no status rather than recording blanks', () => {
    const db = withCompanies()
    expect(() => recordProfile(db, { company_number: '01234567', client_ref: 'C1', client_id: 1 }, {}, NOW)).toThrow(/without a status/)
    expect(readState(db, '01234567')).toBeNull()
  })
})

describe('stream events', () => {
  const event = (endpoint: string, data: Record<string, unknown>, over: Partial<CHStreamEvent> = {}): CHStreamEvent => ({
    resource_kind: 'x', resource_id: 'abc', resource_uri: '/company/01234567/filing-history/MzAw', data, published_at: '2026-10-19T08:00:00', endpoint, timepoint: 42, ...over
  })

  it('finds the company an event is about', () => {
    expect(eventCompany(event('/filings', {}))).toBe('01234567')
    expect(eventCompany(event('/companies', { company_number: '7654321' }, { resource_uri: '' }))).toBe('07654321')
    expect(eventCompany(event('/disqualified-officers', {}, { resource_uri: '/disqualified-officers/natural/xyz' }))).toBeNull()
  })

  it('writes officers’ names the usual way round', () => {
    expect(personName('SMITH, John Paul')).toBe('John Paul Smith')
    expect(personName("O'BRIEN, mary-jane")).toBe("Mary-Jane O'Brien")
    expect(personName(null)).toBe('Someone')
  })

  it('reads filings, marking strike-off and insolvency', () => {
    const s = (data: Record<string, unknown>, over: Partial<CHStreamEvent> = {}) => changesFromEvent(event('/filings', data, over)).map((c) => [c.category, c.red_flag, c.summary])
    expect(s({ type: 'GAZ1', category: 'gazette', transaction_id: 'T1' })).toEqual([['strike_off', true, 'First Gazette notice for strike-off']])
    expect(s({ type: 'AA', category: 'accounts', description_values: { made_up_date: '2026-03-31' } })).toEqual([['accounts', false, 'Accounts filed, made up to 31 March 2026']])
    expect(s({ type: 'AP01', category: 'officers', description_values: { officer_name: 'SMITH, Jane' } })).toEqual([['officers', false, 'Jane Smith appointed']])
    expect(s({ type: 'LIQ02', category: 'insolvency', description: 'liquidation-voluntary-statement-of-affairs' })).toEqual([['insolvency', true, 'Insolvency filing: Liquidation voluntary statement of affairs']])
    expect(s({ type: 'XYZ9', category: 'miscellaneous', description: 'some-new-document' })).toEqual([['filing', false, 'Filed: Some new document (XYZ9)']])
    expect(s({ type: 'AA' }, { event_type: 'deleted' })).toEqual([])
    // The same filing twice has the same key, so it is saved once.
    expect(changesFromEvent(event('/filings', { type: 'CS01', transaction_id: 'T9' }))[0].key).toBe('stream:filing:T9')
  })

  it('reads officers, persons with significant control, charges and insolvency cases', () => {
    const s = (endpoint: string, data: Record<string, unknown>, over: Partial<CHStreamEvent> = {}) => changesFromEvent(event(endpoint, data, over)).map((c) => c.summary)
    expect(s('/officers', { name: 'BLOGGS, Joe', officer_role: 'director', appointed_on: '2026-10-01' })).toEqual(['Joe Bloggs appointed director on 1 October 2026'])
    expect(s('/officers', { name: 'BLOGGS, Joe', officer_role: 'director', resigned_on: '2026-10-15' })).toEqual(['Joe Bloggs stopped being director on 15 October 2026'])
    expect(s('/officers', { name: 'BLOGGS, Joe' }, { fields_changed: ['address.locality'] })).toEqual(['Joe Bloggs’s details changed (address.locality)'])
    expect(s('/persons-with-significant-control', { name: 'Mrs Ann Lee', ceased_on: '2026-09-30' })).toEqual(['Mrs Ann Lee stopped being a person with significant control on 30 September 2026'])
    expect(s('/charges', { status: 'fully-satisfied', classification: { description: 'A registered charge' } })).toEqual(['Charge satisfied: A registered charge'])
    expect(changesFromEvent(event('/insolvency-cases', { cases: [{ type: 'creditors-voluntary-liquidation' }] }))).toMatchObject([{ category: 'insolvency', red_flag: true, summary: 'Insolvency: Creditors voluntary liquidation' }])
    expect(s('/disqualified-officers', { name: 'X' })).toEqual([])
  })
})

describe('reading changes', () => {
  it('shows staff the changes for their own clients, newest first', () => {
    const db = withCompanies()
    recordChanges(db, { company_number: '01234567', client_ref: 'C1' }, 'stream', [{ category: 'accounts', red_flag: false, summary: 'Accounts filed', key: 'k1' }])
    recordChanges(db, { company_number: 'SC012345', client_ref: 'C2' }, 'check', [{ category: 'strike_off', red_flag: true, summary: 'Proposal to strike off the company', key: 'k2' }])
    expect(recordChanges(db, { company_number: 'SC012345', client_ref: 'C2' }, 'check', [{ category: 'strike_off', red_flag: true, summary: 'Again', key: 'k2' }])).toEqual([])
    expect(listChanges(db, partner).map((c) => [c.client_name, c.red_flag])).toEqual([['Beta Ltd', true], ['Alpha Ltd', false]])
    expect(listChanges(db, staffA).map((c) => c.client_ref)).toEqual(['C1'])
    expect(listChanges(db, partner, { redFlagsOnly: true }).map((c) => c.client_ref)).toEqual(['C2'])
    expect(() => listChanges(db, partner, { days: 0 })).toThrow(/1 to 400/)
    expect(() => listChanges(db, partner, { category: 'nonsense' })).toThrow(/kind of change/)
  })
})
