/**
 * Registers every domain's handlers (start-up step 6). Every domain is
 * pre-wired, so a domain only edits its own src/main/ipc/<domain>.ts.
 */
import type { ContractDomain } from '@shared/ipc/contract'
import { registerAmlHandlers } from './aml'
import { registerAnalyticsHandlers } from './analytics'
import { registerAppearanceHandlers } from './appearance'
import { registerAuthHandlers } from './auth'
import { registerBackupHandlers } from './backup'
import { registerClientsHandlers } from './clients'
import { registerCommsHandlers } from './comms'
import { registerComplianceHandlers } from './compliance'
import { registerImportHandlers } from './import'
import { registerInsightsHandlers } from './insights'
import { registerIntegrationsHandlers } from './integrations'
import { registerLicenceHandlers } from './licence'
import { registerReferencesHandlers } from './references'
import { registerSystemHandlers } from './system'
import { registerWorkHandlers } from './work'

export const DOMAIN_REGISTRARS: ReadonlyArray<readonly [ContractDomain, () => void]> = [
  ['system', registerSystemHandlers],
  ['appearance', registerAppearanceHandlers],
  ['auth', registerAuthHandlers],
  ['licence', registerLicenceHandlers],
  ['backup', registerBackupHandlers],
  ['clients', registerClientsHandlers],
  ['compliance', registerComplianceHandlers],
  ['work', registerWorkHandlers],
  ['aml', registerAmlHandlers],
  ['comms', registerCommsHandlers],
  ['references', registerReferencesHandlers],
  ['import', registerImportHandlers],
  ['insights', registerInsightsHandlers],
  ['analytics', registerAnalyticsHandlers],
  ['integrations', registerIntegrationsHandlers]
]

export function registerAllHandlers(): void {
  for (const [, register] of DOMAIN_REGISTRARS) register()
}
