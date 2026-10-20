/**
 * pulse.ts — Activity (Pulse), notifications and Risk (Sentinel). Every reply is
 * { ok, data } or { ok: false, error }. Each person sees their own
 * notifications; staff see their own clients' changes and risks.
 */
import { statSync } from 'node:fs'
import { ipcMain } from 'electron'
import type { PulseHealth } from '@shared/types'
import { canManage, requireManager, type Actor } from '../access/policy'
import { getLedger } from '../database'
import { getDb } from '../db/schema'
import { getLicence } from '../licence'
import { listChanges } from '../records/ch-watch'
import { listNotifications, markDone, notificationCounts, reopen } from '../records/notifications'
import { backupHealth, databaseHealth, licenceHealth, pulseDay } from '../records/pulse'
import { riskReport } from '../records/risk'
import { checkCompaniesHouseNow, companiesHouseStatus } from '../services/ch-watch'
import { pushCounts, refreshNow } from '../services/notifier'
import { backupService } from './backup'
import { actor, result } from './session'

/** The database tile: encrypted and saved, with its size on disk. */
export function databaseTile(): PulseHealth['database'] {
  const ledger = getLedger()
  let bytes: number | null = null
  try {
    bytes = ledger.mode === 'encrypted' || ledger.mode === 'dev-only' ? statSync(ledger.path).size : null
  } catch {
    bytes = null
  }
  return databaseHealth(ledger.mode, bytes)
}

/** The backups tile (partners and managers). */
export function backupsTile(): NonNullable<PulseHealth['backups']> {
  try {
    const s = backupService().status()
    return backupHealth({ lastBackup: s.lastBackup, lastError: s.lastError, nextDue: s.nextDue, folderProblem: s.folderProblem, schedule: s.settings.schedule })
  } catch {
    return { tone: 'problem', text: 'The backup settings couldn’t be read.', lastAt: null, nextDue: null }
  }
}

function health(me: Actor): PulseHealth {
  const manager = canManage(me)
  return {
    database: databaseTile(),
    licence: licenceHealth(getLicence().status()),
    backups: manager ? backupsTile() : null,
    companiesHouse: manager ? companiesHouseStatus() : null
  }
}

export function registerPulseHandlers(): void {
  // ── Notifications: each person's own ──────────────────────────────────────
  ipcMain.handle('notifications:list', (_e, query: unknown) => result('notifications', () => listNotifications(getDb(), actor(), query)))
  ipcMain.handle('notifications:count', () => result('notifications', () => notificationCounts(getDb(), actor())))
  // Brings the list up to date now (opening the bell or the list), rather than at the next five-minute check.
  ipcMain.handle('notifications:refresh', () =>
    result('notifications', () => {
      const me = actor()
      return refreshNow() ?? { ...notificationCounts(getDb(), me), created: [] }
    })
  )
  // Marking done changes no practice record, so it works when the app is read-only.
  ipcMain.handle('notifications:done', (_e, ids: unknown) =>
    result('notifications', () => {
      const me = actor()
      const done = markDone(getDb(), me, ids)
      pushCounts(me)
      return { done }
    })
  )
  ipcMain.handle('notifications:reopen', (_e, id: unknown) =>
    result('notifications', () => {
      const me = actor()
      reopen(getDb(), me, id)
      pushCounts(me)
      return null
    })
  )

  // ── Activity ──────────────────────────────────────────────────────────────
  ipcMain.handle('pulse:today', (_e, query: unknown) => result('pulse', () => pulseDay(getDb(), actor(), query)))
  ipcMain.handle('pulse:health', () => result('pulse', () => health(actor())))
  ipcMain.handle('pulse:changes', (_e, query: unknown) => result('pulse', () => listChanges(getDb(), actor(), query)))
  ipcMain.handle('pulse:sync-companies-house', () =>
    result('pulse', () => {
      requireManager(actor(), 'start a Companies House check')
      return checkCompaniesHouseNow()
    })
  )

  // ── Risk ──────────────────────────────────────────────────────────────────
  ipcMain.handle('sentinel:report', () => result('sentinel', () => riskReport(getDb(), actor())))
}
