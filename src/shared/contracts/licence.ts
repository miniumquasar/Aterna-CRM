/**
 * Licence: trial, keys, renewal, read-only status.
 * Owned by the licence domain (docs/DOMAINS.md). Add channels here as
 * '<area>.<verb>' (camelCase), each with a flags entry in the table below.
 */
import type { ChannelTable } from '../ipc/spec'

export interface LicenceContract {}

export const licenceChannels = {} as const satisfies ChannelTable<LicenceContract>
