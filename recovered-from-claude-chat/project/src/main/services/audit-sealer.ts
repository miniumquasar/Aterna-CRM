/**
 * Seals the audit log a minute after the app starts, then every hour, and
 * once more as it closes, so entries are never long without a seal. Each seal
 * covers everything added since the last (records/audit-seal.ts); a run with
 * nothing new adds nothing.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import { sealAuditLog } from '../records/audit-seal'

export interface SealerOptions {
  db: () => Database
  firstAfterMs?: number
  everyMs?: number
  log?: (message: string, err: unknown) => void
}

/** Starts sealing; the returned function stops it and seals one last time. */
export function startAuditSealer(opts: SealerOptions): () => void {
  const log = opts.log ?? ((message, err) => console.error(message, err))
  const seal = (): void => {
    try {
      sealAuditLog(opts.db())
    } catch (err) {
      log('[audit] the audit log couldn’t be sealed', err)
    }
  }
  const first = setTimeout(seal, opts.firstAfterMs ?? 60_000)
  const every = setInterval(seal, opts.everyMs ?? 3_600_000)
  first.unref?.()
  every.unref?.()
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    clearTimeout(first)
    clearInterval(every)
    seal()
  }
}
