/**
 * Documents stored by an earlier build under its own data folder (before the
 * app was renamed, say) are brought into this build's documents folder, so they
 * open again — the app only opens files inside its own documents folder.
 *
 *   - Files are copied, never moved; nothing already in the documents folder is
 *     overwritten. A different file already using the name gets a numbered name.
 *   - Each record that changes is audited with its old and new place.
 *   - A file that can't be found is left recorded as it was and counted, so the
 *     log says how many are missing. Records pointing anywhere else are left alone.
 *
 * Safe to run at every start: a record already inside the folder is skipped.
 */
import { createHash } from 'node:crypto'
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import type { Database } from 'better-sqlite3-multiple-ciphers'
import { writeAudit } from '../access/audit'
import { isInside } from '../records/documents'

export interface DocumentsBroughtIn {
  /** Records now pointing inside the documents folder. */
  relinked: number
  /** Of those, files copied across by this run. */
  copied: number
  /** Records under an earlier folder whose file is nowhere to be found. */
  missing: number
  /** Records pointing somewhere this doesn't look after — left as they are. */
  elsewhere: number
}

const sizeOf = (p: string): number | null => {
  try {
    return statSync(p).size
  } catch {
    return null
  }
}
const digest = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')
const sameFile = (a: string, b: string): boolean => sizeOf(a) === sizeOf(b) && digest(a) === digest(b)

/** `target`, or the first "name (2).pdf", "name (3).pdf", … not yet taken. */
function freeName(target: string): string {
  const ext = extname(target)
  const stem = ext ? target.slice(0, -ext.length) : target
  let candidate = target
  for (let n = 2; existsSync(candidate); n += 1) candidate = `${stem} (${n})${ext}`
  return candidate
}

export function bringDocumentsIn(db: Database, docsDir: string, earlierDataDirs: readonly string[]): DocumentsBroughtIn {
  const out: DocumentsBroughtIn = { relinked: 0, copied: 0, missing: 0, elsewhere: 0 }
  const earlierDocs = earlierDataDirs.filter((d) => !!d).map((d) => join(d, 'documents')).filter((d) => !isInside(docsDir, d) && d !== docsDir)
  const rows = db.prepare("SELECT id, client_ref, file_path, file_size FROM documents WHERE file_path IS NOT NULL AND file_path <> ''").all() as Array<{
    id: number; client_ref: string | null; file_path: string; file_size: number | null
  }>
  const relink = db.prepare("UPDATE documents SET file_path = ?, updated_at = datetime('now') WHERE id = ?")
  for (const doc of rows) {
    if (isInside(docsDir, doc.file_path)) continue
    const from = earlierDocs.find((root) => isInside(root, doc.file_path))
    if (!from) {
      out.elsewhere += 1
      continue
    }
    let target = join(docsDir, relative(from, doc.file_path))
    const sourceThere = existsSync(doc.file_path)
    if (sourceThere) {
      // Copied across already (the data folder step brings the whole folder) — or a different file has the name.
      if (existsSync(target) && !sameFile(doc.file_path, target)) target = freeName(target)
      if (!existsSync(target)) {
        mkdirSync(dirname(target), { recursive: true })
        copyFileSync(doc.file_path, target, constants.COPYFILE_EXCL)
        out.copied += 1
      }
    } else if (!(existsSync(target) && doc.file_size !== null && sizeOf(target) === doc.file_size)) {
      out.missing += 1
      continue
    }
    db.transaction(() => {
      relink.run(target, doc.id)
      writeAudit(db, null, 'Brought a document into the documents folder', 'documents', doc.id,
        { client_ref: doc.client_ref, file_path: doc.file_path }, { client_ref: doc.client_ref, file_path: target })
    })()
    out.relinked += 1
  }
  return out
}
