/**
 * Start-up step 4: one-time conversion of values sealed under an older
 * scheme. This build started with field-crypto v1, so there is nothing older
 * to convert; a later change of scheme adds its conversion to the list, and
 * each runs once, recorded in app_meta, with anything unreadable listed for
 * re-entry rather than dropped.
 */
import type { Logger } from '../app/logger'
import type { Db } from '../db/connection'

export interface Conversion {
  /** Recorded in app_meta as conversion:<id> once done. */
  id: string
  /** Returns how many values it converted. */
  run(db: Db, log: Logger): number
}

export const CONVERSIONS: readonly Conversion[] = []

export function runConversions(db: Db, log: Logger, conversions: readonly Conversion[] = CONVERSIONS): string[] {
  const ran: string[] = []
  for (const c of conversions) {
    const key = `conversion:${c.id}`
    if (db.prepare('SELECT 1 FROM app_meta WHERE key = ?').get(key)) continue
    db.transaction(() => {
      const n = c.run(db, log)
      db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run(key, JSON.stringify({ converted: n, at: new Date().toISOString() }))
      log.info(`Conversion ${c.id}: ${n} value(s) converted.`)
    })()
    ran.push(c.id)
  }
  if (!ran.length) log.info('No older sealed values to convert.')
  return ran
}
