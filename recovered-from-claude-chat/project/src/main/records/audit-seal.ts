/**
 * Seals on the audit log. The log can only be added to (triggers refuse any
 * change or deletion), but someone could still go around the app and edit the
 * database file with another tool. A seal makes that show:
 *
 *   the chain   a SHA-256 hash run over every audit entry in order, each step
 *               taking the last value and the whole entry (when, who, what,
 *               which record, before and after). Changing, removing or
 *               inserting any entry changes every value after it.
 *   a seal      the chain value after a given entry, with how many entries
 *               there were. The app seals new entries when it starts and every
 *               hour; seals are only ever added.
 *   checking    runs the chain again from the first entry and compares it with
 *               every seal. The first seal that doesn't match says which
 *               entries were changed, and how many are missing.
 *
 * What it can't do: someone with full access to this computer could rewrite
 * the log and work out new seals. The latest seal's fingerprint, kept
 * somewhere else, shows that too.
 */
import { createHash } from 'node:crypto'
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { AuditCheck } from '../../shared/types'

interface EntryRow {
  id: number
  timestamp: string
  user_id: number | null
  user_name: string | null
  action: string
  table_name: string | null
  record_id: string | null
  old_value: string | null
  new_value: string | null
}

interface SealRow {
  sealed_through: number
  entries: number
  chain: string
  sealed_at: string
}

/** Where every chain starts. */
export const GENESIS = createHash('sha256').update('aeterna-audit-log-v1').digest('hex')

const ENTRY_COLUMNS = 'id, timestamp, user_id, user_name, action, table_name, record_id, old_value, new_value'

/** Everything about an entry, in a fixed order, as the chain reads it. */
export const entryText = (r: EntryRow): string =>
  JSON.stringify([r.id, r.timestamp, r.user_id, r.user_name, r.action, r.table_name, r.record_id, r.old_value, r.new_value])

/** The chain value after one more entry. */
export const chainStep = (previous: string, r: EntryRow): string => createHash('sha256').update(previous).update('\n').update(entryText(r)).digest('hex')

/** "a1b2 c3d4 e5f6 a7b8": enough of a seal's value to copy down and compare later. */
export const fingerprintOf = (chain: string): string => chain.slice(0, 16).replace(/(.{4})(?=.)/g, '$1 ')

/** Seals every audit entry added since the last seal. Returns whether a new seal was made. */
export function sealAuditLog(db: Database): { sealed: boolean; through: number | null; entries: number } {
  return db.transaction(() => {
    const last = db.prepare('SELECT sealed_through, entries, chain, sealed_at FROM audit_seals ORDER BY sealed_through DESC LIMIT 1').get() as SealRow | undefined
    const from = last?.sealed_through ?? 0
    let chain = last?.chain ?? GENESIS
    let entries = last?.entries ?? 0
    let through = from
    for (const r of db.prepare(`SELECT ${ENTRY_COLUMNS} FROM audit_log WHERE id > ? ORDER BY id`).iterate(from) as IterableIterator<EntryRow>) {
      chain = chainStep(chain, r)
      entries += 1
      through = r.id
    }
    if (through === from) return { sealed: false, through: last ? from : null, entries }
    db.prepare('INSERT INTO audit_seals (sealed_through, entries, chain) VALUES (?, ?, ?)').run(through, entries, chain)
    return { sealed: true, through, entries }
  })()
}

/** Runs the chain again from the first entry and compares it with every seal. */
export function checkAuditLog(db: Database, now: Date = new Date()): AuditCheck {
  const seals = db.prepare('SELECT sealed_through, entries, chain, sealed_at FROM audit_seals ORDER BY sealed_through').all() as SealRow[]
  const total = (db.prepare('SELECT COUNT(*) AS n FROM audit_log').get() as { n: number }).n
  const base: Omit<AuditCheck, 'state' | 'problem'> = {
    checkedAt: now.toISOString(),
    entries: total,
    seals: seals.length,
    sealedThrough: null,
    sealedAt: null,
    fingerprint: null,
    unsealed: total
  }
  if (!seals.length) return { ...base, state: 'unsealed', problem: null }

  const latest = seals[seals.length - 1]
  let chain = GENESIS
  let counted = 0
  let next = 0
  let problem: AuditCheck['problem'] = null
  // Compares the chain so far with seal `next`; the first that doesn't match is the problem.
  const compare = (): boolean => {
    const s = seals[next]
    if (s.chain !== chain || s.entries !== counted) {
      problem = { fromId: next === 0 ? 1 : seals[next - 1].sealed_through + 1, toId: s.sealed_through, sealedAt: s.sealed_at, missing: Math.max(0, s.entries - counted) }
      return false
    }
    next += 1
    return true
  }
  for (const r of db.prepare(`SELECT ${ENTRY_COLUMNS} FROM audit_log WHERE id <= ? ORDER BY id`).iterate(latest.sealed_through) as IterableIterator<EntryRow>) {
    while (next < seals.length && seals[next].sealed_through < r.id) {
      if (!compare()) break
    }
    if (problem) break
    chain = chainStep(chain, r)
    counted += 1
  }
  while (!problem && next < seals.length) compare()

  const sealedCount = latest.entries
  return {
    ...base,
    state: problem ? 'changed' : 'intact',
    sealedThrough: latest.sealed_through,
    sealedAt: latest.sealed_at,
    fingerprint: fingerprintOf(latest.chain),
    unsealed: Math.max(0, total - sealedCount),
    problem
  }
}
