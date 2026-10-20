/**
 * The practice's rule for references (Level 5): one that fails its check is
 * kept as entered and flagged on the client file, never refused; the flag
 * closes when it is corrected, and so does the workbook import's own issue
 * about it. Made-up data only.
 */
import { describe, expect, it } from 'vitest'
import { createClient, importClients, updateClient } from '../../src/main/records/clients'
import { saveSaRegistration } from '../../src/main/records/client-registers'
import { clientHasFailing } from '../../src/main/records/reference-flags'
import { keepReference, checkUtr, checkVatNumber } from '../../src/shared/references'
import { auditOf, manager, partner, practice, staffA } from './helpers'

type Issue = { issue_key: string; client_ref: string | null; field: string; status: string; description: string; source: string; resolved_by: string | null }
const issues = (db: ReturnType<typeof practice>): Issue[] =>
  db.prepare('SELECT issue_key, client_ref, field, status, description, source, resolved_by FROM data_issues ORDER BY id').all() as Issue[]
const record = (db: ReturnType<typeof practice>, ref: string): Record<string, unknown> =>
  db.prepare('SELECT * FROM clients WHERE ref = ?').get(ref) as Record<string, unknown>
const idOf = (db: ReturnType<typeof practice>, ref: string): number => record(db, ref).id as number

describe('keepReference', () => {
  it('tidies a reference that passes, and keeps one that fails as typed, with the reason', () => {
    expect(keepReference(' 12345 67802 ', checkUtr)).toEqual({ value: '1234567802', warning: null, problem: null })
    expect(keepReference('  22345   67802 ', checkUtr)).toEqual({ value: '22345 67802', warning: null, problem: 'Those 10 digits don’t pass the UTR check. Look for a mistyped digit.' })
  })
})

describe('the client record’s references', () => {
  it('tidies what passes, keeps what fails as entered, flags it without repeating it, and closes the flag when corrected', () => {
    const db = practice()
    const id = idOf(db, 'C3')
    updateClient(db, staffA === undefined ? partner : partner, id, { utr: '22345 67802', vat_no: 'GB 123 4567 82', reg_no: '1234567' })
    expect(record(db, 'C3')).toMatchObject({ utr: '22345 67802', vat_no: '123456782', reg_no: '01234567' })
    expect(issues(db)).toEqual([
      expect.objectContaining({ issue_key: `entered:clients:${id}:utr`, client_ref: 'C3', field: 'utr', status: 'open', source: 'Entered in the app' })
    ])
    expect(issues(db)[0].description).toBe('UTR on the client record: Those 10 digits don’t pass the UTR check. Look for a mistyped digit.')
    expect(JSON.stringify(issues(db))).not.toContain('2234567802')
    expect(auditOf(db, 'Flagged a reference')).toHaveLength(1)

    // Saving the record without touching the UTR leaves the flag as it is.
    updateClient(db, partner, id, { utr: '22345 67802', notes: 'Asked the client for the HMRC letter' })
    expect(issues(db)).toHaveLength(1)
    expect(auditOf(db, 'Flagged a reference')).toHaveLength(1)

    updateClient(db, partner, id, { utr: '12345 67802' })
    expect(record(db, 'C3').utr).toBe('1234567802')
    expect(issues(db)[0]).toMatchObject({ status: 'resolved', resolved_by: 'Partner P' })
    expect(clientHasFailing(db, 'C3', 'utr')).toBe(false)
  })

  it('flags a new client’s reference, and those of clients pasted from a spreadsheet', () => {
    const db = practice()
    const made = createClient(db, partner, { client_name: 'Delta Ltd', vat_no: '123 4567 89' })
    expect(record(db, made.ref!).vat_no).toBe('123 4567 89')
    expect(issues(db)).toEqual([expect.objectContaining({ issue_key: `entered:clients:${made.id}:vat_no`, client_ref: made.ref, field: 'vat_no' })])
    expect(checkVatNumber('123 4567 89').ok).toBe(false)

    importClients(db, manager, [{ client_name: 'Epsilon Ltd', ref: 'E1', nino: 'QQ123' }, { client_name: 'Zeta Ltd', ref: 'Z1', nino: 'AB 12 34 56 C' }])
    expect(record(db, 'E1').nino).toBe('QQ123')
    expect(record(db, 'Z1').nino).toBe('AB123456C')
    expect(issues(db).map((i) => [i.client_ref, i.field])).toEqual([[made.ref, 'vat_no'], ['E1', 'nino']])
    expect(JSON.stringify(issues(db))).not.toContain('QQ123')
  })

  it('closes the workbook import’s issue once nothing on the client fails that check', () => {
    const db = practice()
    db.exec(`INSERT INTO data_issues (issue_key, severity, issue_type, entity_table, client_ref, field, description, status, source) VALUES
      ('IMP:invalid_identifier:Self_Assessment:SA1:UTR', 'high', 'import:invalid_identifier', 'Self_Assessment', 'C3', 'UTR', 'UTR — UTR fails HMRC check digit', 'open', 'workbook'),
      ('IMP:invalid_identifier:Self_Assessment:SA1:NINO', 'medium', 'import:invalid_identifier', 'Self_Assessment', 'C3', 'NINO', 'invalid National Insurance number', 'open', 'workbook')`)
    // The SA registration still holds a UTR that fails, so the import's issue stays open…
    saveSaRegistration(db, partner, { client_ref: 'C3', utr: '2234567802' })
    updateClient(db, partner, idOf(db, 'C3'), { utr: '1234567802' })
    expect(issues(db).filter((i) => i.issue_key.startsWith('IMP:')).map((i) => i.status)).toEqual(['open', 'open'])
    // …until it is corrected too. Clearing a reference isn't a correction: the NINO issue stays.
    saveSaRegistration(db, partner, { client_ref: 'C3', utr: '1234567802' })
    updateClient(db, partner, idOf(db, 'C3'), { nino: '' })
    expect(issues(db).filter((i) => i.issue_key.startsWith('IMP:')).map((i) => i.status)).toEqual(['resolved', 'open'])
    expect(auditOf(db, 'Closed a flagged reference').map((a) => (a.new as { issue_key: string }).issue_key)).toContain('IMP:invalid_identifier:Self_Assessment:SA1:UTR')
  })
})
