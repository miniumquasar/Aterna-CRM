import { describe, expect, it } from 'vitest'
import { raiseIssue, resolveIssue, resolveIssuesNotIn } from '@main/access/issues'
import { completeSubject, notify } from '@main/access/notify'
import { addClient, createTestDb } from '../helpers/db'

describe('data issues', () => {
  it('raise once per key, resolve when fixed, reopen when the problem returns', () => {
    const { db } = createTestDb()
    const clientId = addClient(db)
    const input = { dedupeKey: `utr:client:${clientId}`, source: 'reference_check', kind: 'utr_check', title: 'The UTR fails its check', clientId, field: 'utr' }
    const first = raiseIssue(db, input)
    expect(first.outcome).toBe('new')
    expect(raiseIssue(db, { ...input, detail: 'Still failing' })).toEqual({ id: first.id, outcome: 'updated' })
    expect((db.prepare('SELECT count(*) AS n FROM data_issues').get() as { n: number }).n).toBe(1)
    expect(resolveIssue(db, input.dedupeKey)).toBe(true)
    expect(resolveIssue(db, input.dedupeKey)).toBe(false)
    expect(raiseIssue(db, input)).toEqual({ id: first.id, outcome: 'reopened' })
    expect(db.prepare('SELECT status, resolved_at FROM data_issues').get()).toEqual({ status: 'open', resolved_at: null })
  })

  it('leave a waived issue waived', () => {
    const { db } = createTestDb()
    const input = { dedupeKey: 'x:1', source: 'import', kind: 'k', title: 'T' }
    raiseIssue(db, input)
    db.prepare("UPDATE data_issues SET status = 'waived', waived_reason = 'Checked with the client' WHERE dedupe_key = 'x:1'").run()
    raiseIssue(db, input)
    expect(db.prepare('SELECT status FROM data_issues').get()).toEqual({ status: 'waived' })
  })

  it('resolve what a full recheck no longer finds', () => {
    const { db } = createTestDb()
    for (const k of ['ref:1', 'ref:2', 'ref:3', 'other:1']) raiseIssue(db, { dedupeKey: k, source: 's', kind: 'k', title: 'T' })
    expect(resolveIssuesNotIn(db, 'ref:', new Set(['ref:2']))).toBe(2)
    const open = (db.prepare("SELECT dedupe_key FROM data_issues WHERE status = 'open' ORDER BY dedupe_key").all() as Array<{ dedupe_key: string }>).map((r) => r.dedupe_key)
    expect(open).toEqual(['other:1', 'ref:2'])
  })
})

describe('notifications', () => {
  it('raise once per subject and close when the subject is dealt with', () => {
    const { db, users } = createTestDb()
    const id = notify(db, { recipientId: users.staff.id, kind: 'deadline.due', title: 'VAT return due in 7 days', subjectKey: 'deadline:42', route: 'deadlines' })
    expect(notify(db, { recipientId: users.staff.id, kind: 'deadline.due', title: 'VAT return due in 7 days', subjectKey: 'deadline:42' })).toBe(id)
    notify(db, { audience: 'partners', kind: 'deadline.due', title: 'VAT return due', subjectKey: 'deadline:42' })
    expect(completeSubject(db, 'deadline:42')).toBe(2)
    expect(db.prepare('SELECT done_reason FROM notifications WHERE id = ?').get(id)).toEqual({ done_reason: 'dealt_with' })
    // It comes back: raised afresh, not duplicated.
    expect(notify(db, { recipientId: users.staff.id, kind: 'deadline.due', title: 'VAT return overdue', subjectKey: 'deadline:42' })).toBe(id)
    expect(db.prepare('SELECT title, done_at FROM notifications WHERE id = ?').get(id)).toEqual({ title: 'VAT return overdue', done_at: null })
  })

  it('need exactly one of a person or an audience', () => {
    const { db } = createTestDb()
    expect(() => notify(db, { kind: 'k', title: 'T' })).toThrow()
    expect(() => notify(db, { recipientId: 1, audience: 'everyone', kind: 'k', title: 'T' })).toThrow()
  })
})
