import { describe, expect, it } from 'vitest'
import { assignableUsers, assignClients, assigneeName } from '../../src/main/records/assignment'
import {
  createClient, deleteClient, deleteService, getClient, importClients, listClients, listMembers, listServices, saveMembers, updateClient, upsertService
} from '../../src/main/records/clients'
import { auditOf, local, manager, partner, practice, staffA, staffB } from './helpers'

const idOf = (db: ReturnType<typeof practice>, ref: string): number => (db.prepare('SELECT id FROM clients WHERE ref = ?').get(ref) as { id: number }).id

describe('clients: who sees and changes what', () => {
  it('shows staff only their own clients, by list, id or code', () => {
    const db = practice()
    expect(listClients(db, partner).map((c) => c.ref)).toEqual(['C1', 'C2', 'C3'])
    expect(listClients(db, staffA).map((c) => c.ref)).toEqual(['C1'])
    // Each comes with its other names, so Go to… and the client pickers find them.
    db.exec("INSERT INTO client_aliases (client_ref, alias, alias_norm) VALUES ('C1', 'Alpha Bakeries', 'ALPHA BAKERIES'), ('C1', 'Old Mill', 'OLD MILL')")
    expect(listClients(db, staffA)[0].other_names?.split(' | ').sort()).toEqual(['Alpha Bakeries', 'Old Mill'])
    expect(listClients(db, partner).find((c) => c.ref === 'C2')?.other_names).toBeNull()
    expect(getClient(db, staffA, 'C1')?.client_name).toBe('Alpha Ltd')
    expect(getClient(db, staffA, idOf(db, 'C1'))?.ref).toBe('C1')
    expect(() => getClient(db, staffA, 'C2')).toThrow(/assigned to you/)
    expect(() => getClient(db, staffA, idOf(db, 'C2'))).toThrow(/assigned to you/)
    expect(getClient(db, partner, 'NOPE')).toBeNull()
    expect(getClient(db, partner, 99999)).toBeNull()
  })

  it('assigns a member of staff’s new client to them, and checks a manager’s choice', () => {
    const db = practice()
    const mine = createClient(db, staffA, { client_name: 'Delta Ltd', ref: 'C4', assigned_to: 'Staff B', annual_fee_pence: 150000, not_a_column: 'ignored' })
    expect(getClient(db, staffA, mine.id)).toMatchObject({ assigned_to: 'Staff A', annual_fee_pence: 150000 })
    expect(() => createClient(db, manager, { client_name: 'Epsilon', assigned_to: 'Somebody Else' })).toThrow(/no active account/)
    // no code given: one is made from its id, since every record for a client hangs off its code
    expect(createClient(db, manager, { client_name: 'Epsilon', assigned_to: ' staff b ' })).toMatchObject({ ref: 'CL0005' })
    expect(listClients(db, staffB).map((c) => c.client_name)).toContain('Epsilon')
    expect(() => createClient(db, partner, { client_name: '  ' })).toThrow(/client’s name/)
    expect(() => createClient(db, partner, { client_name: 'Fee', annual_fee_pence: 12.5 })).toThrow(/pounds and pence/)
    expect(() => createClient(db, partner, { client_name: 'Fee', annual_fee_pence: -1 })).toThrow(/below zero/)
    expect(() => createClient(db, partner, { client_name: 'Dup', ref: 'C1' })).toThrow(/already in use/)
  })

  it('records every change with its previous values, masking the secrets', () => {
    const db = practice()
    updateClient(db, staffA, idOf(db, 'C1'), { status: 'Dormant', nino: 'AB999999D', remarks: 'Note', client_name: 'Alpha Ltd' })
    const [entry] = auditOf(db, 'Updated client')
    expect(entry.user_name).toBe('Staff A')
    expect(entry.old).toEqual({ ref: 'C1', client_name: 'Alpha Ltd', status: 'Active', nino: '•••••••6C', remarks: null })
    expect(entry.new).toEqual({ ref: 'C1', client_name: 'Alpha Ltd', status: 'Dormant', nino: '•••••••9D', remarks: 'Note' })
    updateClient(db, staffA, idOf(db, 'C1'), { status: 'Dormant' }) // no change, no entry
    expect(auditOf(db, 'Updated client')).toHaveLength(1)
  })

  it('keeps assignment and client codes for partners and managers', () => {
    const db = practice()
    expect(() => updateClient(db, staffA, idOf(db, 'C2'), { remarks: 'x' })).toThrow(/assigned to you/)
    expect(() => updateClient(db, staffA, idOf(db, 'C1'), { assigned_to: 'Staff B' })).toThrow(/Only partners and managers can assign/)
    expect(() => updateClient(db, staffA, idOf(db, 'C1'), { ref: 'C1-NEW' })).toThrow(/change a client’s code/)
    updateClient(db, staffA, idOf(db, 'C1'), { assigned_to: 'Staff A', ref: 'C1' }) // unchanged: allowed
    // a code can change, never go: invoices and documents are kept under it
    expect(() => updateClient(db, manager, idOf(db, 'C1'), { ref: '' })).toThrow(/can be changed, but not removed/)
    expect(() => updateClient(db, partner, idOf(db, 'C1'), { ref: '   ' })).toThrow(/not removed/)
    updateClient(db, partner, idOf(db, 'C3'), { ref: 'C3-NEW' })
    expect(getClient(db, partner, 'C3-NEW')?.client_name).toBe('Gamma Ltd')
    updateClient(db, manager, idOf(db, 'C1'), { assigned_to: 'staff b' })
    expect(getClient(db, partner, 'C1')?.assigned_to).toBe('Staff B')
    expect(auditOf(db, 'Assigned client')[0]).toMatchObject({ user_name: 'Manager M', old: { assigned_to: 'Staff A' }, new: { assigned_to: 'Staff B' } })
  })

  it('deletes only for partners and managers, and never a client with records the practice must keep', () => {
    const db = practice()
    db.exec("INSERT INTO tasks (client_ref, description, due_date) VALUES ('C3', 'Owned task', '2026-12-01')")
    db.exec("INSERT INTO payments (client_ref, amount_pence, status) VALUES ('C2', 10000, 'pending')")
    expect(() => deleteClient(db, staffA, idOf(db, 'C1'))).toThrow(/Only partners and managers can delete clients/)
    expect(() => deleteClient(db, manager, idOf(db, 'C2'))).toThrow(/must keep \(1 payments\)/)
    db.exec("INSERT INTO credential_vault (id, owner, client_ref, kind, platform, login_id) VALUES (7, 'client', 'C3', 'other', 'Xero', 'g@example.com')")
    db.exec("INSERT INTO data_issues (issue_key, severity, client_ref, description) VALUES ('K1', 'low', 'C3', 'Something to check')")
    deleteClient(db, manager, idOf(db, 'C3'))
    expect(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE client_ref = 'C3'").get()).toEqual({ n: 0 })
    const [entry] = auditOf(db, 'Deleted client')
    expect(entry.old).toMatchObject({ ref: 'C3', client_name: 'Gamma Ltd' })
    // what went with the client, and what was only unlinked from it
    expect(entry.new).toEqual({ records_removed: { tasks: 1, credential_vault: 1 }, records_unlinked: { data_issues: 1 } })
  })

  it('imports pasted clients for partners and managers, leaving unknown assignees unassigned', () => {
    const db = practice()
    expect(() => importClients(db, staffA, [{ client_name: 'X' }])).toThrow(/Only partners and managers can import/)
    const r = importClients(db, manager, [
      { client_name: 'One', ref: 'N1', assigned_to: 'Staff A', annual_fee_pence: 50000 },
      { client_name: 'Two', ref: 'N2', assigned_to: 'Old Initials' },
      { client_name: 'Three', ref: 'C1' }
    ])
    expect(r).toEqual({ count: 2, skipped: 1, unassigned: 1 })
    expect(() => importClients(db, manager, [{ client_name: 'Bad', annual_fee_pence: 1.5 }])).toThrow(/^Row 1:/)
  })
})

describe('client assignment', () => {
  it('moves a client with its services, open deadlines, open tasks and work in progress, but not deliberate exceptions', () => {
    const db = practice()
    db.exec(`INSERT INTO client_services (id, client_ref, service_type, active, assigned_to) VALUES
      (1, 'C1', 'accounts', 1, 'Staff A'), (2, 'C1', 'payroll', 1, 'Payroll Expert'), (3, 'C1', 'vat', 1, NULL), (4, 'C1', 'old', 0, 'Staff A')`)
    const cp = db.prepare('INSERT INTO compliance_periods (id, client_ref, obligation, period_key, due_date, filed_date, status, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    cp.run(1, 'C1', 'annual_accounts', '2026', local(30), null, 'not_started', 'Staff A')
    cp.run(2, 'C1', 'confirmation_statement', '2026', local(10), null, 'in_progress', null)
    cp.run(3, 'C1', 'ct600', '2025', local(-30), local(-40), 'filed', 'Staff A')
    db.exec(`INSERT INTO tasks (id, client_ref, description, due_date, status, assigned_to) VALUES
      (1, 'C1', 'Chase records', '${local(5)}', 'pending', 'Staff A'), (2, 'C1', 'Done long ago', '${local(-90)}', 'completed', 'Staff A'),
      (3, 'C1', 'Ask the payroll expert', '${local(5)}', 'in_progress', 'Payroll Expert')`)
    db.exec(`INSERT INTO wip_items (id, client_ref, type, status, assigned_to) VALUES (1, 'C1', 'Accounts', 'In Progress', 'Staff A'), (2, 'C1', 'VAT', 'Completed', 'Staff A')`)
    const r = assignClients(db, manager, { clientRefs: ['C1', 'C3', 'C1'], userId: staffB.id })
    expect(r).toEqual({ clients: 2, unchanged: 0, services: 2, deadlines: 2, tasks: 1, wip: 1, assignedTo: 'Staff B' })
    expect(db.prepare("SELECT id, assigned_to FROM tasks ORDER BY id").all()).toEqual([
      { id: 1, assigned_to: 'Staff B' }, { id: 2, assigned_to: 'Staff A' }, { id: 3, assigned_to: 'Payroll Expert' } // done, and a deliberate exception, stay
    ])
    expect(db.prepare("SELECT id, assigned_to FROM wip_items ORDER BY id").all()).toEqual([{ id: 1, assigned_to: 'Staff B' }, { id: 2, assigned_to: 'Staff A' }])
    expect(db.prepare("SELECT service_type, assigned_to FROM client_services WHERE client_ref = 'C1' ORDER BY service_type").all()).toEqual([
      { service_type: 'accounts', assigned_to: 'Staff B' },
      { service_type: 'old', assigned_to: 'Staff A' }, // not active
      { service_type: 'payroll', assigned_to: 'Payroll Expert' }, // a deliberate exception
      { service_type: 'vat', assigned_to: 'Staff B' }
    ])
    expect(db.prepare("SELECT obligation, assigned_to FROM compliance_periods WHERE client_ref = 'C1' ORDER BY obligation").all()).toEqual([
      { obligation: 'annual_accounts', assigned_to: 'Staff B' },
      { obligation: 'confirmation_statement', assigned_to: 'Staff B' },
      { obligation: 'ct600', assigned_to: 'Staff A' } // filed: history stays
    ])
    expect(assignClients(db, partner, { clientRefs: ['C1'], userId: staffB.id })).toMatchObject({ clients: 0, unchanged: 1 })
    expect(assignClients(db, partner, { clientRefs: ['C1'], userId: null, moveServices: false, moveDeadlines: false, moveWork: false }))
      .toMatchObject({ clients: 1, services: 0, deadlines: 0, tasks: 0, wip: 0, assignedTo: null })
    // every record moved, and who had it, so the move can be traced and undone
    expect(auditOf(db, 'Assigned client').map((e) => e.new)).toEqual([
      {
        client_ref: 'C1', assigned_to: 'Staff B', services_moved: 2, deadlines_moved: 2, tasks_moved: 1, wip_moved: 1,
        moved_from: {
          client_services: { 1: 'Staff A', 3: null }, compliance_periods: { 1: 'Staff A', 2: null }, tasks: { 1: 'Staff A' }, wip_items: { 1: 'Staff A' }
        }
      },
      { client_ref: 'C3', assigned_to: 'Staff B', services_moved: 0, deadlines_moved: 0, tasks_moved: 0, wip_moved: 0 },
      { client_ref: 'C1', assigned_to: null, services_moved: 0, deadlines_moved: 0, tasks_moved: 0, wip_moved: 0 }
    ])
  })

  it('is for partners and managers, to active people, all or nothing', () => {
    const db = practice()
    expect(() => assignClients(db, staffA, { clientRefs: ['C1'], userId: staffA.id })).toThrow(/Only partners and managers/)
    expect(assignableUsers(db, staffA)).toEqual([])
    expect(assignableUsers(db, manager).map((u) => u.name)).toEqual(['Manager M', 'Partner P', 'Staff A', 'Staff B'])
    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(staffB.id)
    expect(() => assignClients(db, manager, { clientRefs: ['C1'], userId: staffB.id })).toThrow(/isn’t active/)
    expect(() => assignClients(db, manager, { clientRefs: ['C1', 'GONE'], userId: staffA.id })).toThrow(/GONE no longer exists/)
    expect(db.prepare("SELECT assigned_to FROM clients WHERE ref = 'C1'").get()).toEqual({ assigned_to: 'Staff A' })
    expect(() => assignClients(db, manager, { clientRefs: [], userId: staffA.id })).toThrow(/Choose the clients/)
    expect(assigneeName(db, '')).toBeNull()
    expect(() => assigneeName(db, 'Staff B')).toThrow(/no active account/)
  })
})

describe('services, partners and trustees', () => {
  it('scopes services to staff’s own clients, takes fees in pence, and audits with previous values', () => {
    const db = practice()
    upsertService(db, staffA, { client_ref: 'C1', service_type: 'accounts', fee_pence: 120000, frequency: 'annual', assigned_to: 'Staff B' })
    upsertService(db, staffA, { client_ref: 'C1', service_type: 'accounts', fee_pence: 130000 })
    const [svc] = listServices(db, staffA, 'C1')
    expect(svc).toMatchObject({ fee_pence: 130000, frequency: 'annual', assigned_to: null }) // staff don't set who does the work
    expect(auditOf(db, 'Updated client service')[0]).toMatchObject({ old: { fee_pence: 120000 }, new: { fee_pence: 130000 } })
    expect(() => upsertService(db, staffA, { client_ref: 'C2', service_type: 'vat' })).toThrow(/assigned to you/)
    expect(() => upsertService(db, staffA, { client_ref: 'C1', service_type: 'vat', fee_pence: 99.5 })).toThrow(/pounds and pence/)
    expect(() => listServices(db, staffA, 'C2')).toThrow(/assigned to you/)
    expect(() => deleteService(db, staffB, svc.id)).toThrow(/assigned to you/)
    deleteService(db, staffA, svc.id)
    expect(auditOf(db, 'Removed client service')[0].old).toMatchObject({ service_type: 'accounts', fee_pence: 130000 })
  })

  it('replaces partners as a list, with capital in pence (which can be below zero), recording before and after', () => {
    const db = practice()
    saveMembers(db, staffA, 'partnership_members', 'C1', [{ name: 'Partner One', capital_pence: -50025, nino: 'AB123456C' }])
    saveMembers(db, staffA, 'partnership_members', 'C1', [{ name: 'Partner One', capital_pence: 10000, nino: 'AB123456C' }, { name: 'Partner Two' }])
    expect(listMembers(db, staffA, 'partnership_members', 'C1')).toHaveLength(2)
    const entries = auditOf(db, 'Updated partners')
    expect(entries[1].old).toMatchObject({ client_ref: 'C1', people: [{ name: 'Partner One', capital_pence: -50025, nino: '•••••••6C' }] })
    expect(() => saveMembers(db, staffA, 'trust_members', 'C2', [])).toThrow(/assigned to you/)
    expect(() => saveMembers(db, staffA, 'partnership_members', 'C1', [{ name: '' }])).toThrow(/needs a name/)
  })
})
