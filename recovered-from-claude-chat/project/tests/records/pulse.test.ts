/**
 * Pulse (records/pulse.ts): the day's changes from the audit log, with the
 * client each one is about, and health in plain words.
 */
import { describe, expect, it } from 'vitest'
import { writeAudit } from '../../src/main/access/audit'
import { createWork, WORK } from '../../src/main/records/work'
import { backupHealth, databaseHealth, dayBounds, kindOf, licenceHealth, pulseDay } from '../../src/main/records/pulse'
import { local, partner, practice, staffA, staffB } from './helpers'

describe('the day’s changes', () => {
  it('lists today’s changes with their client, and counts each kind', () => {
    const db = practice()
    createWork(db, staffA, WORK.payments, { client_ref: 'C1', amount_pence: 1000 })
    createWork(db, staffB, WORK.tasks, { client_ref: 'C2', description: 'Chase', due_date: local(2), priority: 'medium' })
    writeAudit(db, partner, 'Changed settings', 'app_settings', null, null, { idle: 30 })
    writeAudit(db, null, 'Updated client from Companies House', 'clients', 3, { accounts_due: null }, { accounts_due: '2027-01-01' })
    const all = pulseDay(db, partner)
    expect(all.items.map((i) => [i.who, i.kind, i.client_name])).toEqual([
      ['system', 'clients', 'Gamma Ltd'],
      ['Partner P', 'people', null],
      ['Staff B', 'tasks', 'Beta Ltd'],
      ['Staff A', 'billing', 'Alpha Ltd']
    ])
    expect(all.counts).toEqual({ clients: 1, people: 1, tasks: 1, billing: 1 })
    expect(all.day).toBe(local())

    // Staff: what they did, and what happened to their own clients.
    expect(pulseDay(db, staffA).items.map((i) => i.action)).toEqual(['Created invoice'])
    expect(pulseDay(db, partner, { who: 'me' }).items.map((i) => i.action)).toEqual(['Changed settings'])
  })

  it('finds a record’s client from the record itself when the entry doesn’t say', () => {
    const db = practice()
    const { id } = createWork(db, staffA, WORK.wip, { client_ref: 'C1', type: 'Accounts' })
    writeAudit(db, staffA, 'Updated work-in-progress item', 'wip_items', id, { status: 'Not Started' }, { status: 'In Progress' })
    expect(pulseDay(db, staffA).items.map((i) => [i.kind, i.client_ref])).toEqual([['billing', 'C1'], ['billing', 'C1']])
  })

  it('reads another day, and refuses one that isn’t a date', () => {
    const db = practice()
    // The audit log can't be changed, so yesterday's entry is written as yesterday's.
    const { from } = dayBounds(local(-1))
    db.prepare("INSERT INTO audit_log (timestamp, user_id, user_name, action, table_name) VALUES (?, 1, 'Partner P', 'Changed settings', 'app_settings')").run(from)
    expect(pulseDay(db, partner).items).toEqual([])
    expect(pulseDay(db, partner, { day: local(-1) }).items).toHaveLength(1)
    expect(() => pulseDay(db, partner, { day: '19/10/2026' })).toThrow(/Choose a day/)
    expect(() => pulseDay(db, partner, { who: 'them' })).toThrow(/whose changes/)
  })

  it('groups imports by what was done, whatever the table', () => {
    expect(kindOf('clients', 'Imported the master workbook')).toBe('imports')
    expect(kindOf('aml_records', 'Updated AML record')).toBe('compliance')
    expect(kindOf(null, 'Signed in')).toBe('other')
  })
})

describe('health in plain words', () => {
  it('describes the database, the licence and backups', () => {
    expect(databaseHealth('encrypted', 5 * 1024 * 1024)).toMatchObject({ tone: 'ok', text: 'Encrypted and saved (5.0 MB).' })
    expect(databaseHealth('locked', null).tone).toBe('problem')
    expect(licenceHealth({ state: 'trial', active: true, validUntil: '2026-12-01', daysRemaining: 43, graceEndsOn: null, licensedTo: null })).toEqual({ tone: 'ok', text: 'Free trial until 1 December 2026 (43 days left).' })
    expect(licenceHealth({ state: 'licensed', active: true, validUntil: '2026-11-01', daysRemaining: 13, graceEndsOn: null, licensedTo: 'Dynamic Accountants Ltd' })).toEqual({
      tone: 'attention', text: 'Licensed to Dynamic Accountants Ltd until 1 November 2026.'
    })
    expect(licenceHealth({ state: 'expired', active: false, validUntil: '2026-10-01', daysRemaining: 0, graceEndsOn: '2026-10-04', licensedTo: null }).tone).toBe('problem')

    const now = new Date('2026-10-19T15:00:00Z')
    expect(backupHealth({ lastBackup: { at: '2026-10-19 11:30:00' }, lastError: null, nextDue: null, folderProblem: null, schedule: 'daily' }, now)).toMatchObject({ tone: 'ok', text: expect.stringMatching(/^Last backup today at \d\d:\d\d\.$/) })
    expect(backupHealth({ lastBackup: { at: '2026-10-01 11:30:00' }, lastError: null, nextDue: null, folderProblem: null, schedule: 'off' }, now)).toMatchObject({ tone: 'attention', text: 'Last backup 18 days ago. Scheduled backups are off.' })
    expect(backupHealth({ lastBackup: null, lastError: { at: 'x', message: 'The drive is full.' }, nextDue: null, folderProblem: null, schedule: 'daily' }, now)).toMatchObject({ tone: 'problem', text: 'The last backup didn’t work: The drive is full.' })
    expect(backupHealth({ lastBackup: null, lastError: null, nextDue: null, folderProblem: null, schedule: 'daily' }, now).text).toBe('No backup has been made yet.')
    // Every text is a whole sentence, so the tile can add the next backup after it.
    expect(backupHealth({ lastBackup: null, lastError: null, nextDue: null, folderProblem: 'The backup folder is on a drive that isn’t connected', schedule: 'daily' }, now).text).toBe('The backup folder is on a drive that isn’t connected.')
    expect(backupHealth({ lastBackup: null, lastError: { at: 'x', message: 'Access denied' }, nextDue: null, folderProblem: null, schedule: 'daily' }, now).text).toBe('The last backup didn’t work: Access denied.')
    for (const mode of ['encrypted', 'dev-only', 'locked', 'in-memory-fallback'] as const) expect(databaseHealth(mode, 1024).text).toMatch(/\.$/)
  })
})
