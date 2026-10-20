/**
 * Notifications (records/notifications.ts): who is told what, once each; a
 * summary when many are new at once; the app marking done what has been dealt
 * with; and each person working through their own list.
 */
import { describe, expect, it } from 'vitest'
import { recordChanges } from '../../src/main/records/ch-watch'
import { alertWindow, listNotifications, markDone, notificationCounts, refreshNotifications, reopen } from '../../src/main/records/notifications'
import { local, manager, partner, practice, staffA, staffB } from './helpers'

/** A register deadline for a client, due some days from today. */
const deadline = (db: ReturnType<typeof practice>, ref: string, obligation: string, days: number, key = `${obligation}-${days}`): number =>
  Number(db.prepare('INSERT INTO compliance_periods (client_ref, obligation, period_key, period_end, due_date) VALUES (?, ?, ?, ?, ?)').run(ref, obligation, key, local(days - 30), local(days)).lastInsertRowid)

const titles = (db: ReturnType<typeof practice>, who: typeof partner, show: 'open' | 'done' = 'open'): string[] => listNotifications(db, who, { show }).map((n) => n.title)

describe('deadlines', () => {
  it('tells each person about their own deadlines, and partners and managers about nobody’s', () => {
    const db = practice()
    deadline(db, 'C1', 'vat_return', 10)
    deadline(db, 'C3', 'self_assessment', -3)
    refreshNotifications(db, staffA)
    refreshNotifications(db, partner)
    refreshNotifications(db, staffB)
    expect(titles(db, staffA)).toEqual(['VAT return due in 10 days: Alpha Ltd'])
    expect(titles(db, partner)).toEqual(['Self assessment overdue: Gamma Ltd'])
    expect(titles(db, staffB)).toEqual([])
    expect(listNotifications(db, partner)[0]).toMatchObject({
      kind: 'deadline', severity: 'urgent', client_ref: 'C3', client_name: 'Gamma Ltd', target: { route: 'client-file', clientRef: 'C3' },
      body: expect.stringMatching(/^The self assessment \(period to .+\) was due on .+, 3 days ago\.$/)
    })
  })

  it('tells once when a deadline comes near and once when it is overdue, replacing the first', () => {
    const db = practice()
    const id = deadline(db, 'C1', 'vat_return', 5)
    expect(refreshNotifications(db, staffA).created).toHaveLength(1)
    expect(refreshNotifications(db, staffA).created).toHaveLength(0) // nothing new
    db.prepare('UPDATE compliance_periods SET due_date = ? WHERE id = ?').run(local(-1), id)
    refreshNotifications(db, staffA)
    expect(titles(db, staffA)).toEqual(['VAT return overdue: Alpha Ltd'])
    expect(listNotifications(db, staffA, { show: 'done' })).toMatchObject([{ title: 'VAT return due in 5 days: Alpha Ltd', done_by: 'The app' }])
  })

  it('marks a deadline’s notice done when it is filed, and ignores deadlines beyond the alert window', () => {
    const db = practice()
    const id = deadline(db, 'C1', 'vat_return', 2)
    deadline(db, 'C1', 'self_assessment', 45)
    refreshNotifications(db, staffA, { alertDays: 30 })
    expect(titles(db, staffA)).toEqual(['VAT return due in 2 days: Alpha Ltd'])
    db.prepare("UPDATE compliance_periods SET status = 'filed', filed_date = ? WHERE id = ?").run(local(), id)
    expect(refreshNotifications(db, staffA, { alertDays: 30 })).toMatchObject({ resolved: 1, open: 0 })
    expect(refreshNotifications(db, staffA, { alertDays: 60 }).created.map((n) => n.title)).toEqual(['Self assessment due in 45 days: Alpha Ltd'])
  })

  it('rolls many new deadlines into one summary, and never repeats them one by one', () => {
    const db = practice()
    for (let i = 0; i < 4; i++) deadline(db, 'C3', 'vat_return', -10 - i)
    for (let i = 0; i < 3; i++) deadline(db, 'C3', 'p11d', 3 + i)
    const r = refreshNotifications(db, partner)
    expect(r.created).toMatchObject([{ title: '7 deadlines need attention', body: '4 overdue and 3 due within 30 days. Compliance → Deadlines lists them.', target: { route: 'deadlines', window: 'overdue' } }])
    expect(refreshNotifications(db, partner).created).toEqual([])
    deadline(db, 'C3', 'ct600', 20)
    expect(refreshNotifications(db, partner).created.map((n) => n.title)).toEqual(['Corporation tax return (CT600) due in 20 days: Gamma Ltd'])
  })

  it('never loses a notice when the alert window is shortened', () => {
    const db = practice()
    const id = deadline(db, 'C1', 'vat_return', 20)
    refreshNotifications(db, staffA, { alertDays: 30 })
    expect(titles(db, staffA)).toEqual(['VAT return due in 20 days: Alpha Ltd'])
    // Now only 10 days ahead are announced: the notice already given stays, as the deadline is still open.
    expect(refreshNotifications(db, staffA, { alertDays: 10 })).toMatchObject({ created: [], resolved: 0, open: 1 })
    db.prepare('UPDATE compliance_periods SET due_date = ? WHERE id = ?').run(local(-1), id)
    expect(refreshNotifications(db, staffA, { alertDays: 10 }).created.map((n) => n.title)).toEqual(['VAT return overdue: Alpha Ltd'])
    expect(notificationCounts(db, staffA)).toEqual({ open: 1, urgent: 1 })
  })

  it('reads the alert window as a whole number of days, falling back to 30 rather than failing', () => {
    expect([0, 1, 45, 3650, '60'].map(alertWindow)).toEqual([0, 1, 45, 3650, 60])
    expect([-1, 3651, 2.5, Number.NaN, 'soon', '', ' ', '-3', null, undefined].map(alertWindow)).toEqual([30, 30, 30, 30, 30, 30, 30, 30, 30, 30])
    const db = practice()
    deadline(db, 'C1', 'vat_return', 20)
    expect(refreshNotifications(db, staffA, { alertDays: -5 }).created.map((n) => n.title)).toEqual(['VAT return due in 20 days: Alpha Ltd'])
  })

  it('tells about a deadline again when its due date moves', () => {
    const db = practice()
    db.exec(`UPDATE clients SET accounts_due = '${local(-5)}' WHERE ref = 'C1'`)
    refreshNotifications(db, staffA)
    db.exec(`UPDATE clients SET accounts_due = '${local(12)}' WHERE ref = 'C1'`)
    const r = refreshNotifications(db, staffA)
    expect(r.created.map((n) => n.title)).toEqual(['Annual accounts due in 12 days: Alpha Ltd'])
    expect(r.resolved).toBe(1) // the old date's notice
  })
})

describe('Companies House changes', () => {
  it('goes to the client’s person; red flags and nobody’s clients also go to partners and managers', () => {
    const db = practice()
    recordChanges(db, { company_number: '01234567', client_ref: 'C1' }, 'check', [{ category: 'accounts', red_flag: false, summary: 'Accounts filed, made up to 31 March 2026', key: 'a' }])
    recordChanges(db, { company_number: '01234567', client_ref: 'C1' }, 'check', [{ category: 'strike_off', red_flag: true, summary: 'Proposal to strike off the company', key: 'b' }])
    recordChanges(db, { company_number: '07654321', client_ref: 'C3' }, 'stream', [{ category: 'officers', red_flag: false, summary: 'Jane Smith appointed director', key: 'c' }])
    refreshNotifications(db, staffA)
    refreshNotifications(db, manager)
    refreshNotifications(db, staffB)
    expect(titles(db, staffA)).toEqual(['Alpha Ltd: Proposal to strike off the company', 'Alpha Ltd: Accounts filed, made up to 31 March 2026'])
    expect(titles(db, manager)).toEqual(['Alpha Ltd: Proposal to strike off the company', 'Gamma Ltd: Jane Smith appointed director'])
    expect(titles(db, staffB)).toEqual([])
    expect(listNotifications(db, manager)[0]).toMatchObject({ severity: 'urgent', target: { route: 'pulse', clientRef: 'C1' } })
  })

  it('rolls many into one summary', () => {
    const db = practice()
    for (let i = 0; i < 6; i++) recordChanges(db, { company_number: '07654321', client_ref: 'C3' }, 'stream', [{ category: 'filing', red_flag: i === 0, summary: `Filing ${i}`, key: `k${i}` }])
    expect(refreshNotifications(db, partner).created).toMatchObject([{ title: '6 Companies House changes for your clients', severity: 'urgent', target: { route: 'pulse' } }])
  })

  it('counts every change in a large batch, beyond what one screen lists', () => {
    const db = practice()
    recordChanges(db, { company_number: '07654321', client_ref: 'C3' }, 'stream', Array.from({ length: 350 }, (_, i) => ({ category: 'filing' as const, red_flag: false, summary: `Filing ${i}`, key: `k${i}` })))
    expect(refreshNotifications(db, partner).created.map((n) => n.title)).toEqual(['350 Companies House changes for your clients'])
    expect(refreshNotifications(db, partner).created).toEqual([])
  })
})

describe('follow-ups and tasks', () => {
  it('tells the person who logged a call on its follow-up date, until it is done', () => {
    const db = practice()
    const id = Number(db.prepare("INSERT INTO interactions (date, client_ref, summary, followup_date, followup_done, staff_member) VALUES (?, 'C1', 'Asked for the bank statements', ?, 0, 'Staff A')").run(local(-7), local()).lastInsertRowid)
    db.prepare("INSERT INTO interactions (date, client_ref, summary, followup_date, followup_done, staff_member) VALUES (?, 'C1', 'Next month', ?, 0, 'Staff A')").run(local(), local(30))
    refreshNotifications(db, staffA)
    expect(listNotifications(db, staffA)).toMatchObject([{ kind: 'follow_up', title: 'Follow up with Alpha Ltd today', body: 'Asked for the bank statements', target: { route: 'communications', clientRef: 'C1' } }])
    db.prepare('UPDATE interactions SET followup_done = 1 WHERE id = ?').run(id)
    expect(refreshNotifications(db, staffA)).toMatchObject({ resolved: 1, open: 0 })
  })

  it('keeps a missed follow-up on the list until it is done, announcing only recent ones', () => {
    const db = practice()
    const log = db.prepare("INSERT INTO interactions (date, client_ref, summary, followup_date, followup_done, staff_member) VALUES (?, 'C1', ?, ?, 0, 'Staff A')")
    log.run(local(-60), 'Long ago', local(-45))
    const recent = Number(log.run(local(-20), 'Send the engagement letter', local(-10)).lastInsertRowid)
    log.run(local(-20), 'Written oddly', '12/10/2026')
    refreshNotifications(db, staffA)
    expect(listNotifications(db, staffA)).toMatchObject([{ severity: 'urgent', title: expect.stringMatching(/^Follow-up with Alpha Ltd was due /), body: 'Send the engagement letter' }])
    // Forty days on it is 50 days late: still on the list, not marked done by the app.
    expect(refreshNotifications(db, staffA, { today: local(40) })).toMatchObject({ created: [], resolved: 0, open: 1 })
    db.prepare('UPDATE interactions SET followup_done = 1 WHERE id = ?').run(recent)
    expect(refreshNotifications(db, staffA, { today: local(40) })).toMatchObject({ resolved: 1, open: 0 })
  })

  it('never announces completed or cancelled tasks, and cancelling one marks its notice done', () => {
    const db = practice()
    const add = db.prepare("INSERT INTO tasks (client_ref, description, priority, due_date, status, assigned_to) VALUES ('C2', ?, 'medium', ?, ?, 'Staff B')")
    add.run('Cancelled one', local(-1), 'cancelled')
    add.run('Finished one', local(-1), 'Done')
    const open = Number(add.run('Chase the P60s', local(), 'in_progress').lastInsertRowid)
    refreshNotifications(db, staffB)
    expect(titles(db, staffB)).toEqual(['Task due today: Chase the P60s'])
    db.prepare("UPDATE tasks SET status = 'cancelled' WHERE id = ?").run(open)
    expect(refreshNotifications(db, staffB)).toMatchObject({ resolved: 1, open: 0 })
  })

  it('tells the person a task is assigned to when it is due', () => {
    const db = practice()
    const id = Number(db.prepare("INSERT INTO tasks (client_ref, description, priority, due_date, status, assigned_to) VALUES ('C2', 'Chase the P60s', 'high', ?, 'pending', 'Staff B')").run(local(-2)).lastInsertRowid)
    refreshNotifications(db, staffB)
    expect(listNotifications(db, staffB)).toMatchObject([{ kind: 'task', severity: 'urgent', title: 'Task overdue: Chase the P60s', body: 'For Beta Ltd.' }])
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(id)
    expect(refreshNotifications(db, staffB).resolved).toBe(1)
  })
})

describe('backups and the licence', () => {
  it('tells partners and managers, not staff, and clears when put right', () => {
    const db = practice()
    const facts = {
      licence: { state: 'trial' as const, active: true, validUntil: local(10), daysRemaining: 10, graceEndsOn: null },
      backup: { lastBackupAt: null, lastError: { at: '2026-10-19T08:00:00.000Z', message: 'The backup folder is full.' }, schedule: 'daily', folderProblem: null }
    }
    refreshNotifications(db, staffA, { facts })
    expect(titles(db, staffA)).toEqual([])
    refreshNotifications(db, partner, { facts })
    // Urgent ones first, then the newest.
    expect(titles(db, partner)).toEqual([
      'The last backup didn’t work',
      'No backup has been made yet',
      expect.stringMatching(/^The free trial ends on /)
    ])
    const fixed = { ...facts, backup: { ...facts.backup, lastBackupAt: `${local()} 09:00:00`, lastError: null } }
    expect(refreshNotifications(db, partner, { facts: fixed }).resolved).toBe(2)
    const readOnly = { licence: { state: 'trial_expired' as const, active: false, validUntil: local(-1), daysRemaining: 0, graceEndsOn: null } }
    expect(refreshNotifications(db, partner, { facts: readOnly }).created.map((n) => n.title)).toEqual(['The app is read-only'])
  })
})

describe('backups and the licence when their state can’t be read', () => {
  const facts = {
    licence: { state: 'licensed' as const, active: true, validUntil: local(5), daysRemaining: 5, graceEndsOn: null },
    backup: { lastBackupAt: null, lastError: { at: '2026-10-19T08:00:00.000Z', message: 'The drive is full.' }, schedule: 'daily', folderProblem: null }
  }

  it('keeps their notices rather than marking them done', () => {
    const db = practice()
    refreshNotifications(db, partner, { facts })
    expect(notificationCounts(db, partner)).toEqual({ open: 3, urgent: 2 })
    expect(refreshNotifications(db, partner, { facts: {} })).toMatchObject({ resolved: 0, open: 3 })
    expect(refreshNotifications(db, partner, { facts: { licence: facts.licence } })).toMatchObject({ resolved: 0, open: 3 })
    // Read again, and put right: now they are marked done.
    expect(refreshNotifications(db, partner, { facts: { ...facts, backup: { ...facts.backup, lastBackupAt: `${local()} 09:00:00`, lastError: null } } })).toMatchObject({ resolved: 2, open: 1 })
  })

  it('clears them for someone who is no longer a partner or manager', () => {
    const db = practice()
    refreshNotifications(db, manager, { facts })
    expect(notificationCounts(db, manager).open).toBe(3)
    expect(refreshNotifications(db, { ...manager, role: 'staff' })).toMatchObject({ resolved: 3, open: 0 })
  })

  it('says there has been no backup once a week, the new notice replacing last week’s', () => {
    const db = practice()
    const none = { backup: { lastBackupAt: null, lastError: null, schedule: 'daily', folderProblem: null } }
    expect(refreshNotifications(db, partner, { facts: none, today: '2026-10-19' }).created.map((n) => n.title)).toEqual(['No backup has been made yet'])
    expect(refreshNotifications(db, partner, { facts: none, today: '2026-10-25' }).created).toEqual([]) // the same week (Monday to Sunday)
    expect(refreshNotifications(db, partner, { facts: none, today: '2026-10-26' })).toMatchObject({ created: [{ title: 'No backup has been made yet' }], open: 1 })
    expect(listNotifications(db, partner, { show: 'done' })).toMatchObject([{ title: 'No backup has been made yet', done_by: 'The app' }])
  })
})

describe('working through the list', () => {
  it('marks a person’s own notifications done, all at once or one by one, and can open one again', () => {
    const db = practice()
    deadline(db, 'C1', 'vat_return', 3)
    deadline(db, 'C1', 'p11d', 4)
    deadline(db, 'C3', 'ct600', 5)
    refreshNotifications(db, staffA)
    refreshNotifications(db, partner)
    const [first] = listNotifications(db, staffA)
    expect(notificationCounts(db, staffA)).toEqual({ open: 2, urgent: 0 })
    expect(markDone(db, partner, [first.id])).toBe(0) // someone else's: untouched
    expect(markDone(db, staffA, [first.id])).toBe(1)
    expect(listNotifications(db, staffA, { show: 'done' })).toMatchObject([{ id: first.id, done_by: 'Staff A' }])
    reopen(db, staffA, first.id)
    expect(() => reopen(db, staffA, first.id)).toThrow(/isn’t on your done list/)
    expect(markDone(db, staffA, 'all')).toBe(2)
    expect(notificationCounts(db, staffA).open).toBe(0)
    expect(notificationCounts(db, partner).open).toBe(1)
    expect(() => markDone(db, staffA, [])).toThrow(/Choose the notifications/)
    expect(() => listNotifications(db, staffA, { show: 'everything' })).toThrow(/open or done/)
  })

  it('clears away done notifications after 90 days', () => {
    const db = practice()
    deadline(db, 'C1', 'vat_return', 3)
    refreshNotifications(db, staffA)
    markDone(db, staffA, 'all')
    db.exec("UPDATE notifications SET done_at = datetime('now', '-91 days')")
    refreshNotifications(db, staffA)
    expect(listNotifications(db, staffA, { show: 'done' })).toEqual([])
    expect(refreshNotifications(db, staffA).created).toEqual([]) // still remembered as told
  })
})
