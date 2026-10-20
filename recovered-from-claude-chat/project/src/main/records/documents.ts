/**
 * Stored documents: the rules, and the path safety that keeps every file inside
 * the app's documents folder.
 *
 *   folders    one per client, named from the client code with anything that could
 *              climb out of the folder ("..", slashes, drive letters) replaced
 *   names      only the file's own name is used, cleaned the same way
 *   opening    by document id, never by a path a screen sends; the stored path must
 *              still be inside the documents folder. Only document types — PDFs,
 *              Office files, text, pictures, emails, zip files — open in their app;
 *              anything else is shown in its folder, so opening a document can never
 *              start software.
 *   deleting   documents are records the practice must keep: only a partner deletes
 *              one
 */
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { AppDocument } from '../../shared/types'
import { auditRow, writeAudit, type Row } from '../access/audit'
import { clientForActor, idArg, refArg, requirePartner, UserFacingError, type Actor } from '../access/policy'
import { textOrNull } from './common'

/** Largest file accepted: 200 MB. */
export const MAX_DOCUMENT_BYTES = 200 * 1024 * 1024

/** Characters Windows or macOS won't have in a file name, and control characters, become "_". */
const clean = (name: string): string =>
  Array.from(name, (ch) => (ch.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(ch) ? '_' : ch)).join('')

/** A client code as a single, safe folder name. */
export function folderFor(clientRef: string): string {
  const name = clean(clientRef).replace(/^\.+/, '_').replace(/[. ]+$/, '').slice(0, 64)
  if (!name || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) return `client_${Buffer.from(clientRef).toString('hex').slice(0, 32)}`
  return name
}

/** The last part of a file name, safe on Windows and macOS; never empty. */
export function safeFileName(name: string): string {
  const base = basename(String(name ?? '').replace(/\\/g, '/'))
  const cleaned = clean(base).replace(/^\.+/, '_').replace(/[. ]+$/, '').slice(0, 180)
  return cleaned && !/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(cleaned) ? cleaned : `document_${Date.now()}`
}

/** True when `candidate` is inside `root` (not root itself, not outside it). */
export function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * The kinds of file that open in their own app from here. Anything else — a
 * program, a script, a shortcut, an add-in, or a type not listed — is shown in its
 * folder instead. (Macro-enabled Office files open: Office's own macro settings
 * decide whether their macros may run.)
 */
const OPENS = new Set([
  '.pdf',
  '.doc', '.docx', '.docm', '.dot', '.dotx', '.rtf', '.odt', '.pages',
  '.xls', '.xlsx', '.xlsm', '.xlsb', '.csv', '.ods', '.numbers',
  '.ppt', '.pptx', '.pps', '.ppsx', '.odp', '.key',
  '.txt', '.md',
  '.eml', '.msg',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tif', '.tiff', '.heic', '.webp',
  '.zip'
])

/** True when the file opens in its app; false when it is shown in its folder instead. */
export const opensDirectly = (fileName: string): boolean => OPENS.has(extname(fileName).toLowerCase())

export function listDocuments(db: Database, actor: Actor, clientRef: unknown): AppDocument[] {
  const client = clientForActor(db, refArg(clientRef), actor)
  return db.prepare('SELECT * FROM documents WHERE client_ref = ? ORDER BY created_at DESC, id DESC').all(client.ref) as AppDocument[]
}

/** Checks the person may add a document for this client; returns the client and the clean name. */
export function prepareUpload(db: Database, actor: Actor, clientRef: unknown, fileName: unknown, category: unknown): { clientRef: string; fileName: string; category: string } {
  const client = clientForActor(db, refArg(clientRef), actor)
  const name = safeFileName(String(fileName ?? ''))
  return { clientRef: client.ref, fileName: name, category: textOrNull(category, 'The category', 60) ?? 'General' }
}

/** Records a document already copied into the client's folder. */
export function recordDocument(
  db: Database,
  actor: Actor,
  doc: { clientRef: string; fileName: string; filePath: string; category: string; size: number }
): AppDocument {
  return db.transaction((): AppDocument => {
    const id = Number(
      db.prepare('INSERT INTO documents (client_ref, filename, file_path, category, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?)')
        .run(doc.clientRef, doc.fileName, doc.filePath, doc.category, doc.size, extname(doc.fileName).slice(1).toLowerCase() || 'bin').lastInsertRowid
    )
    const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as AppDocument
    writeAudit(db, actor, 'Stored document', 'documents', id, null, auditRow('documents', row as unknown as Row))
    return row
  })()
}

/** The stored document, if the person may open it and it is still inside the documents folder. */
export function documentToOpen(db: Database, actor: Actor, id: unknown, documentsRoot: string): AppDocument {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(idArg(id, 'document')) as AppDocument | undefined
  if (!doc) throw new UserFacingError('That document no longer exists.')
  clientForActor(db, doc.client_ref, actor)
  if (!isInside(documentsRoot, doc.file_path)) throw new UserFacingError('That document isn’t in the app’s documents folder, so it won’t be opened from here.')
  return doc
}

/** Deletes the record (partners only) and returns the file path to remove, if it is inside the folder. */
export function deleteDocumentRecord(db: Database, actor: Actor, id: unknown, documentsRoot: string): string | null {
  requirePartner(actor, 'delete documents — the practice must keep them')
  const rowId = idArg(id, 'document')
  const before = db.prepare('SELECT * FROM documents WHERE id = ?').get(rowId) as Row | undefined
  if (!before) throw new UserFacingError('That document no longer exists.')
  db.transaction(() => {
    db.prepare('DELETE FROM documents WHERE id = ?').run(rowId)
    writeAudit(db, actor, 'Deleted document', 'documents', rowId, auditRow('documents', before), null)
  })()
  const path = String(before.file_path ?? '')
  return path && isInside(documentsRoot, path) ? path : null
}

/** Where a new document for this client goes; `exists` decides when to add a number to the name. */
export function destinationFor(documentsRoot: string, clientRef: string, fileName: string, exists: (p: string) => boolean): string {
  const dir = join(documentsRoot, folderFor(clientRef))
  let candidate = join(dir, fileName)
  const ext = extname(fileName)
  const stem = ext ? fileName.slice(0, -ext.length) : fileName
  for (let n = 2; exists(candidate); n += 1) candidate = join(dir, `${stem} (${n})${ext}`)
  return candidate
}
