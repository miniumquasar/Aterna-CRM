import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bringDataFromEarlierBuilds } from '../../src/main/startup/data-folder'
import { bringDocumentsIn } from '../../src/main/startup/documents-folder'
import { auditOf, practice } from './helpers'

/** Two data folders: the one an earlier build used, and this build's. */
function folders(): { oldData: string; newData: string; oldDocs: string; newDocs: string } {
  const base = mkdtempSync(join(tmpdir(), 'docs-'))
  const oldData = join(base, 'companies-house-crm')
  const newData = join(base, 'AETERNA CRM')
  for (const d of [join(oldData, 'documents', 'C1'), join(newData, 'documents')]) mkdirSync(d, { recursive: true })
  return { oldData, newData, oldDocs: join(oldData, 'documents'), newDocs: join(newData, 'documents') }
}

describe('documents from an earlier data folder', () => {
  it('copies them into this folder and points their records there, once, with an audit entry each', () => {
    const { oldData, newData, oldDocs, newDocs } = folders()
    writeFileSync(join(oldDocs, 'C1', 'return.pdf'), 'the return')
    writeFileSync(join(oldDocs, 'C1', 'letter.pdf'), 'the old letter')
    mkdirSync(join(newDocs, 'C1'), { recursive: true })
    writeFileSync(join(newDocs, 'C1', 'letter.pdf'), 'a newer, different letter') // uploaded after the rename
    const db = practice()
    const add = db.prepare('INSERT INTO documents (client_ref, filename, file_path, file_size) VALUES (?, ?, ?, ?)')
    add.run('C1', 'return.pdf', join(oldDocs, 'C1', 'return.pdf'), 10)
    add.run('C1', 'letter.pdf', join(oldDocs, 'C1', 'letter.pdf'), 14)
    add.run('C1', 'gone.pdf', join(oldDocs, 'C1', 'gone.pdf'), 5)
    add.run('C1', 'elsewhere.pdf', join('/', 'somewhere', 'else.pdf'), 5)
    add.run('C1', 'letter.pdf', join(newDocs, 'C1', 'letter.pdf'), 25)

    expect(bringDocumentsIn(db, newDocs, ['', oldData, newData])).toEqual({ relinked: 2, copied: 2, missing: 1, elsewhere: 1 })
    const paths = (db.prepare('SELECT file_path FROM documents ORDER BY id').all() as Array<{ file_path: string }>).map((r) => r.file_path)
    expect(paths).toEqual([
      join(newDocs, 'C1', 'return.pdf'),
      join(newDocs, 'C1', 'letter (2).pdf'), // never on top of the different file already there
      join(oldDocs, 'C1', 'gone.pdf'), // not found: left as it was
      join('/', 'somewhere', 'else.pdf'),
      join(newDocs, 'C1', 'letter.pdf')
    ])
    expect(readFileSync(paths[1], 'utf8')).toBe('the old letter')
    expect(readFileSync(join(newDocs, 'C1', 'letter.pdf'), 'utf8')).toBe('a newer, different letter')
    expect(existsSync(join(oldDocs, 'C1', 'return.pdf'))).toBe(true) // copied, never moved
    expect(auditOf(db, 'Brought a document into the documents folder').map((e) => e.new)).toEqual([
      { client_ref: 'C1', file_path: paths[0] }, { client_ref: 'C1', file_path: paths[1] }
    ])
    // the next start finds nothing more to do
    expect(bringDocumentsIn(db, newDocs, [oldData])).toEqual({ relinked: 0, copied: 0, missing: 1, elsewhere: 1 })
  })

  it('relinks files the data folder step already brought across, without copying them again', () => {
    const { oldData, newData, oldDocs, newDocs } = folders()
    writeFileSync(join(oldData, 'aeterna.db'), 'db')
    writeFileSync(join(oldDocs, 'C1', 'scan.jpg'), 'pixels')
    expect(bringDataFromEarlierBuilds(newData, [oldData])).toEqual({ from: oldData })
    expect(readFileSync(join(newDocs, 'C1', 'scan.jpg'), 'utf8')).toBe('pixels')
    const db = practice()
    db.prepare('INSERT INTO documents (client_ref, filename, file_path, file_size) VALUES (?, ?, ?, ?)').run('C1', 'scan.jpg', join(oldDocs, 'C1', 'scan.jpg'), 6)
    expect(bringDocumentsIn(db, newDocs, [oldData])).toEqual({ relinked: 1, copied: 0, missing: 0, elsewhere: 0 })
  })
})
