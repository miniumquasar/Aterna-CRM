/**
 * System: health checks and facts about this copy of the app.
 * Owned by the backup domain (docs/DOMAINS.md).
 */
import type { ChannelSpec, ChannelTable } from '../ipc/spec'

export interface Pong {
  pong: true
  /** When the main process answered, ISO 8601 UTC. */
  at: string
}

export interface SystemInfo {
  productName: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  arch: string
  /** True in an installed copy; false when run from source. */
  packaged: boolean
  /** The folder holding the database, documents, backups and logs. */
  dataFolder: string
  /** The firm the licence names, or null on the trial or before a licence is entered. */
  licenceHolder: string | null
}

export interface SystemContract {
  'system.ping': ChannelSpec<void, Pong>
  'system.info': ChannelSpec<void, SystemInfo>
}

export const systemChannels = {
  'system.ping': { kind: 'read', auth: 'public' },
  'system.info': { kind: 'read', auth: 'public' }
} as const satisfies ChannelTable<SystemContract>
