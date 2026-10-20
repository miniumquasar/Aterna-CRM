/**
 * The shape of `window.aeterna`, exposed by src/preload/index.ts. The
 * renderer reaches it only through src/renderer/src/lib/api.ts.
 */
import type { Channel, Req, Res } from './contract'
import type { ApiEvents, EventName } from './events'
import type { Result } from './result'

/** Node's platform names (NodeJS.Platform), without depending on Node's types in the renderer. */
export type Platform =
  | 'aix'
  | 'android'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd'

export interface BridgeInfo {
  platform: Platform
  versions: { app: string; electron: string }
}

export interface AeternaBridge {
  invoke<C extends Channel>(channel: C, req: Req<C>): Promise<Result<Res<C>>>
  on<E extends EventName>(event: E, listener: (payload: ApiEvents[E]) => void): () => void
  info: BridgeInfo
}
