/**
 * Companies House and the local assistant.
 * Owned by the integrations domain (docs/DOMAINS.md). Add channels here as
 * '<area>.<verb>' (camelCase), each with a flags entry in the table below.
 */
import type { ChannelTable } from '../ipc/spec'

export interface IntegrationsContract {}

export const integrationsChannels = {} as const satisfies ChannelTable<IntegrationsContract>
