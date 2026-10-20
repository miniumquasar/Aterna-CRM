/**
 * documents.ts — storing, listing, opening and deleting client documents. The
 * rules and the path safety are in ../records/documents.ts: files stay inside
 * the app's documents folder, are opened by id, and only document types open —
 * anything else is shown in its folder, so nothing is ever run.
 */
import { app, ipcMain, shell } from 'electron'
import { copyFileSync, existsSync, lstatSync, mkdirSync, statSync, unlinkSync, type Stats } from 'node:fs'
import { dirname, join } from 'node:path'
import { getDb } from '../db/schema'
import type { AppDocument } from '@shared/types'
import { UserFacingError } from '../access/policy'
import {
  deleteDocumentRecord, destinationFor, documentToOpen, isInside, listDocuments, MAX_DOCUMENT_BYTES, opensDirectly, prepareUpload, recordDocument
} from '../records/documents'
import { actor, reply, rows } from './session'

export function registerDocumentHandlers(): void {
  const docsDir = join(app.getPath('userData'), 'documents')
  if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true })

  ipcMain.handle('documents:list', (_e, clientRef: string): AppDocument[] => rows('documents', [], () => listDocuments(getDb(), actor(), clientRef)))

  // The path is the file the person picked or dropped; it is copied, never moved or changed.
  ipcMain.handle('documents:upload', (_e, clientRef: string, sourcePath: string, filename: string, category: string) =>
    reply('documents', () => {
      const me = actor()
      const db = getDb()
      const upload = prepareUpload(db, me, clientRef, filename, category)
      if (typeof sourcePath !== 'string' || !sourcePath) throw new UserFacingError('Choose a file to store.')
      const info = ((): Stats => {
        try {
          return lstatSync(sourcePath)
        } catch {
          throw new UserFacingError('That file can’t be found.')
        }
      })()
      if (!info.isFile()) throw new UserFacingError('Only files can be stored, not folders or shortcuts.')
      if (info.size > MAX_DOCUMENT_BYTES) throw new UserFacingError('That file is larger than 200 MB.')
      if (isInside(app.getPath('userData'), sourcePath)) throw new UserFacingError('That file is part of the app’s own data and can’t be stored as a document.')
      const dest = destinationFor(docsDir, upload.clientRef, upload.fileName, existsSync)
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(sourcePath, dest)
      try {
        const doc = recordDocument(db, me, { clientRef: upload.clientRef, fileName: upload.fileName, filePath: dest, category: upload.category, size: statSync(dest).size })
        return { doc }
      } catch (err) {
        try {
          unlinkSync(dest) // nothing recorded, so nothing left behind
        } catch {
          /* already gone */
        }
        throw err
      }
    })
  )

  ipcMain.handle('documents:delete', (_e, id: number) =>
    reply('documents', () => {
      const path = deleteDocumentRecord(getDb(), actor(), id, docsDir)
      if (path && existsSync(path)) {
        try {
          unlinkSync(path)
        } catch (err) {
          console.error('[documents] The record was deleted but the file could not be removed:', err)
        }
      }
      return {}
    })
  )

  // By id. Only document types open; anything else is shown in its folder rather than run.
  ipcMain.handle('documents:open', async (_e, id: number) => {
    try {
      const doc = documentToOpen(getDb(), actor(), id, docsDir)
      if (!existsSync(doc.file_path)) return { success: false, error: 'The file is missing from the documents folder.' }
      if (!opensDirectly(doc.file_path)) {
        shell.showItemInFolder(doc.file_path)
        return { success: true, shownInFolder: true }
      }
      const error = await shell.openPath(doc.file_path)
      return error ? { success: false, error } : { success: true }
    } catch (err) {
      if (err instanceof UserFacingError) return { success: false, error: err.message }
      console.error('[documents]', err)
      return { success: false, error: 'The document couldn’t be opened.' }
    }
  })
}
