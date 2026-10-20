/**
 * Communications, documents, templates and email.
 * Owned by the comms domain (docs/DOMAINS.md). Add channels here as
 * '<area>.<verb>' (camelCase), each with a flags entry in the table below.
 */
import type { ChannelTable } from '../ipc/spec'

export interface CommsContract {}

export const commsChannels = {} as const satisfies ChannelTable<CommsContract>
