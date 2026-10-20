/**
 * The one place every IPC call goes through.
 *
 *   handle('clients.update', (req, ctx) => updateClient(ctx.db, ctx.actor, req.id, req.values))
 *
 * For every call, in this order:
 *   1. the channel must exist in CHANNELS;
 *   2. the session bound to the calling window is resolved (the renderer
 *      never holds a token);
 *   3. without a session, only `auth: 'public'` channels run ('unauthenticated');
 *   4. writes are refused with 'read_only' when the licence gate says so,
 *      unless the channel is `allowWhenReadOnly`;
 *   5. the handler runs. A thrown UserFacingError becomes its Result; anything
 *      else becomes 'internal', with the detail logged and never sent.
 *
 * After a write (unless its flags say `audited: false`), the registry checks
 * that if rows changed, an audit entry was added too; one that wasn't goes
 * to `onUnauditedWrite` (logged in the app; createTestIpc fails the test).
 */
import { CHANNELS, isChannel, type Channel, type Req, type Res } from '@shared/ipc/contract'
import { fail, ok, type Result } from '@shared/ipc/result'
import { INVOKE_CHANNEL } from '@shared/ipc/transport'
import { log as appLog, type Logger } from '../app/logger'
import { getDb, type Db } from '../db/connection'
import { emit as emitEvent, type Emit } from '../events'
import { isReadOnly as licenceIsReadOnly } from '../licence/gate'
import { createContext, resolveActor, type HandlerContext } from './context'
import { isUserFacingError } from './errors'

export type Handler<C extends Channel> = (req: Req<C>, ctx: HandlerContext) => Res<C> | Promise<Res<C>>

type AnyHandler = (req: unknown, ctx: HandlerContext) => unknown

const handlers = new Map<Channel, AnyHandler>()

/** Registers the handler for a channel declared in the contract. Each channel has exactly one. */
export function handle<C extends Channel>(channel: C, handler: Handler<C>): void {
  if (!isChannel(channel)) throw new Error(`“${String(channel)}” isn’t in the IPC contract (src/shared/contracts/).`)
  if (handlers.has(channel)) throw new Error(`The channel ${channel} already has a handler.`)
  handlers.set(channel, handler as AnyHandler)
}

export function handledChannels(): Channel[] {
  return [...handlers.keys()]
}

/** Forgets every handler (tests). */
export function clearHandlers(): void {
  handlers.clear()
}

export interface RegistryDeps {
  getDb: () => Db
  log: Logger
  now: () => Date
  emit: Emit
  isReadOnly: () => boolean
  /** A write changed rows without adding an audit entry. Defaults to a warning in the log. */
  onUnauditedWrite?: (channel: Channel) => void
}

interface WriteMark {
  changes: number
  lastAuditId: number
}

/** How many rows this connection has changed so far, and the newest audit entry. */
function writeMark(db: Db): WriteMark {
  const row = db.prepare('SELECT total_changes() AS changes, (SELECT max(id) FROM audit_log) AS lastAuditId').get() as { changes: number; lastAuditId: number | null }
  return { changes: row.changes, lastAuditId: row.lastAuditId ?? 0 }
}

export function defaultRegistryDeps(): RegistryDeps {
  return { getDb, log: appLog(), now: () => new Date(), emit: emitEvent, isReadOnly: licenceIsReadOnly }
}

const MESSAGES = {
  unknown: 'That isn’t something this version of AETERNA CRM can do.',
  signIn: 'Sign in to carry on.',
  readOnly:
    'AETERNA CRM is read-only because the licence has expired. Everything can still be viewed and exported; enter a licence key in Settings → Licence to make changes.',
  notReady: 'That part of AETERNA CRM isn’t available in this version yet.',
  internal: 'Something went wrong, so that didn’t finish. The details were saved in the app’s log; if it keeps happening, contact support.'
} as const

/** Runs one call through every check. Never throws. */
export async function dispatch(deps: RegistryDeps, senderId: number, channel: unknown, req: unknown): Promise<Result<unknown>> {
  // 1. The channel exists.
  if (!isChannel(channel)) return fail('not_found', MESSAGES.unknown)
  const flags = CHANNELS[channel]
  try {
    const db = deps.getDb()
    const now = deps.now()
    // 2. The session bound to the calling window.
    const actor = resolveActor(db, senderId, now)
    // 3. Signed in, unless the channel is public.
    if (!actor && flags.auth !== 'public') return fail('unauthenticated', MESSAGES.signIn)
    // 4. The licence's read-only gate.
    if (flags.kind === 'write' && !flags.allowWhenReadOnly && deps.isReadOnly()) return fail('read_only', MESSAGES.readOnly)
    // 5. The handler.
    const handler = handlers.get(channel)
    if (!handler) {
      deps.log.error(`No handler is registered for ${channel}.`)
      return fail('unavailable', MESSAGES.notReady)
    }
    const ctx = createContext({ db, senderId, actor, now: deps.now, emit: deps.emit, log: deps.log.child(channel) })
    const mark = flags.kind === 'write' && flags.audited !== false ? writeMark(db) : null
    const data = await handler(req, ctx)
    if (mark) {
      const after = writeMark(db)
      if (after.changes > mark.changes && after.lastAuditId === mark.lastAuditId) {
        if (deps.onUnauditedWrite) deps.onUnauditedWrite(channel)
        else deps.log.warn(`${channel} changed stored data without an audit entry (recordChange).`)
      }
    }
    return ok(data)
  } catch (err) {
    if (isUserFacingError(err)) return fail(err.code, err.message, err.field)
    deps.log.error(`${channel} failed`, err)
    return fail('internal', MESSAGES.internal)
  }
}

/** The part of Electron's ipcMain the registry uses (a fake in tests). */
export interface IpcMainLike {
  handle(channel: string, listener: (event: IpcInvokeEventLike, ...args: unknown[]) => unknown): void
  removeHandler?(channel: string): void
}

export interface IpcInvokeEventLike {
  sender: { id: number }
  senderFrame?: { url: string; parent?: unknown } | null
}

export interface InstallOptions {
  /** Refuses calls from anything but the app's own page (the main window's top frame). */
  isTrustedSender?: (event: IpcInvokeEventLike) => boolean
}

/** Connects the registry to ipcMain: one invoke channel carries every typed call. */
export function installIpc(ipcMain: IpcMainLike, deps: RegistryDeps = defaultRegistryDeps(), options: InstallOptions = {}): void {
  ipcMain.removeHandler?.(INVOKE_CHANNEL)
  ipcMain.handle(INVOKE_CHANNEL, (event, channel, req) => {
    if (options.isTrustedSender && !options.isTrustedSender(event)) {
      deps.log.warn(`Refused a call to ${String(channel)} from an untrusted page.`)
      return fail('forbidden', 'That request didn’t come from AETERNA CRM itself, so it was refused.')
    }
    return dispatch(deps, event.sender.id, channel, req)
  })
}

export interface WiringReport {
  /** Channels in the contract with no handler. */
  missing: Channel[]
  total: number
}

export function wiringReport(): WiringReport {
  const all = Object.keys(CHANNELS) as Channel[]
  return { missing: all.filter((c) => !handlers.has(c)), total: all.length }
}
