/**
 * Start-up step 3's hooks for the backup domain, which owns this file and
 * replaces these placeholders. src/main/index.ts calls both; keep their
 * signatures.
 *
 *  applyPendingRestore   runs first, before the key is read or the database
 *                        opened: swap in a restore staged by the last run
 *                        (keeping a safety copy of what it replaces), and its
 *                        key when it came from another PC.
 *  recoverDatabaseKey    runs when the key file is missing or damaged, or its
 *                        key doesn't open the database. Offer to unlock with
 *                        the recovery sheet; resolve with the 64-hex key to
 *                        carry on, or null to stop with `message`. Write the
 *                        key file yourself with writeDatabaseKey() (after
 *                        setting a wrong or damaged one aside; a key file is
 *                        never overwritten), so the next start opens normally.
 *                        For a window of your own, open `window.rendererFile`
 *                        at #/unlock with `window.preloadPath`: App.tsx then
 *                        shows components/recovery/UnlockApp.tsx. The IPC
 *                        registry isn't installed yet, so handle the unlock
 *                        channels yourself (ipcMain.handle on INVOKE_CHANNEL)
 *                        and remove the handler before resolving.
 */
import type { Logger } from '../app/logger'
import type { DataPaths } from '../app/paths'

export interface BackupStartup {
  paths: DataPaths
  log: Logger
  now: Date
}

export interface KeyRecovery extends BackupStartup {
  /** missing_key: the database is there without its key file; unreadable_key: the key file is damaged; wrong_key: its key doesn't open the database. */
  problem: 'missing_key' | 'unreadable_key' | 'wrong_key'
  /** The plain explanation start-up shows if the key isn't recovered. */
  message: string
  /** The app's own page and bridge, for an unlock window. */
  window: { preloadPath: string; rendererFile: string; devServerUrl: string | null }
}

export function applyPendingRestore(ctx: BackupStartup): void | Promise<void> {
  ctx.log.info('No restore is waiting.')
}

export function recoverDatabaseKey(ctx: KeyRecovery): Promise<string | null> {
  ctx.log.info(`The database key couldn’t be used (${ctx.problem}); unlocking with the recovery sheet isn’t part of this build yet.`)
  return Promise.resolve(null)
}
