import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { executeTool } from '../../src/main/records/assistant-tools'
import { deleteMessage, listMessages, recordMessage } from '../../src/main/records/communications'
import { dashboardStats } from '../../src/main/records/dashboard'
import {
  deleteDocumentRecord, destinationFor, documentToOpen, folderFor, isInside, listDocuments, opensDirectly, prepareUpload, recordDocument, safeFileName
} from '../../src/main/records/documents'
import { deleteTemplate, getTemplate, listTemplates, resetTemplate, upsertTemplate } from '../../src/main/records/templates'
import { auditOf, local, manager, partner, practice, staffA, staffB } from './helpers'

const ROOT = join('/', 'data', 'documents')

describe('documents', () => {
  it('keeps every file inside the documents folder, whatever the client code or name', () => {
    expect(folderFor('C1')).toBe('C1')
    expect(folderFor('../../etc')).toBe('__.._etc') // one folder name, never a step up
    expect(folderFor('C:\\Windows')).toBe('C__Windows')
    expect(folderFor('CON')).toMatch(/^client_/)
    expect(safeFileName('../../secret.pdf')).toBe('secret.pdf')
    expect(safeFileName('C:\\Users\\a\\letter.docx')).toBe('letter.docx')
    expect(safeFileName('bad:name?.pdf')).toBe('bad_name_.pdf')
    expect(safeFileName('')).toMatch(/^document_/)
    expect(isInside(ROOT, join(ROOT, 'C1', 'a.pdf'))).toBe(true)
    expect(isInside(ROOT, join(ROOT, '..', 'aeterna.db'))).toBe(false)
    expect(isInside(ROOT, ROOT)).toBe(false)
    const taken = new Set([join(ROOT, 'C1', 'a.pdf'), join(ROOT, 'C1', 'a (2).pdf')])
    expect(destinationFor(ROOT, 'C1', 'a.pdf', (p) => taken.has(p))).toBe(join(ROOT, 'C1', 'a (3).pdf'))
  })

  it('opens only document types; anything else, including types nobody listed, is shown in its folder', () => {
    for (const f of ['return.pdf', 'book.XLSX', 'macro.xlsm', 'letter.docx', 'scan.jpg', 'notes.txt', 'mail.msg', 'records.zip']) expect([f, opensDirectly(f)]).toEqual([f, true])
    for (const f of ['setup.exe', 'run.BAT', 'x.ps1', 'link.lnk', 'tool.app', 'addin.xlam', 'page.html', 'thing.svg', 'a.library-ms', 'noextension', 'x.pdf.exe'])
      expect([f, opensDirectly(f)]).toEqual([f, false])
  })

  it('opens by id within the folder, scoped to staff’s clients; only partners delete', () => {
    const db = practice()
    const doc = recordDocument(db, staffA, { clientRef: 'C1', fileName: 'a.pdf', filePath: join(ROOT, 'C1', 'a.pdf'), category: 'General', size: 10 })
    db.prepare("INSERT INTO documents (client_ref, filename, file_path) VALUES ('C1', 'outside.pdf', ?)").run(join('/', 'tmp', 'outside.pdf'))
    expect(listDocuments(db, staffA, 'C1')).toHaveLength(2)
    expect(() => listDocuments(db, staffB, 'C1')).toThrow(/assigned to you/)
    expect(documentToOpen(db, staffA, doc.id, ROOT).filename).toBe('a.pdf')
    expect(() => documentToOpen(db, staffB, doc.id, ROOT)).toThrow(/assigned to you/)
    expect(() => documentToOpen(db, partner, doc.id + 1, ROOT)).toThrow(/isn’t in the app’s documents folder/)
    expect(() => prepareUpload(db, staffB, 'C1', 'x.pdf', 'General')).toThrow(/assigned to you/)
    expect(() => deleteDocumentRecord(db, staffA, doc.id, ROOT)).toThrow(/Only a partner/)
    expect(deleteDocumentRecord(db, partner, doc.id, ROOT)).toBe(join(ROOT, 'C1', 'a.pdf'))
    expect(deleteDocumentRecord(db, partner, doc.id + 1, ROOT)).toBeNull() // record gone; a file outside the folder is never touched
    expect(auditOf(db, 'Deleted document')).toHaveLength(2)
  })
})

describe('messages sent', () => {
  it('records the person signed in as the sender, and keeps staff to their clients', () => {
    const db = practice()
    const { id } = recordMessage(db, staffA, { client_ref: 'C1', channel: 'email', subject: 'Hello', sent_by: 'Partner P' })
    expect(listMessages(db, staffA, 'C1')[0]).toMatchObject({ id, sent_by: 'Staff A', client_name: 'Alpha Ltd' })
    expect(listMessages(db, staffB)).toEqual([])
    expect(() => recordMessage(db, staffB, { client_ref: 'C1', channel: 'email' })).toThrow(/assigned to you/)
    expect(() => recordMessage(db, staffA, { client_ref: 'C1', channel: 'fax' })).toThrow(/how the message was sent/)
    expect(() => deleteMessage(db, staffB, id)).toThrow(/assigned to you/)
    deleteMessage(db, staffA, id)
    expect(auditOf(db, 'Removed message from the log')[0].old).toMatchObject({ subject: 'Hello' })
  })
})

describe('email templates', () => {
  it('lets anyone on a client change that client’s version, and only managers the practice’s', () => {
    const db = practice()
    upsertTemplate(db, manager, { template_key: 'welcome', label: 'Welcome', subject: 'Hi', body: 'Welcome aboard' })
    expect(() => upsertTemplate(db, staffA, { template_key: 'welcome', subject: 'Hey', body: 'x' })).toThrow(/Only partners and managers/)
    upsertTemplate(db, staffA, { template_key: 'welcome', client_ref: 'C1', subject: 'Hi Alpha', body: 'For you' })
    upsertTemplate(db, staffB, { template_key: 'welcome', client_ref: 'C2', subject: 'Hi Beta', body: 'For you' })
    expect(getTemplate(db, staffA, 'welcome', 'C1')?.subject).toBe('Hi Alpha')
    expect(listTemplates(db, staffA).map((t) => t.client_ref)).toEqual([null, 'C1'])
    expect(listTemplates(db, partner)).toHaveLength(3)
    expect(() => getTemplate(db, staffA, 'welcome', 'C2')).toThrow(/assigned to you/)
    expect(() => upsertTemplate(db, staffA, { template_key: 'Bad Key!', client_ref: 'C1', subject: 's', body: 'b' })).toThrow(/template key/)
  })

  it('resets built-in templates rather than deleting them, and audits every change', () => {
    const db = practice()
    const { id } = upsertTemplate(db, manager, { template_key: 'welcome', label: 'Welcome', subject: 'Edited', body: 'Edited body' })
    expect(() => deleteTemplate(db, manager, id, new Set(['welcome']))).toThrow(/reset/)
    resetTemplate(db, manager, 'welcome', { label: 'Welcome', subject: 'Original', body: 'Original body' })
    expect(getTemplate(db, partner, 'welcome')?.subject).toBe('Original')
    expect(auditOf(db, 'Reset email template to the original wording')[0]).toMatchObject({ old: { subject: 'Edited' }, new: { subject: 'Original' } })
    const own = upsertTemplate(db, manager, { template_key: 'custom', subject: 's', body: 'b' })
    deleteTemplate(db, manager, own.id, new Set(['welcome']))
    expect(() => resetTemplate(db, staffA, 'welcome', { label: 'W', subject: 'S', body: 'B' })).toThrow(/Only partners and managers/)
  })
})

describe('dashboard', () => {
  it('shows staff their own clients’ figures and their own recent activity', () => {
    const db = practice()
    db.exec(`UPDATE clients SET accounts_due = '${local(-5)}' WHERE ref IN ('C1', 'C2')`)
    db.exec(`INSERT INTO payments (client_ref, amount_pence, due_date) VALUES ('C1', 1000, '${local(-1)}'), ('C2', 2000, '${local(-1)}')`)
    db.exec("INSERT INTO audit_log (user_name, action) VALUES ('Staff A', 'mine'), ('Staff B', 'theirs')")
    const a = dashboardStats(db, staffA)
    expect(a).toMatchObject({ totalClients: 1, currentClients: 1, activeClients: 1, noLongerClients: 0, overdueCount: 1, totalARPence: 1000, overdueARPence: 1000, overdueInvoices: 1 })
    expect(a.recentActivity.map((r) => r.action)).toEqual(['mine'])
    expect(dashboardStats(db, partner)).toMatchObject({ totalClients: 3, overdueCount: 2, totalARPence: 3000 })
  })
})

describe('the assistant’s tools', () => {
  const never = (): string | null => null
  it('reach only the person’s own clients and never return secrets', () => {
    const db = practice()
    const found = executeTool('search_clients', { query: 'Ltd' }, staffA, db, never) as Array<{ ref: string }>
    expect(found.map((c) => c.ref)).toEqual(['C1'])
    expect(executeTool('search_clients', { query: '%' }, partner, db, never)).toEqual([]) // literal search
    const client = executeTool('get_client', { ref: 'C1' }, staffA, db, never) as Record<string, unknown>
    expect(client).toMatchObject({ nino: '•••••••6C', auth_code: '••••C3' })
    expect(() => executeTool('get_client', { ref: 'C2' }, staffA, db, never)).toThrow(/assigned to you/)
    expect(executeTool('count_clients_by_category', {}, staffA, db, never)).toEqual([{ client_category: 'company', count: 1 }])
  })

  it('give the same deadlines as Compliance → Deadlines, the register’s and the client record’s, for the person’s own clients', () => {
    const db = practice()
    db.exec(`INSERT INTO compliance_periods (client_ref, obligation, period_key, due_date) VALUES
      ('C1', 'vat_return', 'q1', '${local(-12)}'), ('C1', 'ae_redeclaration', '2027-01-01', '${local(10)}'), ('C2', 'annual_accounts', '2026', '${local(-3)}')`)
    db.exec(`UPDATE clients SET conf_stmt_due = '${local(5)}' WHERE ref = 'C1'`)
    const mine = executeTool('get_deadlines', { days: 30 }, staffA, db, never) as Array<Record<string, unknown>>
    expect(mine.map((d) => [d.client_ref, d.deadline, d.when])).toEqual([
      ['C1', 'VAT return', '12 days overdue'],
      ['C1', 'Confirmation statement', 'due in 5 days'],
      ['C1', 'Auto-enrolment re-declaration', 'due in 10 days']
    ])
    const overdue = executeTool('get_overdue_clients', {}, partner, db, never) as Array<{ ref: string; overdue: number; oldest_days_late: number }>
    expect(overdue.map((c) => [c.ref, c.overdue, c.oldest_days_late])).toEqual([['C1', 1, 12], ['C2', 1, 3]])
    expect((executeTool('get_overdue_clients', {}, staffB, db, never) as Array<{ ref: string }>).map((c) => c.ref)).toEqual(['C2'])
  })

  it('make changes through the same rules and audit, and not while the app is read-only', () => {
    const db = practice()
    expect(executeTool('create_task', { client_ref: 'C1', description: 'Chase records', due_date: '2026-11-01' }, staffA, db, never)).toMatchObject({ created: true })
    expect(auditOf(db, 'Created task')[0].user_name).toBe('Staff A')
    expect(() => executeTool('create_task', { client_ref: 'C2', description: 'x', due_date: '2026-11-01' }, staffA, db, never)).toThrow(/assigned to you/)
    expect(() => executeTool('update_client_note', { client_ref: 'C1', note: 'x' }, staffA, db, () => 'Your licence has expired, so the app is read-only.'))
      .toThrow(/read-only/)
    executeTool('update_client_note', { client_ref: 'C1', note: 'Called today' }, staffA, db, never)
    expect(auditOf(db, 'Updated client')[0].new).toMatchObject({ remarks: 'Called today' })
    expect(executeTool('save_template', { template_key: 'welcome', subject: 's', body: 'b' }, staffA, db, never)).toMatchObject({ saved: false })
  })
})
