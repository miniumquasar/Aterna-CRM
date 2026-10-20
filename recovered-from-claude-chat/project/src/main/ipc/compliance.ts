/**
 * compliance.ts — tasks, HMRC submissions, work in progress, interactions,
 * invoices, AML checks and the dashboard figures. The rules (staff see their own
 * clients' records, only partners delete records the practice must keep, every
 * change audited with its previous values) live in ../records/work.ts.
 */
import { ipcMain } from 'electron'
import { getDb } from '../db/schema'
import { dashboardStats } from '../records/dashboard'
import { invoiceOwed } from '../records/receivables'
import { createWork, deleteWork, listAml, listWork, updateWork, upsertAml, WORK, type WorkSpec } from '../records/work'
import { actor, reply, rows } from './session'

/** create / update / delete for one kind of record, in the older { success } reply shape. */
function writeHandlers(prefix: keyof typeof WORK, spec: WorkSpec): void {
  ipcMain.handle(`${prefix}:create`, (_e, data: unknown) => reply(prefix, () => createWork(getDb(), actor(), spec, data)))
  ipcMain.handle(`${prefix}:update`, (_e, id: unknown, data: unknown) =>
    reply(prefix, () => {
      updateWork(getDb(), actor(), spec, id, data)
      return {}
    })
  )
  ipcMain.handle(`${prefix}:delete`, (_e, id: unknown) =>
    reply(prefix, () => {
      deleteWork(getDb(), actor(), spec, id)
      return {}
    })
  )
}

/** A list, optionally for one client. The screens send a client code, or { clientRef }. */
function listHandler(channel: string, spec: WorkSpec): void {
  ipcMain.handle(channel, (_e, arg?: unknown) => {
    const clientRef = typeof arg === 'string' ? arg : arg && typeof arg === 'object' ? (arg as { clientRef?: unknown }).clientRef : undefined
    return rows(channel, [], () => {
      const me = actor()
      const list = listWork(getDb(), me, spec, clientRef)
      if (spec.table !== 'payments') return list
      // Each invoice carries what is still owed on it, worked out the same way as every balance.
      const owed = invoiceOwed(getDb(), me, typeof clientRef === 'string' && clientRef ? clientRef : undefined)
      const gross = (p: Record<string, unknown>): number => Number(p.amount_pence ?? 0) + Number(p.vat_pence ?? 0)
      return list.map((p) => ({
        ...p,
        // An invoice with no client has no receipts to set against it.
        owed_pence: owed.get(p.id as number) ?? (p.status === 'paid' || p.status === 'cancelled' ? 0 : gross(p))
      }))
    })
  })
}

export function registerComplianceHandlers(): void {
  for (const prefix of Object.keys(WORK) as Array<keyof typeof WORK>) writeHandlers(prefix, WORK[prefix])
  listHandler('tasks:get-all', WORK.tasks)
  listHandler('hmrc:list', WORK.hmrc)
  listHandler('wip:list', WORK.wip)
  listHandler('interactions:list', WORK.interactions)
  listHandler('payments:list', WORK.payments)

  ipcMain.handle('aml:get-all', () => rows('aml', [], () => listAml(getDb(), actor())))
  ipcMain.handle('aml:upsert', (_e, data: unknown) => reply('aml', () => upsertAml(getDb(), actor(), data)))

  ipcMain.handle('dashboard:stats', () => {
    try {
      return dashboardStats(getDb(), actor())
    } catch (err) {
      console.error('[dashboard]', err)
      return null
    }
  })
}
