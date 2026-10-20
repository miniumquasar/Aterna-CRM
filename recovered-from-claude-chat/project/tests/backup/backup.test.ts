import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openWithKey } from '../../src/main/db/open-database'
import { databaseKeyFile } from '../../src/main/db/database-key'
import { backupKeys, CHUNK, decryptFile, encryptFile, openBuffer, sealBuffer } from '../../src/main/backup/crypto'
import { MAGIC, readBackupHeader } from '../../src/main/backup/file'
import { makeBackup } from '../../src/main/backup/create'
import { applyPendingRestore, inspectBackup, restoreMarkerPath, stageRestore, testBackup } from '../../src/main/backup/restore'
import { blobPath, blobsIn, storeFolderIn } from '../../src/main/backup/store'
import { cleanUpStore, copyBackup } from '../../src/main/backup/maintain'
import { fingerprintOf, keyFromSheet } from '../../src/main/backup/keys'
import { formatRecoveryKey } from '../../src/main/security/recovery-sheet'
import { APP_MIGRATION, KEY, OTHER_KEY, practice } from './helpers'

const scratch = (): string => mkdtempSync(join(tmpdir(), 'aeterna-bk-'))
const opens = (key: string) => (p: string): boolean => {
  try {
    const db = openWithKey(p, key)
    const ok = String(db.pragma('quick_check', { simple: true })) === 'ok'
    db.close()
    return ok
  } catch {
    return false
  }
}
const read = (dbPath: string, key: string, sql: string): unknown => {
  const db = openWithKey(dbPath, key)
  try {
    return db.prepare(sql).all()
  } finally {
    db.close()
  }
}

describe('backup encryption', () => {
  it('round-trips every chunk boundary, and refuses anything changed, cut short, added to or under another key', async () => {
    const keys = backupKeys(KEY)
    const dir = scratch()
    for (const size of [0, 1, CHUNK - 1, CHUNK, CHUNK + 1, 2 * CHUNK, 2 * CHUNK + 5]) {
      const plain = Buffer.alloc(size, 7)
      plain.write(`size ${size}`, 0)
      const src = join(dir, `p${size}`)
      const enc = join(dir, `e${size}`)
      writeFileSync(src, plain)
      const written = await encryptFile(keys, 'document', src, enc)
      expect(written.bytes).toBe(size)
      const pieces: Buffer[] = []
      const back = await decryptFile(keys, 'document', enc, (b) => void pieces.push(Buffer.from(b)))
      expect(Buffer.concat(pieces).equals(plain)).toBe(true)
      expect(back.sha256).toBe(written.sha256)
      // A different purpose, or another key, can't open it.
      await expect(decryptFile(keys, 'index', enc, null)).rejects.toThrow()
      await expect(decryptFile(backupKeys(OTHER_KEY), 'document', enc, null)).rejects.toThrow()
    }
    // One byte changed in the middle.
    const big = join(dir, `e${2 * CHUNK + 5}`)
    const bytes = readFileSync(big)
    bytes[CHUNK + 100] ^= 1
    writeFileSync(join(dir, 'flipped'), bytes)
    await expect(decryptFile(keys, 'document', join(dir, 'flipped'), null)).rejects.toThrow(/changed or damaged/)
    // The last chunk removed: the one before isn't marked as the last.
    writeFileSync(join(dir, 'cut'), readFileSync(big).subarray(0, 16 + 2 * (CHUNK + 16)))
    await expect(decryptFile(keys, 'document', join(dir, 'cut'), null)).rejects.toThrow()
    // Something added at the end.
    copyFileSync(big, join(dir, 'longer'))
    appendFileSync(join(dir, 'longer'), Buffer.alloc(40))
    await expect(decryptFile(keys, 'document', join(dir, 'longer'), null)).rejects.toThrow()

    const sealed = sealBuffer(keys, 'index', Buffer.from('{"version":1}'))
    expect(openBuffer(keys, 'index', sealed).toString()).toBe('{"version":1}')
    expect(() => openBuffer(keys, 'document', sealed)).toThrow()
  })

  it('reads a key back from the recovery sheet, and names the sheet a backup needs', () => {
    const typed = formatRecoveryKey(KEY).join(' ').toLowerCase()
    expect(keyFromSheet(typed, fingerprintOf(KEY))).toEqual({ ok: true, key: KEY })
    const wrong = keyFromSheet(formatRecoveryKey(OTHER_KEY).join(''), fingerprintOf(KEY))
    expect(wrong.ok).toBe(false)
    expect(!wrong.ok && wrong.error).toContain(fingerprintOf(KEY))
    expect(keyFromSheet('not a key', null).ok).toBe(false)
  })
})

describe('making a backup', () => {
  it('holds the database and every document, encrypted, each document kept once', async () => {
    const p = practice()
    const a = p.addDocument('CL0001', 'passport scan.pdf', 'PASSPORT OF A MADE UP PERSON')
    p.addDocument('CL0002', 'copy.pdf', 'PASSPORT OF A MADE UP PERSON') // same content
    p.addDocument('CL0002', 'letter.pdf', Buffer.alloc(CHUNK * 2 + 3, 1))
    const made = await makeBackup(p.source, p.store, { kind: 'manual', actor: { id: 1, name: 'Pat Partner' }, notes: 'before year end' })

    expect(made.header).toMatchObject({ format: 'aeterna-crm-backup', version: 2, keyFingerprint: fingerprintOf(KEY), kind: 'manual', migration: APP_MIGRATION })
    expect(made.header.counts).toEqual({ clients: 2, documents: 3, users: 0 })
    expect(made.header.documents).toMatchObject({ stored: 3, missing: 0 })
    expect(blobsIn(p.store)).toHaveLength(2)
    expect(made.newDocuments).toBe(2)
    const file = readFileSync(made.path)
    expect(file.subarray(0, 8).equals(MAGIC)).toBe(true)
    for (const secret of ['Made Up Trading Ltd', 'PASSPORT OF A MADE UP PERSON', 'passport scan.pdf', 'CL0001']) {
      expect(file.includes(Buffer.from(secret))).toBe(false)
      for (const b of blobsIn(p.store)) expect(readFileSync(blobPath(p.store, b)).includes(Buffer.from(secret))).toBe(false)
    }
    expect(readFileSync(join(p.store, 'README.txt'), 'utf8')).toContain(fingerprintOf(KEY))
    expect(p.db.prepare('SELECT kind, format, key_fingerprint, clients, documents, created_by, notes FROM backup_registry').get()).toEqual({
      kind: 'manual', format: 2, key_fingerprint: fingerprintOf(KEY), clients: 2, documents: 3, created_by: 'Pat Partner', notes: 'before year end'
    })
    expect(p.db.prepare("SELECT user_name, action FROM audit_log WHERE table_name = 'backup_registry'").get()).toEqual({ user_name: 'Pat Partner', action: 'Made a backup' })

    // Nothing changed: the next backup adds no documents. A changed document is stored again.
    p.setNow('2026-10-12T10:00:00Z')
    const again = await makeBackup(p.source, p.store, { kind: 'scheduled', actor: null, notes: null })
    expect(again.newDocuments).toBe(0)
    writeFileSync(a.path, 'PASSPORT, RENEWED')
    p.setNow('2026-10-12T11:00:00Z')
    const third = await makeBackup(p.source, p.store, { kind: 'scheduled', actor: null, notes: null })
    expect(third.newDocuments).toBe(1)
    expect(blobsIn(p.store)).toHaveLength(3)
    expect(readdirSync(p.store).filter((f) => f.endsWith('.aeterna-backup'))).toHaveLength(3)
    expect(readdirSync(p.store).some((f) => f.endsWith('.partial'))).toBe(false)
  })

  it('lists documents it couldn’t find, and never reads files outside the documents folder', async () => {
    const p = practice()
    const gone = p.addDocument('CL0001', 'gone.pdf', 'x')
    rmSync(gone.path)
    const outside = join(p.dir, 'elsewhere.pdf')
    writeFileSync(outside, 'NOT IN THE DOCUMENTS FOLDER')
    p.db.prepare("INSERT INTO documents (client_ref, filename, file_path, category) VALUES ('CL0001', 'elsewhere.pdf', ?, 'General')").run(outside)
    const made = await makeBackup(p.source, p.store, { kind: 'manual', actor: null, notes: null })
    expect(made.header.documents).toEqual({ stored: 0, bytes: 0, missing: 2 })
    expect(blobsIn(p.store)).toHaveLength(0)
  })
})

describe('testing a backup', () => {
  it('passes a good backup, and finds missing or damaged documents and a changed header', async () => {
    const p = practice()
    p.addDocument('CL0001', 'a.pdf', 'first document')
    p.addDocument('CL0001', 'b.pdf', 'second document')
    const made = await makeBackup(p.source, p.store, { kind: 'manual', actor: null, notes: null })
    const work = join(p.dir, 'work')
    const good = await testBackup(made.path, KEY, { workDir: work, appMigration: APP_MIGRATION })
    expect(good).toMatchObject({ ok: true, counts: { clients: 2, documents: 2 }, documents: { expected: 2, checked: 2, notInFolder: 0, damaged: 0 } })
    expect(good.summary).toMatch(/Everything restores/)
    expect(readdirSync(work)).toEqual([])

    const wrongKey = await testBackup(made.path, OTHER_KEY, { workDir: work, appMigration: APP_MIGRATION })
    expect(wrongKey.ok).toBe(false)
    expect(wrongKey.problems[0]).toContain(fingerprintOf(KEY))

    const [first, second] = blobsIn(p.store)
    rmSync(blobPath(p.store, first))
    const bytes = readFileSync(blobPath(p.store, second))
    bytes[bytes.length - 20] ^= 1
    writeFileSync(blobPath(p.store, second), bytes)
    const bad = await testBackup(made.path, KEY, { workDir: work, appMigration: APP_MIGRATION })
    expect(bad).toMatchObject({ ok: false, documents: { expected: 2, checked: 0, notInFolder: 1, damaged: 1 } })

    // A header edited to claim more clients: refused once the key is given.
    const file = readFileSync(made.path)
    const text = file.toString('latin1').replace('"clients":2', '"clients":3')
    writeFileSync(made.path, Buffer.from(text, 'latin1'))
    const changed = await testBackup(made.path, KEY, { workDir: work, appMigration: APP_MIGRATION })
    expect(changed.problems[0]).toMatch(/header has been changed or damaged/)
  })

  it('says when a backup file is incomplete, or not a backup at all', async () => {
    const p = practice()
    const made = await makeBackup(p.source, p.store, { kind: 'manual', actor: null, notes: null })
    truncateSync(made.path, statSync(made.path).size - 10)
    await expect(readBackupHeader(made.path)).rejects.toThrow(/incomplete/)
    const other = join(p.dir, 'notes.aeterna-backup')
    writeFileSync(other, 'hello')
    await expect(inspectBackup(other, APP_MIGRATION)).rejects.toThrow(/isn’t an AETERNA CRM backup/)
  })
})

describe('restoring', () => {
  it('on the same PC: database back as it was, documents put back, changed ones kept aside', async () => {
    const p = practice()
    const kept = p.addDocument('CL0001', 'engagement.pdf', 'ORIGINAL ENGAGEMENT LETTER')
    const deleted = p.addDocument('CL0002', 'id.pdf', 'ORIGINAL ID')
    const made = await makeBackup(p.source, p.store, { kind: 'manual', actor: null, notes: null })

    p.db.exec("UPDATE clients SET client_name = 'Renamed After Backup' WHERE ref = 'CL0001'")
    writeFileSync(kept.path, 'EDITED AFTER THE BACKUP')
    rmSync(deleted.path)
    const later = p.addDocument('CL0001', 'later.pdf', 'ADDED AFTER THE BACKUP')

    const staged = await stageRestore(made.path, KEY, { dataDir: p.dir, docsDir: p.docsDir, appMigration: APP_MIGRATION, writeKey: false, actor: { id: 1, name: 'Pat Partner' } })
    expect(staged.documents).toEqual({ toRestore: 2, unchanged: 0, notInFolder: 0, damaged: 0, outside: 0 })
    expect(existsSync(restoreMarkerPath(p.dir))).toBe(true)
    // Nothing live has changed yet.
    expect(readFileSync(kept.path, 'utf8')).toBe('EDITED AFTER THE BACKUP')

    p.db.close()
    const keyStore = databaseKeyFile(join(p.dir, 'database-key.json'))
    keyStore.write({ key: KEY, origin: 'generated' })
    const outcome = applyPendingRestore(p.dir, p.dbPath, p.docsDir, keyStore, opens(KEY), new Date('2026-10-13T08:00:00Z'))
    expect(outcome.restored).toBe(true)
    expect(outcome.notice).toMatch(/Restored from the backup made/)
    expect(read(p.dbPath, KEY, "SELECT client_name FROM clients WHERE ref = 'CL0001'")).toEqual([{ client_name: 'Made Up Trading Ltd' }])
    expect(readFileSync(kept.path, 'utf8')).toBe('ORIGINAL ENGAGEMENT LETTER')
    expect(readFileSync(deleted.path, 'utf8')).toBe('ORIGINAL ID')
    expect(readFileSync(later.path, 'utf8')).toBe('ADDED AFTER THE BACKUP') // left where it was
    const aside = readdirSync(p.dir).find((f) => f.startsWith('kept-before-restore-')) as string
    expect(readFileSync(join(p.dir, aside, 'CL0001', 'engagement.pdf'), 'utf8')).toBe('EDITED AFTER THE BACKUP')
    expect(readdirSync(p.dir).some((f) => f.startsWith('aeterna.before-restore-'))).toBe(true)
    expect(existsSync(join(p.dir, 'restore-staging'))).toBe(false)
    expect(existsSync(restoreMarkerPath(p.dir))).toBe(false)
    expect(read(p.dbPath, KEY, "SELECT user_name, action FROM audit_log WHERE action = 'Restored from a backup'")).toEqual([{ user_name: 'Pat Partner', action: 'Restored from a backup' }])
  })

  it('on a new PC: the key from the recovery sheet goes in the key file, documents land in the new folder', async () => {
    const old = practice()
    old.addDocument('CL0001', 'accounts 2025.pdf', 'ACCOUNTS')
    const made = await makeBackup(old.source, old.store, { kind: 'manual', actor: null, notes: null })
    // Copy the whole backup folder to "a USB drive".
    const usb = scratch()
    const onUsb = await copyBackup(made.path, backupKeys(KEY), storeFolderIn(usb, fingerprintOf(KEY)), fingerprintOf(KEY))

    // The new PC: a fresh installation with its own key.
    const pc = scratch()
    const dbPath = join(pc, 'aeterna.db')
    const docsDir = join(pc, 'documents')
    const fresh = openWithKey(dbPath, OTHER_KEY)
    fresh.exec('CREATE TABLE placeholder (x)')
    fresh.close()
    const keyStore = databaseKeyFile(join(pc, 'database-key.json'))
    keyStore.write({ key: OTHER_KEY, origin: 'generated' })

    const typed = keyFromSheet(formatRecoveryKey(KEY).join(' '), fingerprintOf(KEY))
    expect(typed.ok).toBe(true)
    const backupOnUsb = join(onUsb.folder, onUsb.filename)
    const summary = await inspectBackup(backupOnUsb, APP_MIGRATION)
    expect(summary).toMatchObject({ format: 2, keyFingerprint: fingerprintOf(KEY), counts: { clients: 2, documents: 1 }, documentsInFolder: 1, newerThanApp: false })
    await stageRestore(backupOnUsb, KEY, { dataDir: pc, docsDir, appMigration: APP_MIGRATION, writeKey: true, actor: null })
    const outcome = applyPendingRestore(pc, dbPath, docsDir, keyStore, (p) => opens(keyStore.read()?.key as string)(p))
    expect(outcome.restored).toBe(true)
    expect(keyStore.read()?.key).toBe(KEY)
    const docs = read(dbPath, KEY, 'SELECT filename, file_path FROM documents') as Array<{ filename: string; file_path: string }>
    expect(docs).toEqual([{ filename: 'accounts 2025.pdf', file_path: join(docsDir, 'CL0001', 'accounts 2025.pdf') }])
    expect(readFileSync(docs[0].file_path, 'utf8')).toBe('ACCOUNTS')
  })

  it('puts the database and key file back when the restored database won’t open', async () => {
    const p = practice()
    const made = await makeBackup(p.source, p.store, { kind: 'manual', actor: null, notes: null })
    await stageRestore(made.path, KEY, { dataDir: p.dir, docsDir: p.docsDir, appMigration: APP_MIGRATION, writeKey: true, actor: null })
    p.db.exec("UPDATE clients SET client_name = 'Current' WHERE ref = 'CL0001'")
    p.db.close()
    const keyStore = databaseKeyFile(join(p.dir, 'database-key.json'))
    keyStore.write({ key: KEY, origin: 'generated' })
    const refused = applyPendingRestore(p.dir, p.dbPath, p.docsDir, keyStore, () => false)
    expect(refused.restored).toBe(false)
    expect(refused.notice).toMatch(/didn’t work.*as it was/)
    expect(read(p.dbPath, KEY, "SELECT client_name FROM clients WHERE ref = 'CL0001'")).toEqual([{ client_name: 'Current' }])
    expect(keyStore.read()?.key).toBe(KEY)
    expect(existsSync(restoreMarkerPath(p.dir))).toBe(false)
    expect(applyPendingRestore(p.dir, p.dbPath, p.docsDir, keyStore, () => true)).toEqual({ restored: false, notice: null })
  })

  it('finishes a swap an earlier start was cut off in, and still reads requests from earlier versions', async () => {
    const p = practice()
    const made = await makeBackup(p.source, p.store, { kind: 'manual', actor: null, notes: null })
    p.db.close()
    const keyStore = databaseKeyFile(join(p.dir, 'database-key.json'))
    keyStore.write({ key: KEY, origin: 'generated' })

    // Cut off after the live database was moved aside: it is put back, then the restore goes ahead.
    await stageRestore(made.path, KEY, { dataDir: p.dir, docsDir: p.docsDir, appMigration: APP_MIGRATION, writeKey: false, actor: null })
    const marker = JSON.parse(readFileSync(restoreMarkerPath(p.dir), 'utf8'))
    copyFileSync(p.dbPath, join(p.dir, 'aeterna.before-restore-x.db'))
    rmSync(p.dbPath)
    writeFileSync(restoreMarkerPath(p.dir), JSON.stringify({ ...marker, safety: 'aeterna.before-restore-x.db' }))
    expect(applyPendingRestore(p.dir, p.dbPath, p.docsDir, keyStore, opens(KEY)).restored).toBe(true)

    // A request written by an earlier version: { backupPath } of a database copy.
    const v1 = join(p.dir, 'aeterna-backup-20261001-080000.db')
    copyFileSync(p.dbPath, v1)
    writeFileSync(restoreMarkerPath(p.dir), JSON.stringify({ backupPath: v1, filename: 'aeterna-backup-20261001-080000.db' }))
    expect(applyPendingRestore(p.dir, p.dbPath, p.docsDir, keyStore, opens(KEY))).toMatchObject({ restored: true })
  })

  it('finishes a restore cut off after the swap, and keeps a document it can’t put in place', async () => {
    const p = practice()
    const doc = p.addDocument('CL0001', 'letter.pdf', 'THE LETTER')
    const made = await makeBackup(p.source, p.store, { kind: 'manual', actor: null, notes: null })
    rmSync(doc.path)
    await stageRestore(made.path, KEY, { dataDir: p.dir, docsDir: p.docsDir, appMigration: APP_MIGRATION, writeKey: false, actor: null })
    p.db.close()
    const keyStore = databaseKeyFile(join(p.dir, 'database-key.json'))
    keyStore.write({ key: KEY, origin: 'generated' })
    // As if a start had moved the live database aside and the restored one in, then stopped.
    const marker = JSON.parse(readFileSync(restoreMarkerPath(p.dir), 'utf8'))
    copyFileSync(p.dbPath, join(p.dir, 'aeterna.before-restore-cut.db'))
    copyFileSync(join(p.dir, marker.database), p.dbPath)
    rmSync(join(p.dir, marker.database))
    writeFileSync(restoreMarkerPath(p.dir), JSON.stringify({ ...marker, safety: 'aeterna.before-restore-cut.db' }))
    const resumed = applyPendingRestore(p.dir, p.dbPath, p.docsDir, keyStore, opens(KEY))
    expect(resumed).toMatchObject({ restored: true })
    expect(resumed.notice).toMatch(/kept as aeterna.before-restore-cut.db.*1 document was put back/)
    expect(readFileSync(doc.path, 'utf8')).toBe('THE LETTER')

    // The client's folder is now a file, so the document can't go back: it is kept, and said so.
    const q = practice()
    q.addDocument('CL0001', 'letter.pdf', 'ANOTHER LETTER')
    const qMade = await makeBackup(q.source, q.store, { kind: 'manual', actor: null, notes: null })
    rmSync(join(q.docsDir, 'CL0001'), { recursive: true })
    await stageRestore(qMade.path, KEY, { dataDir: q.dir, docsDir: q.docsDir, appMigration: APP_MIGRATION, writeKey: false, actor: null })
    q.db.close()
    writeFileSync(join(q.docsDir, 'CL0001'), 'a file where the folder was')
    const qKeys = databaseKeyFile(join(q.dir, 'database-key.json'))
    qKeys.write({ key: KEY, origin: 'generated' })
    const kept = applyPendingRestore(q.dir, q.dbPath, q.docsDir, qKeys, opens(KEY))
    expect(kept.restored).toBe(true)
    expect(kept.notice).toMatch(/1 document couldn’t be put in place/)
    const left = readdirSync(q.dir).find((f) => f.startsWith('restored-documents-not-placed-')) as string
    expect(readFileSync(join(q.dir, left, 'CL0001', 'letter.pdf'), 'utf8')).toBe('ANOTHER LETTER')
  })

  it('restores an older backup (a database copy), and refuses one from a newer version', async () => {
    const p = practice()
    p.db.pragma('wal_checkpoint(TRUNCATE)')
    const v1 = join(p.store, 'aeterna-backup-20261001-080000.db')
    mkdirSync(p.store, { recursive: true })
    copyFileSync(p.dbPath, v1)
    expect((await inspectBackup(v1, APP_MIGRATION)).format).toBe(1)
    const staged = await stageRestore(v1, KEY, { dataDir: p.dir, docsDir: p.docsDir, appMigration: APP_MIGRATION, writeKey: false, actor: null })
    expect(staged.counts.clients).toBe(2)
    expect((await testBackup(v1, KEY, { workDir: join(p.dir, 'w'), appMigration: APP_MIGRATION })).summary).toMatch(/database only/)

    const made = await makeBackup(p.source, p.store, { kind: 'manual', actor: null, notes: null })
    await expect(stageRestore(made.path, KEY, { dataDir: p.dir, docsDir: p.docsDir, appMigration: '0015_access_integrity', writeKey: false, actor: null })).rejects.toThrow(/newer version/)
    expect(existsSync(restoreMarkerPath(p.dir))).toBe(false)
    expect(existsSync(join(p.dir, 'restore-staging'))).toBe(false)
    await expect(stageRestore(made.path, OTHER_KEY, { dataDir: p.dir, docsDir: p.docsDir, appMigration: APP_MIGRATION, writeKey: true, actor: null })).rejects.toThrow(fingerprintOf(KEY))
  })
})

describe('the backup folder', () => {
  it('removes stored documents no backup lists, but not new ones, and nothing when a backup can’t be read', async () => {
    const p = practice()
    const doc = p.addDocument('CL0001', 'a.pdf', 'version one')
    const first = await makeBackup(p.source, p.store, { kind: 'manual', actor: null, notes: null })
    writeFileSync(doc.path, 'version two')
    p.setNow('2026-10-12T10:00:00Z')
    await makeBackup(p.source, p.store, { kind: 'manual', actor: null, notes: null })
    expect(blobsIn(p.store)).toHaveLength(2)
    rmSync(first.path)
    const keys = backupKeys(KEY)
    expect(await cleanUpStore(p.store, keys)).toMatchObject({ removed: 0, skipped: null }) // written in the last day
    const dayLater = Date.now() + 25 * 3_600_000
    expect(await cleanUpStore(p.store, keys, dayLater)).toMatchObject({ removed: 1, kept: 1 })

    // A backup made with another key in the same folder: nothing is removed.
    const q = practice(OTHER_KEY)
    const foreign = await makeBackup(q.source, q.store, { kind: 'manual', actor: null, notes: null })
    copyFileSync(foreign.path, join(p.store, foreign.filename))
    expect((await cleanUpStore(p.store, keys, dayLater)).skipped).toMatch(/different key/)
  })

  it('copies a backup and its documents to another drive, checking every file', async () => {
    const p = practice()
    p.addDocument('CL0001', 'a.pdf', 'aaa')
    p.addDocument('CL0001', 'b.pdf', 'bbb')
    const made = await makeBackup(p.source, p.store, { kind: 'manual', actor: null, notes: null })
    const drive = scratch()
    const target = storeFolderIn(drive, fingerprintOf(KEY))
    const once = await copyBackup(made.path, backupKeys(KEY), target, fingerprintOf(KEY))
    expect(once).toMatchObject({ documentsCopied: 2, documentsAlreadyThere: 0 })
    const twice = await copyBackup(made.path, backupKeys(KEY), target, fingerprintOf(KEY))
    expect(twice).toMatchObject({ documentsCopied: 0, documentsAlreadyThere: 2 })
    const test = await testBackup(join(target, made.filename), KEY, { workDir: join(drive, 'w'), appMigration: APP_MIGRATION })
    expect(test.ok).toBe(true)
  })
})
