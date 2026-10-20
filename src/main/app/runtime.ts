/**
 * Facts about this running copy, set once at start-up, so services and
 * handlers can read them without importing Electron (which keeps them
 * testable under plain Node).
 */
export interface RuntimeInfo {
  version: string
  packaged: boolean
  platform: string
  arch: string
  electron: string
  chrome: string
  node: string
  dataFolder: string
}

let info: RuntimeInfo = {
  version: '0.0.0-test',
  packaged: false,
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron ?? '',
  chrome: process.versions.chrome ?? '',
  node: process.versions.node,
  dataFolder: ''
}

export function setRuntimeInfo(next: Partial<RuntimeInfo>): void {
  info = { ...info, ...next }
}

export function runtimeInfo(): RuntimeInfo {
  return info
}
