/**
 * What stops a person being removed: clients or past work under them. A
 * person with any is never removed; a partner turns their access off
 * instead, which keeps every record that names them.
 *
 * The auth domain checks the clients they look after and the clients they
 * are responsible partner for. Every other domain whose records name a
 * person adds its own check from its registerXxxHandlers():
 *
 *   registerPersonLinkCheck({
 *     id: 'work.tasks',
 *     count: (db, userId) => (db.prepare('SELECT count(*) AS n FROM tasks WHERE assignee_id = ?').get(userId) as { n: number }).n,
 *     describe: (n) => (n === 1 ? '1 task' : `${n} tasks`)
 *   })
 *
 * Registering the same id again replaces it. As a last line of defence, a
 * removal that a foreign key still refuses is turned into the same plain
 * answer (people.ts).
 */
import type { PersonLink } from '@shared/contracts/auth'
import type { Db } from '../db/connection'

export interface PersonLinkCheck {
  /** Unique: '<domain>.<what>'. */
  id: string
  /** How many of these records name the person. */
  count: (db: Db, userId: number) => number
  /** The records in words, with the count: '12 clients they look after'. */
  describe: (count: number) => string
}

const checks = new Map<string, PersonLinkCheck>()

export function registerPersonLinkCheck(check: PersonLinkCheck): void {
  checks.set(check.id, check)
}

/** Forgets the checks other domains added, keeping the auth domain's own (tests). */
export function resetPersonLinkChecks(): void {
  checks.clear()
  for (const check of BUILT_IN) checks.set(check.id, check)
}

const count = (db: Db, sql: string, userId: number): number => (db.prepare(sql).get(userId) as { n: number }).n

const BUILT_IN: readonly PersonLinkCheck[] = [
  {
    id: 'clients.assigned',
    count: (db, userId) => count(db, 'SELECT count(*) AS n FROM clients WHERE assigned_to = ?', userId),
    describe: (n) => (n === 1 ? '1 client they look after' : `${n.toLocaleString('en-GB')} clients they look after`)
  },
  {
    id: 'clients.partner',
    count: (db, userId) => count(db, 'SELECT count(*) AS n FROM clients WHERE partner_id = ?', userId),
    describe: (n) => (n === 1 ? '1 client they are the responsible partner for' : `${n.toLocaleString('en-GB')} clients they are the responsible partner for`)
  }
]

resetPersonLinkChecks()

/** Everything under the person, as phrases with counts (only what there is). */
export function personLinks(db: Db, userId: number): PersonLink[] {
  const out: PersonLink[] = []
  for (const check of checks.values()) {
    const n = check.count(db, userId)
    if (n > 0) out.push({ label: check.describe(n), count: n })
  }
  return out
}
