/**
 * Calling channels the way the renderer does, through the real registry:
 * the checks (session, public, read-only) and the error handling all run.
 *
 *   const ipc = createTestIpc(db)
 *   ipc.signInAs('staff')
 *   const result = await ipc.call('clients.list', { … })
 */
import type { Role } from '@shared/domain/roles'
import type { Channel, Req, Res } from '@shared/ipc/contract'
import type { Result } from '@shared/ipc/result'
import { createMemoryLogger } from '@main/app/logger'
import { createSession } from '@main/auth/service'
import type { Db } from '@main/db/connection'
import { bindSession, clearSessionBindings, unbindSession } from '@main/ipc/context'
import { registerAllHandlers } from '@main/ipc/register-all'
import { clearHandlers, dispatch, type RegistryDeps } from '@main/ipc/registry'
import { clearJobs } from '@main/jobs'
import { actorFor } from './db'

let nextSender = 1000

export interface TestIpc {
  /** The fake window's id. */
  senderId: number
  deps: RegistryDeps
  log: ReturnType<typeof createMemoryLogger>
  /** Every event emitted, in order. */
  events: Array<{ event: string; payload: unknown }>
  call<C extends Channel>(channel: C, req: Req<C>): Promise<Result<Res<C>>>
  /** The data, or a thrown error naming the refusal. */
  ok<C extends Channel>(channel: C, req: Req<C>): Promise<Res<C>>
  signInAs(role: Role): void
  signOut(): void
  /** How many audit entries exist. */
  auditCount(): number
}

/** Registers every domain's handlers afresh (clearing any from an earlier test). */
export function registerAllForTest(): void {
  clearHandlers()
  clearJobs()
  registerAllHandlers()
}

export function createTestIpc(db: Db, options: { readOnly?: boolean; now?: () => Date; register?: boolean } = {}): TestIpc {
  if (options.register !== false) registerAllForTest()
  clearSessionBindings()
  const senderId = nextSender++
  const log = createMemoryLogger()
  const events: TestIpc['events'] = []
  const deps: RegistryDeps = {
    getDb: () => db,
    log,
    now: options.now ?? (() => new Date()),
    emit: (event, payload) => {
      events.push({ event, payload })
    },
    isReadOnly: () => options.readOnly ?? false
  }
  const call = <C extends Channel>(channel: C, req: Req<C>): Promise<Result<Res<C>>> =>
    dispatch(deps, senderId, channel, req) as Promise<Result<Res<C>>>
  return {
    senderId,
    deps,
    log,
    events,
    call,
    async ok(channel, req) {
      const r = await call(channel, req)
      if (!r.ok) throw new Error(`${channel} was refused: ${r.error.code}: ${r.error.message}`)
      return r.data
    },
    signInAs(role) {
      bindSession(senderId, createSession(db, actorFor(role).id))
    },
    signOut() {
      unbindSession(senderId)
    },
    auditCount() {
      return (db.prepare('SELECT count(*) AS n FROM audit_log').get() as { n: number }).n
    }
  }
}
