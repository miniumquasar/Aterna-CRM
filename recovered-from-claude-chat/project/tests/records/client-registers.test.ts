/**
 * Changing the Client file's registers (Level 4, bundle 4F): PAYE schemes and
 * their years, workplace pensions with their re-declaration deadlines, the
 * Self Assessment registration and sources of income, links between clients,
 * and other names. Made-up data only.
 */
import { describe, expect, it } from 'vitest'
import {
  deleteAlias, deleteIncomeSource, deletePayrollScheme, deletePayrollYear, deletePensionScheme, deleteRelationship, deleteSaRegistration,
  saveAlias, saveIncomeSource, savePayrollScheme, savePayrollYear, savePensionScheme, saveRelationship, saveSaRegistration
} from '../../src/main/records/client-registers'
import { listAliases, listPayrollSchemes, listPensionSchemes, listRelationships, saRegistration } from '../../src/main/records/registers'
import { openDeadlines } from '../../src/main/records/deadlines'
import { classifyChannel } from '../../src/main/licence/gate'
import { PRELOAD_INVOKE_CHANNELS } from '../../src/shared/ipc-channels'
import { auditOf, manager, partner, practice, staffA, staffB } from './helpers'

const TODAY = '2026-10-20'

describe('PAYE schemes and their years', () => {
  it('adds a scheme with tidied references, and fills the client record’s PAYE reference when it has none', () => {
    const db = practice()
    const s = savePayrollScheme(db, staffA, { client_ref: 'C1', paye_reference: '123 ab45678', accounts_office_ref: '123pa 0012 3456', pay_frequency: 'Monthly', scheme_status: 'active' })
    expect(s).toMatchObject({ client_ref: 'C1', paye_reference: '123/AB45678', accounts_office_ref: '123PA00123456', pay_frequency: 'Monthly', scheme_status: 'active', years: [] })
    expect((db.prepare("SELECT paye_ref FROM clients WHERE ref = 'C1'").get() as { paye_ref: string }).paye_ref).toBe('123/AB45678')
    expect(auditOf(db, 'Added PAYE scheme')[0].new).toMatchObject({ client_ref: 'C1', paye_reference: '123/AB45678' })
    expect(auditOf(db, 'Updated client')[0]).toMatchObject({ old: { client_ref: 'C1', paye_ref: null }, new: { client_ref: 'C1', paye_ref: '123/AB45678' } })
    // A second scheme leaves the record's reference as it is.
    savePayrollScheme(db, staffA, { client_ref: 'C1', paye_reference: '456/ZZ1' })
    expect((db.prepare("SELECT paye_ref FROM clients WHERE ref = 'C1'").get() as { paye_ref: string }).paye_ref).toBe('123/AB45678')
    expect(auditOf(db, 'Updated client')).toHaveLength(1)
  })

  it('refuses a missing reference, a status off the list, another client’s contact, and the same scheme twice', () => {
    const db = practice()
    expect(() => savePayrollScheme(db, partner, { client_ref: 'C1' })).toThrow(/Enter the employer PAYE reference/)
    expect(() => savePayrollScheme(db, partner, { client_ref: 'C1', paye_reference: '123/AB45678', scheme_status: 'running' })).toThrow(/where the scheme stands/)
    const theirs = db.prepare("INSERT INTO client_contacts (client_ref, name) VALUES ('C2', 'Not theirs')").run().lastInsertRowid as number
    expect(() => savePayrollScheme(db, partner, { client_ref: 'C1', paye_reference: '123/AB45678', payroll_contact_id: theirs })).toThrow(/this client’s contacts/)
    savePayrollScheme(db, partner, { client_ref: 'C1', paye_reference: '123/AB45678' })
    expect(() => savePayrollScheme(db, partner, { client_ref: 'C1', paye_reference: '123/ab45678' })).toThrow(/already has PAYE scheme 123\/AB45678/)
    // The same reference on another client is that client's business.
    expect(savePayrollScheme(db, partner, { client_ref: 'C2', paye_reference: '123/AB45678' }).client_ref).toBe('C2')
  })

  it('keeps references that fail their checks, flags them on the client file, and closes the flags when they are corrected', () => {
    const db = practice()
    const issues = (): Array<{ issue_key: string; field: string; status: string; description: string; source: string; client_ref: string }> =>
      db.prepare('SELECT issue_key, field, status, description, source, client_ref FROM data_issues ORDER BY id').all() as never
    const s = savePayrollScheme(db, staffA, { client_ref: 'C1', paye_reference: ' 12/ab45678 ', accounts_office_ref: '123PA001' })
    expect(s).toMatchObject({ paye_reference: '12/ab45678', accounts_office_ref: '123PA001' })
    expect(issues()).toEqual([
      expect.objectContaining({ issue_key: `entered:payroll_schemes:${s.id}:paye_reference`, field: 'paye_reference', status: 'open', source: 'Entered in the app', client_ref: 'C1' }),
      expect.objectContaining({ issue_key: `entered:payroll_schemes:${s.id}:accounts_office_ref`, field: 'accounts_office_ref', status: 'open' })
    ])
    expect(issues()[0].description).toMatch(/^PAYE reference of scheme 12\/ab45678: An employer PAYE reference is a 3-digit office number/)
    // The client record doesn't take a reference that fails its check.
    expect(db.prepare("SELECT paye_ref FROM clients WHERE ref = 'C1'").get()).toEqual({ paye_ref: null })
    expect(auditOf(db, 'Flagged a reference')).toHaveLength(2)

    // Saving the same value again adds nothing; correcting one closes its flag.
    savePayrollScheme(db, staffA, { id: s.id, paye_reference: '12/ab45678', notes: 'Waiting for the P30BC' })
    expect(issues()).toHaveLength(2)
    savePayrollScheme(db, staffA, { id: s.id, accounts_office_ref: '123PA00123456' })
    expect(issues().map((i) => i.status)).toEqual(['open', 'resolved'])
    expect(auditOf(db, 'Closed a flagged reference')[0]).toMatchObject({ user_name: 'Staff A', new: { status: 'resolved', client_ref: 'C1' } })

    // A flag accepted as a risk stays accepted while the value stays; a new wrong value opens it again.
    db.exec("UPDATE data_issues SET status = 'accepted_risk' WHERE field = 'paye_reference'")
    savePayrollScheme(db, staffA, { id: s.id, notes: 'Still waiting' })
    expect(issues()[0].status).toBe('accepted_risk')
    savePayrollScheme(db, staffA, { id: s.id, paye_reference: '12/AB4567' })
    expect(issues()[0]).toMatchObject({ status: 'open', description: expect.stringMatching(/^PAYE reference of scheme 12\/AB4567:/) })
    savePayrollScheme(db, staffA, { id: s.id, paye_reference: '123/AB45678' })
    expect(issues().map((i) => i.status)).toEqual(['resolved', 'resolved'])
    expect(db.prepare("SELECT paye_ref FROM clients WHERE ref = 'C1'").get()).toEqual({ paye_ref: '123/AB45678' })

    // Removing a scheme closes its open flags.
    const other = savePayrollScheme(db, staffA, { client_ref: 'C1', paye_reference: 'NOPE' })
    expect(issues()).toHaveLength(3)
    deletePayrollScheme(db, staffA, other.id)
    expect(issues()[2].status).toBe('resolved')
  })

  it('closes the import’s issue about a PAYE reference once one that passes is entered', () => {
    const db = practice()
    db.exec(`INSERT INTO data_issues (issue_key, severity, issue_type, entity_table, client_ref, field, description, status, source) VALUES
      ('IMP:invalid_identifier:PAYE:P1:PAYE_REFERENCE', 'medium', 'import:invalid_identifier', 'PAYE', 'C1', 'PAYE_REFERENCE', 'invalid PAYE reference: 12/AB', 'open', 'workbook'),
      ('IMP:invalid_identifier:PAYE:P9:PAYE_REFERENCE', 'medium', 'import:invalid_identifier', 'PAYE', 'C2', 'PAYE_REFERENCE', 'invalid PAYE reference: 99', 'open', 'workbook')`)
    // A second scheme that also fails leaves it open…
    savePayrollScheme(db, staffA, { client_ref: 'C1', paye_reference: '12/AB' })
    const ok = savePayrollScheme(db, staffA, { client_ref: 'C1', paye_reference: '123/AB45678' })
    expect(db.prepare("SELECT status FROM data_issues WHERE issue_key LIKE 'IMP:%' ORDER BY id").all()).toEqual([{ status: 'open' }, { status: 'open' }])
    // …until nothing on the client fails; another client's issue is theirs.
    db.exec("DELETE FROM payroll_schemes WHERE paye_reference = '12/AB'")
    savePayrollScheme(db, staffA, { id: ok.id, paye_reference: '123/AB45679' })
    expect(db.prepare("SELECT status, resolved_by FROM data_issues WHERE issue_key LIKE 'IMP:%' ORDER BY id").all()).toEqual([
      { status: 'resolved', resolved_by: 'Staff A' }, { status: 'open', resolved_by: null }
    ])
  })

  it('records only what changed, keeps an odd imported value that isn’t touched, and removes a scheme with its years', () => {
    const db = practice()
    db.exec("INSERT INTO payroll_schemes (client_ref, paye_reference, accounts_office_ref) VALUES ('C1', '123/AB45678', 'NOT A REF')")
    const imported = listPayrollSchemes(db, staffA, 'C1')[0]
    const changed = savePayrollScheme(db, staffA, { ...imported, pay_frequency: 'Weekly' })
    expect(changed).toMatchObject({ accounts_office_ref: 'NOT A REF', pay_frequency: 'Weekly' })
    expect(auditOf(db, 'Updated PAYE scheme')[0]).toEqual({
      user_name: 'Staff A', record_id: String(imported.id),
      old: { client_ref: 'C1', paye_reference: '123/AB45678', pay_frequency: null },
      new: { client_ref: 'C1', paye_reference: '123/AB45678', pay_frequency: 'Weekly' }
    })
    const year = savePayrollYear(db, staffA, { scheme_id: imported.id, tax_year: '2025/26', employees: 4, rti_status: 'Active' })
    expect(year).toMatchObject({ tax_year: '2025-26', employees: 4, cis_subcontractors: null, rti_status: 'Active' })
    expect(() => savePayrollYear(db, staffA, { scheme_id: imported.id, tax_year: '2025-26' })).toThrow(/already has 2025-26/)
    expect(() => savePayrollYear(db, staffA, { scheme_id: imported.id, tax_year: '2025-27' })).toThrow(/one year into the next/)
    expect(() => savePayrollYear(db, staffA, { id: year.id, employees: -1 })).toThrow(/whole number from 0/)
    expect(() => savePayrollYear(db, staffA, { id: year.id, employees: 2.5 })).toThrow(/whole number/)
    savePayrollYear(db, staffA, { id: year.id, employees: 6 })
    expect(auditOf(db, 'Updated payroll year')[0].new).toEqual({ client_ref: 'C1', paye_reference: '123/AB45678', tax_year: '2025-26', employees: 6 })
    deletePayrollScheme(db, staffA, imported.id)
    expect(listPayrollSchemes(db, staffA, 'C1')).toEqual([])
    expect(db.prepare('SELECT COUNT(*) AS n FROM payroll_scheme_years').get()).toEqual({ n: 0 })
    expect(auditOf(db, 'Removed PAYE scheme')[0].old).toMatchObject({ client_ref: 'C1', paye_reference: '123/AB45678', years: 1 })
  })

  it('keeps each scheme to the people who may see its client', () => {
    const db = practice()
    const s = savePayrollScheme(db, staffA, { client_ref: 'C1', paye_reference: '123/AB45678' })
    expect(() => savePayrollScheme(db, staffB, { id: s.id, notes: 'x' })).toThrow(/assigned to you/)
    expect(() => savePayrollScheme(db, staffB, { client_ref: 'C1', paye_reference: '999/X1' })).toThrow(/assigned to you/)
    expect(() => savePayrollYear(db, staffB, { scheme_id: s.id, tax_year: '2025-26' })).toThrow(/assigned to you/)
    const y = savePayrollYear(db, manager, { scheme_id: s.id, tax_year: '2024-25' })
    expect(() => deletePayrollYear(db, staffB, y.id)).toThrow(/assigned to you/)
    expect(() => deletePayrollScheme(db, staffB, s.id)).toThrow(/assigned to you/)
    deletePayrollYear(db, staffA, y.id)
    expect(auditOf(db, 'Removed payroll year')[0].old).toMatchObject({ client_ref: 'C1', paye_reference: '123/AB45678', tax_year: '2024-25' })
  })
})

describe('workplace pensions and their re-declaration deadlines', () => {
  const redeclarations = (db: ReturnType<typeof practice>): Array<{ due_date: string; status: string; archived: number }> =>
    db.prepare("SELECT due_date, status, archived FROM compliance_periods WHERE obligation = 'ae_redeclaration' ORDER BY due_date").all() as Array<{ due_date: string; status: string; archived: number }>

  it('adds the re-declaration deadlines from the duties start date, by the import’s rule', () => {
    const db = practice()
    // Duties from 1 Jan 2020: the third anniversaries are 1 Jan 2023, 2026, 2029; each re-declaration is due five months on.
    const r = savePensionScheme(db, staffA, { client_ref: 'C1', letter_code: '12345 67890', duties_start_date: '2020-01-01', provider: 'NEST' }, TODAY)
    expect(r.scheme).toMatchObject({ letter_code: '1234567890', duties_start_date: '2020-01-01', provider: 'NEST' })
    // The one due on 31 May 2026 passed within six months, so it is there to confirm, as the import does.
    expect(r.deadlinesAdded.map((d) => [d.due_date, d.status])).toEqual([['2029-05-31', 'not_started'], ['2026-05-31', 'unknown']])
    expect(redeclarations(db)).toEqual([
      { due_date: '2026-05-31', status: 'unknown', archived: 0 },
      { due_date: '2029-05-31', status: 'not_started', archived: 0 }
    ])
    // They are on the one deadline list, so Home, Deadlines, Forecast and notifications all see them.
    expect(openDeadlines(db, staffA, { withinDays: 3650, obligation: 'ae_redeclaration' }, TODAY).map((d) => d.due_date)).toEqual(['2026-05-31', '2029-05-31'])
    expect(auditOf(db, 'Added deadline')).toHaveLength(2)
    // Saving again without changing the date adds nothing.
    expect(savePensionScheme(db, staffA, { id: r.scheme!.id, provider: 'Smart Pension' }, TODAY).deadlinesAdded).toEqual([])
  })

  it('archives the open deadlines from a date that changed, restores them when it changes back, and archives them when the pension goes', () => {
    const db = practice()
    const r = savePensionScheme(db, staffA, { client_ref: 'C1', duties_start_date: '2020-01-01' }, TODAY)
    const id = r.scheme!.id
    const moved = savePensionScheme(db, staffA, { id, duties_start_date: '2021-03-01' }, TODAY)
    expect(moved.deadlinesArchived).toBe(2)
    expect(moved.deadlinesAdded.map((d) => d.due_date)).toEqual(['2027-07-31'])
    expect(redeclarations(db).filter((d) => d.archived === 0).map((d) => d.due_date)).toEqual(['2027-07-31'])
    expect(auditOf(db, 'Archived deadline')[0].new).toMatchObject({ client_ref: 'C1', obligation: 'ae_redeclaration', archived: 1 })
    const back = savePensionScheme(db, staffA, { id, duties_start_date: '2020-01-01' }, TODAY)
    expect([back.deadlinesRestored, back.deadlinesArchived, back.deadlinesAdded.length]).toEqual([2, 1, 0])
    expect(redeclarations(db).filter((d) => d.archived === 0).map((d) => d.due_date)).toEqual(['2026-05-31', '2029-05-31'])
    // A filed re-declaration is history and stays as it is.
    db.prepare("UPDATE compliance_periods SET status = 'filed', filed_date = '2026-05-01' WHERE due_date = '2026-05-31'").run()
    const removed = deletePensionScheme(db, staffA, id)
    expect(removed.deadlinesArchived).toBe(1)
    expect(redeclarations(db)).toContainEqual({ due_date: '2026-05-31', status: 'filed', archived: 0 })
    expect(listPensionSchemes(db, staffA, 'C1')).toEqual([])
  })

  it('leaves the deadlines alone when another of the client’s pensions has the same duties start date', () => {
    const db = practice()
    const a = savePensionScheme(db, partner, { client_ref: 'C3', duties_start_date: '2024-06-01' }, TODAY)
    savePensionScheme(db, partner, { client_ref: 'C3', duties_start_date: '2024-06-01', provider: 'Second scheme' }, TODAY)
    expect(deletePensionScheme(db, partner, a.scheme!.id).deadlinesArchived).toBe(0)
    expect(redeclarations(db)).toEqual([{ due_date: '2027-10-31', status: 'not_started', archived: 0 }])
  })

  it('checks the letter code belongs to one employer, and that past dates are past', () => {
    const db = practice()
    expect(() => savePensionScheme(db, partner, { client_ref: 'C1', letter_code: '12345' }, TODAY)).toThrow(/10 digits/)
    savePensionScheme(db, partner, { client_ref: 'C2', letter_code: '1234567890' }, TODAY)
    expect(() => savePensionScheme(db, partner, { client_ref: 'C1', letter_code: '1234567890' }, TODAY)).toThrow(/already recorded for Beta Ltd/)
    // Staff aren't told the name of a client that isn't theirs.
    expect(() => savePensionScheme(db, staffA, { client_ref: 'C1', letter_code: '1234567890' }, TODAY)).toThrow(/already recorded for another client\./)
    expect(() => savePensionScheme(db, partner, { client_ref: 'C1', declaration_date: '2026-10-21' }, TODAY)).toThrow(/declaration date is in the future/)
    expect(() => savePensionScheme(db, partner, { client_ref: 'C1', last_payment_date: '2027-01-01' }, TODAY)).toThrow(/last payment date is in the future/)
    expect(() => savePensionScheme(db, staffB, { client_ref: 'C1' }, TODAY)).toThrow(/assigned to you/)
  })
})

describe('the Self Assessment registration and sources of income', () => {
  it('keeps one registration per client, checks the UTR, and fills the client record’s UTR when it has none', () => {
    const db = practice()
    // A UTR that fails its check is kept and flagged, and isn't copied to the client record.
    const wrong = saveSaRegistration(db, partner, { client_ref: 'C3', utr: '2234567802' })
    expect(wrong.utr).toBe('2234567802')
    expect(db.prepare("SELECT utr FROM clients WHERE ref = 'C3'").get()).toEqual({ utr: null })
    expect(db.prepare('SELECT issue_key, status, description FROM data_issues').all()).toEqual([
      { issue_key: `entered:sa_registrations:${wrong.id}:utr`, status: 'open', description: expect.stringMatching(/^UTR of the Self Assessment registration: Those 10 digits don’t pass the UTR check/) }
    ])
    expect(JSON.stringify(db.prepare('SELECT * FROM data_issues').all())).not.toContain('2234567802')
    const reg = saveSaRegistration(db, partner, { client_ref: 'C3', utr: '12345 67802', filing_route: ['client_gateway', 'own_agent'], first_year_on_file: '2019/20', last_year_on_file: '2024-25' })
    expect(db.prepare('SELECT status FROM data_issues').all()).toEqual([{ status: 'resolved' }])
    expect(reg).toMatchObject({ client_ref: 'C3', utr: '1234567802', filing_route: 'own_agent; client_gateway', first_year_on_file: '2019-20', last_year_on_file: '2024-25', income_sources: [] })
    expect((db.prepare("SELECT utr FROM clients WHERE ref = 'C3'").get() as { utr: string }).utr).toBe('1234567802')
    // Saving for the same client again changes the one registration.
    const again = saveSaRegistration(db, partner, { client_ref: 'C3', register_status: 'Active' })
    expect(again.id).toBe(reg.id)
    expect(db.prepare('SELECT COUNT(*) AS n FROM sa_registrations').get()).toEqual({ n: 1 })
    expect(() => saveSaRegistration(db, partner, { id: reg.id, first_year_on_file: '2025-26' })).toThrow(/last year on file is before the first/)
    expect(() => saveSaRegistration(db, partner, { id: reg.id, filing_route: ['carrier_pigeon'] })).toThrow(/how the return is filed/)
    deleteSaRegistration(db, partner, reg.id)
    expect(saRegistration(db, partner, 'C3')).toBeNull()
    expect(auditOf(db, 'Removed Self Assessment registration')[0].old).toMatchObject({ client_ref: 'C3', utr: '1234567802' })
  })

  it('leaves a UTR already on the client record as it is', () => {
    const db = practice()
    db.exec("UPDATE clients SET utr = '9987654321' WHERE ref = 'C3'")
    saveSaRegistration(db, partner, { client_ref: 'C3', utr: '1234567802' })
    expect((db.prepare("SELECT utr FROM clients WHERE ref = 'C3'").get() as { utr: string }).utr).toBe('9987654321')
    expect(auditOf(db, 'Updated client')).toEqual([])
  })

  it('adds, switches off and removes sources of income, once each', () => {
    const db = practice()
    const rent = saveIncomeSource(db, staffA, { client_ref: 'C1', source_type: 'property', detail: 'Flat in Leeds' })
    expect(rent).toMatchObject({ source_type: 'property', detail: 'Flat in Leeds', active: 1 })
    expect(() => saveIncomeSource(db, staffA, { client_ref: 'C1', source_type: 'property', detail: 'Flat in Leeds' })).toThrow(/already has that source/)
    expect(() => saveIncomeSource(db, staffA, { client_ref: 'C1', source_type: 'lottery' })).toThrow(/kind of income/)
    expect(saveIncomeSource(db, staffA, { client_ref: 'C1', source_type: 'employment' }).detail).toBe('')
    expect(saveIncomeSource(db, staffA, { id: rent.id, active: false }).active).toBe(0)
    expect(auditOf(db, 'Updated source of income')[0]).toMatchObject({ old: { active: 1 }, new: { active: 0 } })
    expect(() => saveIncomeSource(db, staffB, { id: rent.id, active: true })).toThrow(/assigned to you/)
    deleteIncomeSource(db, staffA, rent.id)
    expect(saveSaRegistration(db, staffA, { client_ref: 'C1' }).income_sources.map((i) => i.source_type)).toEqual(['employment'])
  })
})

describe('links between clients', () => {
  it('links two clients either way round, from either client’s file', () => {
    const db = practice()
    const director = saveRelationship(db, partner, { client_ref: 'C3', other_client_ref: 'C1', relationship_type: 'director_of', direction: 'outgoing', basis: 'Appointed 2019' })
    expect(director).toMatchObject({ from_client_ref: 'C3', to_client_ref: 'C1', relationship_type: 'director_of', direction: 'outgoing', other_client_name: 'Alpha Ltd' })
    expect(listRelationships(db, partner, 'C1')[0]).toMatchObject({ id: director.id, direction: 'incoming', other_client_name: 'Gamma Ltd' })
    const shareholder = saveRelationship(db, partner, { client_ref: 'C1', other_client_ref: 'C3', relationship_type: 'shareholder_of', direction: 'incoming' })
    expect(shareholder).toMatchObject({ from_client_ref: 'C3', to_client_ref: 'C1', direction: 'incoming' })
    expect(auditOf(db, 'Linked clients')[0].new).toMatchObject({ client_ref: 'C3', from_client_ref: 'C3', to_client_ref: 'C1', relationship_type: 'director_of' })
    deleteRelationship(db, partner, director.id, 'C1')
    expect(listRelationships(db, partner, 'C3').map((r) => r.relationship_type)).toEqual(['shareholder_of'])
    expect(auditOf(db, 'Removed link between clients')[0].old).toMatchObject({ client_ref: 'C1', relationship_type: 'director_of' })
  })

  it('refuses a link to itself, a kind not on the list, and the same link twice (either way round when it reads both ways)', () => {
    const db = practice()
    expect(() => saveRelationship(db, partner, { client_ref: 'C1', other_client_ref: 'C1', relationship_type: 'connected_to' })).toThrow(/linked to itself/)
    expect(() => saveRelationship(db, partner, { client_ref: 'C1', other_client_ref: 'C2', relationship_type: 'best_friends' })).toThrow(/how they are linked/)
    saveRelationship(db, partner, { client_ref: 'C1', other_client_ref: 'C2', relationship_type: 'connected_to' })
    expect(() => saveRelationship(db, partner, { client_ref: 'C2', other_client_ref: 'C1', relationship_type: 'connected_to' })).toThrow(/already linked that way/)
    // "Director of" reads one way only, so the other way round is a different link.
    saveRelationship(db, partner, { client_ref: 'C1', other_client_ref: 'C2', relationship_type: 'director_of' })
    expect(saveRelationship(db, partner, { client_ref: 'C2', other_client_ref: 'C1', relationship_type: 'director_of' }).from_client_ref).toBe('C2')
  })

  it('needs both clients to be ones the person may work on, and changes a link’s kind', () => {
    const db = practice()
    expect(() => saveRelationship(db, staffA, { client_ref: 'C1', other_client_ref: 'C2', relationship_type: 'connected_to' })).toThrow(/assigned to you/)
    const link = saveRelationship(db, partner, { client_ref: 'C1', other_client_ref: 'C2', relationship_type: 'connected_to' })
    expect(() => deleteRelationship(db, staffA, link.id, 'C1')).toThrow(/assigned to you/)
    expect(() => deleteRelationship(db, partner, link.id, 'C3')).toThrow(/isn’t on this client’s file/)
    const changed = saveRelationship(db, manager, { id: link.id, client_ref: 'C2', relationship_type: 'group_member' })
    expect(changed).toMatchObject({ relationship_type: 'group_member', from_client_ref: 'C1', to_client_ref: 'C2', direction: 'incoming' })
    expect(auditOf(db, 'Changed link between clients')[0]).toMatchObject({ old: { relationship_type: 'connected_to' }, new: { relationship_type: 'group_member' } })
  })
})

describe('other names', () => {
  it('adds, changes and removes other names, matching them the way imports do', () => {
    const db = practice()
    const a = saveAlias(db, staffA, { client_ref: 'C1', alias: 'Alpha & Sons Limited', alias_type: 'trading_as' })
    expect(a).toMatchObject({ alias: 'Alpha & Sons Limited', alias_type: 'trading_as' })
    expect(() => saveAlias(db, staffA, { client_ref: 'C1', alias: 'ALPHA AND SONS LTD' })).toThrow(/already has that name/)
    expect(() => saveAlias(db, staffA, { client_ref: 'C1', alias: 'alpha limited' })).toThrow(/client’s own name/)
    expect(() => saveAlias(db, staffA, { client_ref: 'C1', alias: '  ' })).toThrow(/Write the other name/)
    expect(() => saveAlias(db, staffA, { client_ref: 'C1', alias: 'Old Alpha', alias_type: 'nickname' })).toThrow(/what kind of name/)
    saveAlias(db, staffA, { id: a.id, alias_type: 'former_name' })
    expect(listAliases(db, staffA, 'C1')).toMatchObject([{ alias: 'Alpha & Sons Limited', alias_type: 'former_name' }])
    expect(() => saveAlias(db, staffB, { id: a.id, alias: 'x' })).toThrow(/assigned to you/)
    deleteAlias(db, staffA, a.id)
    expect(listAliases(db, staffA, 'C1')).toEqual([])
    expect(auditOf(db, 'Removed other name')[0].old).toMatchObject({ client_ref: 'C1', alias: 'Alpha & Sons Limited' })
  })
})

it('treats every change to these registers as a change the licence must allow', () => {
  const channels = PRELOAD_INVOKE_CHANNELS.filter((c) => /^registers:(save|delete)-(payroll|payroll-year|pension|sa|income|relationship|alias)$/.test(c))
  expect(channels).toHaveLength(14)
  expect(channels.map(classifyChannel).every((c) => c === 'write')).toBe(true)
})
