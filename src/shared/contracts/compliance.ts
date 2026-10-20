/**
 * Deadlines, HMRC submissions and onboarding gaps.
 * Owned by the compliance domain (docs/DOMAINS.md). Add channels here as
 * '<area>.<verb>' (camelCase), each with a flags entry in the table below.
 */
import type { ChannelTable } from '../ipc/spec'

export interface ComplianceContract {}

export const complianceChannels = {} as const satisfies ChannelTable<ComplianceContract>
