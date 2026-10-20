/**
 * Clients, the client file and its registers.
 * Owned by the clients domain (docs/DOMAINS.md). Add channels here as
 * '<area>.<verb>' (camelCase), each with a flags entry in the table below.
 */
import type { ChannelTable } from '../ipc/spec'

export interface ClientsContract {}

export const clientsChannels = {} as const satisfies ChannelTable<ClientsContract>
