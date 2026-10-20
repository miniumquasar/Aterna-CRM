/**
 * ar.ts — money owed to the practice, and receipts. Worked out in whole pence by
 * ../records/receivables.ts, which also explains how receipts pay invoices.
 */
import { ipcMain } from 'electron'
import { getDb } from '../db/schema'
import type { ARSummary, ClientAR, PaymentReceipt } from '@shared/types'
import { addReceipt, allClientReceivables, clientReceivables, deleteReceipt, listReceipts, receivablesSummary } from '../records/receivables'
import { actor, reply, rows } from './session'

const NOTHING: ARSummary = { invoiced_pence: 0, received_pence: 0, outstanding_pence: 0, credit_pence: 0, overdue_pence: 0, overdue_count: 0, clients_owing: 0 }

export function registerArHandlers(): void {
  ipcMain.handle('ar:get-client', (_e, clientRef: string): ClientAR | null =>
    rows('ar', null, () => clientReceivables(getDb(), actor(), clientRef)))

  // Every client with invoices or receipts, for the client list's balance column.
  ipcMain.handle('ar:get-all-clients', (): ClientAR[] => rows('ar', [], () => allClientReceivables(getDb(), actor())))

  ipcMain.handle('ar:get-summary', (): ARSummary => rows('ar', NOTHING, () => receivablesSummary(getDb(), actor())))

  ipcMain.handle('ar:get-receipts', (_e, clientRef: string): PaymentReceipt[] => rows('ar', [], () => listReceipts(getDb(), actor(), clientRef)))

  ipcMain.handle('ar:add-receipt', (_e, data: Partial<PaymentReceipt>) => reply('ar', () => addReceipt(getDb(), actor(), data)))

  ipcMain.handle('ar:delete-receipt', (_e, id: number) =>
    reply('ar', () => {
      deleteReceipt(getDb(), actor(), id)
      return {}
    })
  )
}
