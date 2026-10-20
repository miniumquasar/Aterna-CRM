/**
 * Practice and client references, agent authorisations and the vault.
 * Owned by the references domain (docs/DOMAINS.md). Add channels here as
 * '<area>.<verb>' (camelCase), each with a flags entry in the table below.
 */
import type { ChannelTable } from '../ipc/spec'

export interface ReferencesContract {}

export const referencesChannels = {} as const satisfies ChannelTable<ReferencesContract>
