/**
 * Risk, forecast, reports and the security overview.
 * Owned by the analytics domain (docs/DOMAINS.md). Add channels here as
 * '<area>.<verb>' (camelCase), each with a flags entry in the table below.
 */
import type { ChannelTable } from '../ipc/spec'

export interface AnalyticsContract {}

export const analyticsChannels = {} as const satisfies ChannelTable<AnalyticsContract>
