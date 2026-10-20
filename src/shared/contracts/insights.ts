/**
 * Home, activity, notifications and the calendar.
 * Owned by the insights domain (docs/DOMAINS.md). Add channels here as
 * '<area>.<verb>' (camelCase), each with a flags entry in the table below.
 */
import type { ChannelTable } from '../ipc/spec'

export interface InsightsContract {}

export const insightsChannels = {} as const satisfies ChannelTable<InsightsContract>
