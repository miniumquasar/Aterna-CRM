/**
 * `window.aeterna`, as the renderer sees it. Absent in the browser demo,
 * where src/renderer/src/lib/api.ts uses the demo backend instead.
 */
import type { AeternaBridge } from '../shared/ipc/bridge'

declare global {
  interface Window {
    aeterna?: AeternaBridge
  }
}

export {}
