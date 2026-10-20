/**
 * Workbook import and the data explorer.
 * Owned by the import domain (docs/DOMAINS.md). Add channels here as
 * '<area>.<verb>' (camelCase), each with a flags entry in the table below.
 */
import type { ChannelTable } from '../ipc/spec'

export interface ImportContract {}

export const importChannels = {} as const satisfies ChannelTable<ImportContract>
