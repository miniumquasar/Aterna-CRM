/**
 * The whole IPC contract: every domain's channels composed into one typed
 * `ApiContract` and one runtime `CHANNELS` table. Every domain is pre-wired
 * here, so a domain only ever edits its own file in src/shared/contracts/.
 */
import type { ChannelFlags, ChannelTable } from './spec'
import { amlChannels, type AmlContract } from '../contracts/aml'
import { analyticsChannels, type AnalyticsContract } from '../contracts/analytics'
import { appearanceChannels, type AppearanceContract } from '../contracts/appearance'
import { authChannels, type AuthContract } from '../contracts/auth'
import { backupChannels, type BackupContract } from '../contracts/backup'
import { clientsChannels, type ClientsContract } from '../contracts/clients'
import { commsChannels, type CommsContract } from '../contracts/comms'
import { complianceChannels, type ComplianceContract } from '../contracts/compliance'
import { importChannels, type ImportContract } from '../contracts/import'
import { insightsChannels, type InsightsContract } from '../contracts/insights'
import { integrationsChannels, type IntegrationsContract } from '../contracts/integrations'
import { licenceChannels, type LicenceContract } from '../contracts/licence'
import { referencesChannels, type ReferencesContract } from '../contracts/references'
import { systemChannels, type SystemContract } from '../contracts/system'
import { workChannels, type WorkContract } from '../contracts/work'

export interface ApiContract
  extends SystemContract,
    AppearanceContract,
    AuthContract,
    LicenceContract,
    BackupContract,
    ClientsContract,
    ComplianceContract,
    WorkContract,
    AmlContract,
    CommsContract,
    ReferencesContract,
    ImportContract,
    InsightsContract,
    AnalyticsContract,
    IntegrationsContract {}

/** Every channel name, e.g. 'clients.list'. */
export type Channel = keyof ApiContract & string
/** What a channel takes. */
export type Req<C extends Channel> = ApiContract[C]['req']
/** What a channel gives back on success. */
export type Res<C extends Channel> = ApiContract[C]['res']

/** Each domain's channel table, by domain, for the wiring report and the contract tests. */
export const CHANNEL_TABLES = {
  system: systemChannels,
  appearance: appearanceChannels,
  auth: authChannels,
  licence: licenceChannels,
  backup: backupChannels,
  clients: clientsChannels,
  compliance: complianceChannels,
  work: workChannels,
  aml: amlChannels,
  comms: commsChannels,
  references: referencesChannels,
  import: importChannels,
  insights: insightsChannels,
  analytics: analyticsChannels,
  integrations: integrationsChannels
} as const

export type ContractDomain = keyof typeof CHANNEL_TABLES

const composed = {
  ...systemChannels,
  ...appearanceChannels,
  ...authChannels,
  ...licenceChannels,
  ...backupChannels,
  ...clientsChannels,
  ...complianceChannels,
  ...workChannels,
  ...amlChannels,
  ...commsChannels,
  ...referencesChannels,
  ...importChannels,
  ...insightsChannels,
  ...analyticsChannels,
  ...integrationsChannels
} satisfies ChannelTable<ApiContract>

/** The runtime table: every channel's flags. The bridge and the registry refuse anything not in it. */
export const CHANNELS: ChannelTable<ApiContract> = Object.freeze(composed)

export function isChannel(name: unknown): name is Channel {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(CHANNELS, name)
}

export function channelFlags(channel: Channel): ChannelFlags {
  return CHANNELS[channel]
}
