/**
 * IPC: data import.
 *
 * Security model
 *  - The renderer never sees or supplies a file path. The main process opens
 *    the native dialog, hashes the file and returns an opaque token that
 *    expires after 30 minutes.
 *  - Preview: partner or manager. Commit and rollback: partner only.
 *  - Commit requires the fingerprint of a preview made with the same token,
 *    re-hashes the file (refuses if a byte changed), and the engine re-plans
 *    inside the write transaction and compares fingerprints again.
 *  - Sensitive identifiers are written only if the database is genuinely
 *    keyed (ledger mode 'encrypted'); a renderer request cannot override it.
 *  - Nothing runs unless the schema migrations completed at startup.
 */

import { randomUUID } from 'node:crypto'
import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import type {
  ImportAdapterInfo, ImportBatch, ImportCommitResult, ImportFileToken, ImportOptions, ImportPreview,
  ImportRollbackResult, IpcResult
} from '@shared/types'
import { getLedger } from '../database'
import { getMigrationStatus } from '../db/migrate'
import { ADAPTERS, detectAdapter } from '../import/adapters'
import type { SourceFile } from '../import/core/canonical'
import { todayIso, type IsoDate } from '../import/core/rules'
import { commitPreviewed, describeFile, listImportBatches, previewImport, rollbackImport } from '../import/pipeline'
import { getCurrentUser, requireRole } from './auth'

const TOKEN_TTL_MS = 30 * 60_000
const MAX_SELECTIONS = 20

interface Selection {
  file: SourceFile
  expires: number
  preview?: { fingerprint: string; today: IsoDate; includeSensitive: boolean }
}

const selections = new Map<string, Selection>()

async function result<T>(fn: () => T | Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    console.error('[import]', err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function purgeExpired(): void {
  const now = Date.now()
  for (const [token, s] of selections) if (s.expires < now) selections.delete(token)
}

function selectionFor(token: unknown): Selection {
  purgeExpired()
  const s = typeof token === 'string' && token.length <= 64 ? selections.get(token) : undefined
  if (!s) throw new Error('This file selection has expired. Choose the file again.')
  return s
}

function assertSchemaReady(): void {
  const s = getMigrationStatus()
  if (!s.ok || s.pending.length) {
    throw new Error(`The database schema is not up to date (${s.error ?? `pending: ${s.pending.join(', ')}`}). ` +
      'Restart the app; if this persists, check the log.')
  }
}

function toBatch(r: Record<string, unknown>): ImportBatch {
  return {
    id: Number(r.id), batch_uid: String(r.batch_uid), adapter_id: String(r.adapter_id), adapter_version: String(r.adapter_version),
    source_system: String(r.source_system), file_name: String(r.file_name), file_sha256: String(r.file_sha256),
    status: r.status as ImportBatch['status'], stats_json: String(r.stats_json ?? '{}'), committed_at: String(r.committed_at),
    committed_by: (r.committed_by as string | null) ?? null, rolled_back_at: (r.rolled_back_at as string | null) ?? null,
    rolled_back_by: (r.rolled_back_by as string | null) ?? null
  }
}

export function registerImportHandlers(): void {
  ipcMain.handle('import:list-adapters', (): ImportAdapterInfo[] =>
    ADAPTERS.map((a) => ({ id: a.id, label: a.label, version: a.version, extensions: [...a.extensions] })))

  ipcMain.handle('import:choose-file', (event) => result(async (): Promise<ImportFileToken | null> => {
    requireRole(['partner', 'manager'])
    const options: OpenDialogOptions = {
      title: 'Choose a file to import',
      properties: ['openFile'],
      filters: [{ name: 'Supported files', extensions: [...new Set(ADAPTERS.flatMap((a) => a.extensions.map((e) => e.replace(/^\./, ''))))] }]
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const path = picked.filePaths[0]
    if (picked.canceled || !path) return null
    const file = await describeFile(path)
    const adapter = await detectAdapter(file)
    purgeExpired()
    while (selections.size >= MAX_SELECTIONS) selections.delete(selections.keys().next().value as string)
    const token = randomUUID()
    selections.set(token, { file, expires: Date.now() + TOKEN_TTL_MS })
    return { token, fileName: file.name, size: file.size, adapterId: adapter?.id ?? null }
  }))

  ipcMain.handle('import:preview', (_e, token: unknown, options?: ImportOptions) => result(async (): Promise<ImportPreview> => {
    requireRole(['partner', 'manager'])
    assertSchemaReady()
    const sel = selectionFor(token)
    sel.file = await describeFile(sel.file.path) // preview exactly what is on disk now
    const includeSensitive = options?.includeSensitive === true && getLedger().mode === 'encrypted'
    const today = todayIso()
    const run = await previewImport(getLedger().db, sel.file, { today, includeSensitive })
    sel.preview = { fingerprint: run.report.fingerprint, today, includeSensitive }
    sel.expires = Date.now() + TOKEN_TTL_MS
    return { token: token as string, fingerprint: run.report.fingerprint, report: run.report, markdown: run.markdown }
  }))

  ipcMain.handle('import:commit', (_e, token: unknown, fingerprint: unknown) => result(async (): Promise<ImportCommitResult> => {
    requireRole(['partner'])
    assertSchemaReady()
    const sel = selectionFor(token)
    if (typeof fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(fingerprint) || sel.preview?.fingerprint !== fingerprint) {
      throw new Error('Preview this file and review the report before committing it.')
    }
    const current = await describeFile(sel.file.path)
    if (current.sha256 !== sel.file.sha256) throw new Error('The file has changed since it was previewed. Preview it again.')
    const done = await commitPreviewed(getLedger().db, current, fingerprint, getCurrentUser()?.name ?? null, {
      today: sel.preview.today, includeSensitive: sel.preview.includeSensitive
    })
    selections.delete(token as string)
    return done
  }))

  ipcMain.handle('import:list-batches', () => result((): ImportBatch[] => {
    requireRole(['partner', 'manager'])
    assertSchemaReady()
    return listImportBatches(getLedger().db).map(toBatch)
  }))

  ipcMain.handle('import:rollback', (_e, batchId: unknown) => result((): ImportRollbackResult => {
    requireRole(['partner'])
    assertSchemaReady()
    if (typeof batchId !== 'number' || !Number.isInteger(batchId) || batchId < 1) throw new Error('Invalid batch id')
    return rollbackImport(getLedger().db, batchId, getCurrentUser()?.name ?? null)
  }))
}
