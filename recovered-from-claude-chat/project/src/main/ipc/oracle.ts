/**
 * oracle.ts — Forecast: deadlines and workload by month and by person, the
 * fees the practice expects to bill, and the cash view. Staff see their own
 * clients. The assistant's summary of it is 'ai:summarise' (ipc/ai-chat.ts).
 */
import { ipcMain } from 'electron'
import { getDb } from '../db/schema'
import { forecast } from '../records/forecast'
import { actor, result } from './session'

export function registerOracleHandlers(): void {
  ipcMain.handle('forecast:get', (_e, query: unknown) => result('forecast', () => forecast(getDb(), actor(), query)))
}
