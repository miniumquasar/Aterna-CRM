/**
 * fortress.ts — the security centre: the database, the encryption key's
 * recovery sheet, the vault, backups and the licence at a glance; who can sign
 * in; sign-in history; and the audit log, with its seals checked and an export
 * for an inspection.
 *
 * Everyone sees the database, the licence, the time before the app signs out,
 * and their own sign-ins. Partners and managers see the rest; the recovery
 * sheet is saved or printed by a partner (ipc/recovery.ts), the vault
 * passphrase changed by a partner ('vault:change-passphrase').
 */
import { closeSync, openSync, renameSync, rmSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { AuditCheck, SecurityOverview } from '@shared/types'
import { CSV_BOM, csvCell } from '@shared/csv'
import { writeAudit } from '../access/audit'
import { canManage, requireManager, UserFacingError, type Actor } from '../access/policy'
import { idleMinutes } from '../auth/idle'
import { getDb } from '../db/schema'
import { getLicence } from '../licence'
import { checkAuditLog, sealAuditLog } from '../records/audit-seal'
import { localDate } from '../records/common'
import { firmName } from '../records/firm'
import { licenceHealth } from '../records/pulse'
import { auditCsvRows, auditPage, exportAuditEntries, loginFlagCounts, peopleSummary, readAuditExportQuery, signInHistory, signInSummary } from '../records/security'
import { getAuth } from './auth'
import { backupsTile, databaseTile } from './pulse'
import { recoveryStatus } from './recovery'
import { getVault } from './references'
import { actor, result, resultAsync } from './session'

/** How long the overview shows the last check before checking again (a long log takes a moment). */
const CHECK_FRESH_MS = 10 * 60_000
let lastCheck: { at: number; result: AuditCheck } | null = null

/** Seals what was added since the last seal, then checks every seal from the first entry. */
export function sealAndCheck(): AuditCheck {
  const db = getDb()
  try {
    sealAuditLog(db)
  } catch (err) {
    // Checking still works when sealing can't (a read-only file): the new entries show as not yet sealed.
    console.error('[security] the audit log couldn’t be sealed', err)
  }
  const result = checkAuditLog(db)
  lastCheck = { at: performance.now(), result }
  return result
}

/** The last check, when it is recent; otherwise a new one. */
const recentCheck = (): AuditCheck => (lastCheck && performance.now() - lastCheck.at < CHECK_FRESH_MS ? lastCheck.result : sealAndCheck())

function overview(me: Actor): SecurityOverview {
  const db = getDb()
  const manager = canManage(me)
  let vault: SecurityOverview['vault'] = null
  let people: SecurityOverview['people'] = null
  if (manager) {
    const s = getVault().status(me)
    const flags = loginFlagCounts(db)
    vault = { setUp: s.setUp, unlocked: s.unlocked, locksAt: s.locksAt, ...flags, governmentSignIn: s.governmentSignIn.allowed }
    const auth = getAuth()
    people = peopleSummary(auth.listPeople(), auth.listInvites())
  }
  return {
    database: databaseTile(),
    licence: licenceHealth(getLicence().status()),
    backups: manager ? backupsTile() : null,
    recovery: manager ? recoveryStatus() : null,
    vault,
    people,
    ...signInSummary(db, me),
    audit: manager ? recentCheck() : null,
    idleMinutes: idleMinutes(db)
  }
}

/** A name a file can have on any computer: no characters Windows forbids, no control characters. */
const forFileName = (s: string): string =>
  [...s]
    .filter((c) => c.charCodeAt(0) >= 32 && !'\\/:*?"<>|'.includes(c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)

/**
 * Saves the audit log (or the entries the filters choose) as a CSV file, a
 * batch at a time, written beside the target and moved into place when
 * complete, so a failure never leaves half a file under the chosen name.
 */
async function exportAudit(sender: Electron.WebContents, query: unknown): Promise<{ saved: boolean; path: string | null; entries: number }> {
  const me = actor()
  requireManager(me, 'export the audit log')
  const filters = readAuditExportQuery(query) // a mistake in the filters shows before the dialog
  const firm = forFileName(firmName(getDb()) ?? '')
  const parent = BrowserWindow.fromWebContents(sender) ?? undefined
  const options: Electron.SaveDialogOptions = {
    title: 'Save the audit log',
    defaultPath: join(app.getPath('documents'), `${['Audit log', firm, localDate()].filter(Boolean).join(' ')}.csv`),
    filters: [{ name: 'CSV (opens in Excel)', extensions: ['csv'] }]
  }
  const target = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (target.canceled || !target.filePath) return { saved: false, path: null, entries: 0 }

  const part = `${target.filePath}.part`
  let entries = 0
  let fd: number | null = null
  try {
    fd = openSync(part, 'w')
    const out = fd
    const { header } = auditCsvRows([])
    writeSync(out, CSV_BOM + header.map(csvCell).join(','))
    entries = exportAuditEntries(getDb(), me, filters, (batch) => {
      const { rows } = auditCsvRows(batch)
      writeSync(out, `\r\n${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`)
    })
    closeSync(out)
    fd = null
    renameSync(part, target.filePath)
  } catch (err) {
    if (fd !== null) closeSync(fd)
    rmSync(part, { force: true })
    if (err instanceof UserFacingError) throw err
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
      throw new UserFacingError('That file couldn’t be written: it may be open in Excel, or the folder may be read-only. Close it, or choose another name or folder.')
    }
    if (code === 'ENOSPC') throw new UserFacingError('There isn’t enough space on that drive. Choose another folder.')
    throw err
  }
  writeAudit(getDb(), me, 'Exported the audit log', 'audit_log', null, undefined, { entries, ...filters })
  return { saved: true, path: target.filePath, entries }
}

export function registerFortressHandlers(): void {
  ipcMain.handle('security:overview', () => result('security', () => overview(actor())))
  ipcMain.handle('security:sign-ins', (_e, query: unknown) => result('security', () => signInHistory(getDb(), actor(), query)))
  ipcMain.handle('security:audit', (_e, query: unknown) => result('security', () => auditPage(getDb(), actor(), query)))
  ipcMain.handle('security:check-audit', () =>
    result('security', () => {
      requireManager(actor(), 'check the audit log')
      return sealAndCheck()
    })
  )
  ipcMain.handle('security:export-audit', (event, query: unknown) => resultAsync('security', () => exportAudit(event.sender, query)))
}
