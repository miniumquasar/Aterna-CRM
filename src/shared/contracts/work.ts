/**
 * Tasks, work in progress, invoices and receipts.
 * Owned by the work domain (docs/DOMAINS.md). Add channels here as
 * '<area>.<verb>' (camelCase), each with a flags entry in the table below.
 */
import type { ChannelTable } from '../ipc/spec'

export interface WorkContract {}

export const workChannels = {} as const satisfies ChannelTable<WorkContract>
