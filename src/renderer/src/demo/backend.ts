/**
 * The browser demo's backend, used by lib/api.ts when the app runs in a
 * browser without Electron (window.aeterna is absent). It has no data yet,
 * so every call answers 'unavailable' and screens show their LoadProblem.
 */
import type { Channel, Req, Res } from '@shared/ipc/contract'
import type { ApiEvents, EventName } from '@shared/ipc/events'
import type { BridgeInfo } from '@shared/ipc/bridge'
import { fail, type Result } from '@shared/ipc/result'

export async function demoInvoke<C extends Channel>(_channel: C, _req: Req<C>): Promise<Result<Res<C>>> {
  return fail('unavailable', 'This is the browser preview of AETERNA CRM, which has no practice data. Open the desktop app to use it.')
}

export function demoOn<E extends EventName>(_event: E, _listener: (payload: ApiEvents[E]) => void): () => void {
  return () => undefined
}

export const demoInfo: BridgeInfo = { platform: 'win32', versions: { app: 'preview', electron: '' } }
