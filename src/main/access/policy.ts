/**
 * Who may see and change what.
 *
 *  - partner ≥ manager ≥ staff.
 *  - Staff see and change only the clients assigned to them, and those
 *    clients' records; managers and partners see everything.
 *  - Only partners delete records the practice must keep (invoices,
 *    receipts, HMRC submissions, AML records, documents, work in progress).
 */
import { roleAtLeast, type Actor, type Role } from '@shared/domain/roles'
import type { Db } from '../db/connection'
import { UserFacingError } from '../ipc/errors'

export type { Actor, Role } from '@shared/domain/roles'

/**
 * Refuses unless the actor holds `minimum` or above. `action` finishes the
 * sentence: requireRole(actor, 'manager', 'assign clients') → "Only a
 * manager or a partner can assign clients."
 */
export function requireRole(actor: Actor | null, minimum: Role, action = 'do that'): Actor {
  if (!actor) throw new UserFacingError('unauthenticated', 'Sign in to carry on.')
  if (!roleAtLeast(actor.role, minimum)) {
    const who = minimum === 'partner' ? 'a partner' : 'a manager or a partner'
    throw new UserFacingError('forbidden', `Only ${who} can ${action}.`)
  }
  return actor
}

/** Partners only, for deleting a record the practice must keep. `record` is named in the message: 'an invoice'. */
export function requirePartnerToDelete(actor: Actor | null, record: string): Actor {
  return requireRole(actor, 'partner', `delete ${record}`)
}

/** True when the actor sees every client (manager or partner). */
export function seesAllClients(actor: Actor): boolean {
  return roleAtLeast(actor.role, 'manager')
}

/**
 * Refuses unless the client exists and the actor may work on it. Returns
 * nothing; throws 'not_found' or 'forbidden' with a plain sentence.
 */
export function assertClientAccess(db: Db, actor: Actor | null, clientId: number): void {
  if (!actor) throw new UserFacingError('unauthenticated', 'Sign in to carry on.')
  const row = db.prepare('SELECT assigned_to FROM clients WHERE id = ?').get(clientId) as { assigned_to: number | null } | undefined
  if (!row) throw new UserFacingError('not_found', 'That client no longer exists.')
  if (!seesAllClients(actor) && row.assigned_to !== actor.id) {
    throw new UserFacingError('forbidden', 'That client isn’t assigned to you. Ask a manager or a partner if you need to work on it.')
  }
}

export interface ScopeSql {
  /** A condition to AND into a WHERE clause. */
  sql: string
  params: unknown[]
}

/**
 * The condition that limits a client list to what the actor may see:
 *
 *   const scope = clientScopeSql(actor, 'c')
 *   db.prepare(`SELECT … FROM clients c WHERE ${scope.sql} AND …`).all(...scope.params, …)
 */
export function clientScopeSql(actor: Actor, alias = 'clients'): ScopeSql {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error(`Unsafe table alias: ${alias}`)
  if (seesAllClients(actor)) return { sql: '1 = 1', params: [] }
  return { sql: `${alias}.assigned_to = ?`, params: [actor.id] }
}
