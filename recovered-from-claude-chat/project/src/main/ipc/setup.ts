/**
 * setup.ts — the first-run wizard. The rules live in ../setup/service.ts.
 *
 * Before anyone can sign in (a new installation), only two things are open:
 * reading the setup status, and saving the firm's details. Everything else
 * needs a signed-in partner, like the rest of the app.
 */
import { BrowserWindow, ipcMain } from 'electron'
import type { FirmDetailsInput, IpcResult, SetupStatus } from '@shared/types'
import { writeAudit } from '../access/audit'
import { UserFacingError } from '../access/policy'
import { getDb } from '../db/schema'
import { getLicence } from '../licence'
import { firmName, saveFirm } from '../records/firm'
import { vaultSheetHtml } from '../security/vault-sheet'
import { finishSetup, isFirstRun, markStep, setupStatus, type SetupProbe } from '../setup/service'
import { getAuth } from './auth'
import { recoveryStatus } from './recovery'
import { getVault } from './references'
import { actor, result } from './session'

const probe: SetupProbe = {
  recoverySheetDone: () => {
    const r = recoveryStatus()
    return r.available ? r.done : null
  },
  vaultSetUp: () => getVault().status().setUp,
  licensed: () => getLicence().status().licensedTo !== null
}

async function resultAsync<T>(scope: string, fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (err instanceof UserFacingError) return { ok: false, error: err.message }
    console.error(`[${scope}]`, err)
    return { ok: false, error: 'Something went wrong. Nothing was changed.' }
  }
}

/** The status, for the wizard: anyone during first run, otherwise a partner. */
function statusFor(): SetupStatus {
  const db = getDb()
  if (!isFirstRun(db)) {
    const me = actor()
    if (me.role !== 'partner') throw new UserFacingError('Only a partner sets up the practice.')
  }
  return setupStatus(db, probe)
}

export function registerSetupHandlers(): void {
  ipcMain.handle('setup:status', () => result('setup', statusFor))

  ipcMain.handle('setup:save-firm', (_e, input: FirmDetailsInput) =>
    result('setup', () => {
      const db = getDb()
      // Before the first partner exists there is nobody to sign in as; once there is, the usual rule applies.
      saveFirm(db, isFirstRun(db) ? null : actor(), input)
      return statusFor()
    })
  )

  ipcMain.handle('setup:mark', (_e, step: unknown, state: unknown) =>
    result('setup', () => {
      markStep(getDb(), actor(), step, state)
      return setupStatus(getDb(), probe)
    })
  )

  ipcMain.handle('setup:finish', () => result('setup', () => finishSetup(getDb(), actor(), probe)))

  // The passphrase is checked against the vault, put into a page with no scripts and no network,
  // printed, and dropped. It is never written to disk, logged or kept.
  ipcMain.handle('setup:print-vault-sheet', (event, passphrase: unknown) =>
    resultAsync('setup', async () => {
      const me = actor()
      if (typeof passphrase !== 'string' || passphrase.length > 1000) throw new UserFacingError('That passphrase isn’t right.')
      const audit = (action: string, table: string | null, recordId: string | number | null, oldValue?: unknown, newValue?: unknown): void =>
        writeAudit(getDb(), me, action, table, recordId, oldValue, newValue)
      getVault().confirmPassphrase(passphrase, me, audit)
      const html = vaultSheetHtml({
        passphrase,
        firm: firmName(getDb()) ?? 'Your practice',
        productName: 'AETERNA CRM',
        createdFor: me.name ?? getAuth().current()?.name ?? 'a partner',
        date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      })
      const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const win = new BrowserWindow({ show: false, parent, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } })
      try {
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        const printed = await new Promise<{ ok: boolean; why: string }>((resolve) =>
          win.webContents.print({ silent: false, printBackground: true }, (ok, why) => resolve({ ok, why }))
        )
        if (!printed.ok) throw new UserFacingError(printed.why === 'cancelled' ? 'Not printed.' : `Printing failed: ${printed.why}`)
        // The key version the sheet is for: 1 when the vault was set up, one more for each change of passphrase.
        const version = (getDb().prepare('SELECT MAX(version) AS v FROM vault_keys').get() as { v: number | null }).v ?? 1
        audit('Printed the vault passphrase sheet', 'vault_keys', version)
        return { printed: true as const }
      } finally {
        win.destroy()
      }
    })
  )
}
