/**
 * Start-up step 5: the licence. Owned by the licence domain, which loads the
 * trial or key here, seals the latest time seen and sets the gate. Keep the
 * signature: src/main/index.ts calls it.
 */
import type { Logger } from '../app/logger'
import type { DataPaths } from '../app/paths'
import type { Db } from '../db/connection'

export interface LicenceStartup {
  db: Db
  paths: DataPaths
  log: Logger
  now: Date
}

/** May be async (reading the marker outside the data folder, for instance): start-up waits for it. */
export function startLicence(ctx: LicenceStartup): void | Promise<void> {
  ctx.log.info('Licence checks are not part of this build yet; every feature is available.')
}
