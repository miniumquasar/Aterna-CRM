/**
 * Ambient declaration — extends the global `Window` interface so that every
 * renderer module sees `window.api` typed as IElectronAPI and
 * `window.electron` as the small platform shim.
 *
 * IMPORTANT: this file has NO runtime side-effects. It is picked up by
 * tsconfig.web.json via `"include": ["src/shared/**\/*"]` because the
 * shared dir is in both the node and web project references.
 */

import type { IElectronAPI } from '@shared/types'

export interface ElectronPlatformAPI {
  platform: NodeJS.Platform
  versions: NodeJS.ProcessVersions
  webFrame: {
    setZoomFactor: (factor: number) => void
  }
}

declare global {
  interface Window {
    /** Small platform shim (zoom, platform, versions). */
    electron: ElectronPlatformAPI
    /** The full IPC bridge — every channel exposed to the renderer. */
    api: IElectronAPI
  }
}

export {}
