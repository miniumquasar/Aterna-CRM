import { describe, expect, it } from 'vitest'
import { createWork, deleteWork, listAml, listWork, updateWork, upsertAml, WORK } from '../../src/main/records/work'
import { auditOf, manager, partner, practice, staffA, staffB } from './helpers'

describe('records held for clients', () => {
  it('lists staff’s own clients’ records, and tasks assigned to them, with the client’s current name', () => {
    const db = practice()
    db.exec(`INSERT INTO tasks (client_ref, description, due_date, assigned_to) VALUES
      ('C1', 'For Alpha', '2026-11-01', NULL),
      ('C2', 'For Beta, done by A', '2026-11-02', 'Staff A'),
      ('C2', 'For Beta', '2026-11-03', NULL),
      (NULL, 'Practice task for A', '2026-11-04', 'Staff A'),
      (NULL, 'Practice task for P', '2026-11-05', 'Partner P')`)
    db.exec("INSERT INTO hmrc_submissions (client_ref, client_name, submission_type) VALUES ('C1', 'Old Name Ltd', 'VAT'), ('C2', 'Beta Ltd', 'CT600')")
    expect(listWork(db, staffA, WORK.tasks).map((t) => t.description)).toEqual(['For Alpha', 'For Beta, done by A', 'Practice task for A'])
    expect(listWork(db, partner, WORK.tasks)).toHaveLength(5)
    expect(listWork(db, staffA, WORK.tasks)[1].client_name).toBe('Beta Ltd')
    const hmrc = listWork(db, staffA, WORK.hmrc)
    expect(hmrc.map((s) => [s.client_ref, s.client_name])).toEqual([['C1', 'Alpha Ltd']]) // never the stale copy
    expect(listWork(db, staffA, WORK.hmrc, 'C1')).toHaveLength(1)
    expect(() => listWork(db, staffA, WORK.hmrc, 'C2')).toThrow(/assigned to you/)
  })

  it('lets staff add and change records only for their own clients', () => {
    const db = practice()
    expect(() => createWork(db, staffA, WORK.interactions, { client_ref: 'C2', date: '2026-10-01', summary: 'Call' })).toThrow(/assigned to you/)
    expect(() => createWork(db, staffA, WORK.interactions, { date: '2026-10-01', summary: 'Call' })).toThrow(/Choose the client/)
    const { id } = createWork(db, staffA, WORK.interactions, { client_ref: 'C1', client_name: 'Spoofed', date: '2026-10-01', summary: 'Call' })
    const task = createWork(db, staffA, WORK.tasks, { description: 'Renew software', due_date: '2026-11-01' })
    expect(db.prepare('SELECT assigned_to FROM tasks WHERE id = ?').get(task.id)).toEqual({ assigned_to: 'Staff A' })
    expect(() => updateWork(db, staffA, WORK.interactions, id, { client_ref: 'C2' })).toThrow(/assigned to you/)
    expect(() => updateWork(db, staffB, WORK.interactions, id, { summary: 'Edited' })).toThrow(/assigned to you/)
    updateWork(db, staffA, WORK.interactions, id, { summary: 'Call back on Friday' })
    expect(auditOf(db, 'Updated interaction')[0]).toMatchObject({
      user_name: 'Staff A', old: { client_ref: 'C1', summary: 'Call' }, new: { client_ref: 'C1', summary: 'Call back on Friday' }
    })
    expect(() => createWork(db, staffA, WORK.tasks, { client_ref: 'C1' })).toThrow(/Fill in description/)
  })

  it('keeps invoices in whole pence, with the client name from the client record', () => {
    const db = practice()
    const { id } = createWork(db, staffA, WORK.payments, { client_ref: 'C1', client_name: 'Wrong', amount_pence: 100000, vat_pence: 20000, status: 'pending' })
    expect(db.prepare('SELECT client_name, amount_pence, vat_pence FROM payments WHERE id = ?').get(id)).toEqual({ client_name: 'Alpha Ltd', amount_pence: 100000, vat_pence: 20000 })
    expect(() => createWork(db, staffA, WORK.payments, { client_ref: 'C1', amount_pence: 1000.5 })).toThrow(/pounds and pence/)
    expect(() => createWork(db, staffA, WORK.payments, { client_ref: 'C1', amount_pence: -100 })).toThrow(/below zero/)
    expect(() => createWork(db, staffA, WORK.payments, { client_ref: 'C1', amount_pence: 100, status: 'lost' })).toThrow(/isn’t allowed/)
  })

  it('lets only partners delete the records the practice must keep', () => {
    const db = practice()
    const inv = createWork(db, staffA, WORK.payments, { client_ref: 'C1', amount_pence: 5000 })
    const sub = createWork(db, staffA, WORK.hmrc, { client_ref: 'C1', submission_type: 'VAT' })
    const wip = createWork(db, staffA, WORK.wip, { client_ref: 'C1', type: 'Accounts' })
    const note = createWork(db, staffA, WORK.interactions, { client_ref: 'C1', date: '2026-10-01', summary: 'Note' })
    for (const [spec, rec] of [[WORK.payments, inv], [WORK.hmrc, sub], [WORK.wip, wip]] as const) {
      expect(() => deleteWork(db, staffA, spec, rec.id)).toThrow(/Only a partner can delete/)
      expect(() => deleteWork(db, manager, spec, rec.id)).toThrow(/Only a partner can delete/)
    }
    deleteWork(db, partner, WORK.payments, inv.id)
    expect(auditOf(db, 'Deleted invoice')[0]).toMatchObject({ user_name: 'Partner P', old: { client_ref: 'C1', amount_pence: 5000 } })
    deleteWork(db, staffA, WORK.interactions, note.id) // not a kept record: staff may delete their own client's
    expect(() => deleteWork(db, partner, WORK.payments, inv.id)).toThrow(/no longer exists/)
  })

  it('keeps one AML check per client, scoped and audited', () => {
    const db = practice()
    upsertAml(db, staffA, { client_ref: 'C1', risk_level: 'low', cdd_completed: true })
    upsertAml(db, staffA, { client_ref: 'C1', risk_level: 'high' })
    expect(listAml(db, staffA)).toHaveLength(1)
    expect(listAml(db, staffB)).toHaveLength(0)
    expect(listAml(db, staffA)[0]).toMatchObject({ client_name: 'Alpha Ltd', risk_level: 'high', cdd_completed: 1 })
    expect(auditOf(db, 'Updated AML check')[0]).toMatchObject({ old: { risk_level: 'low' }, new: { risk_level: 'high' } })
    expect(() => upsertAml(db, staffA, { client_ref: 'C2', risk_level: 'low' })).toThrow(/assigned to you/)
  })
})
