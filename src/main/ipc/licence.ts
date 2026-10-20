/**
 * IPC handlers for the licence domain. Register every channel declared in
 * src/shared/contracts/licence.ts here with handle(channel, (req, ctx) => …);
 * register-all.ts already calls this function. Background jobs for the
 * domain are registered here too, with registerJob() from ../jobs.
 */
export function registerLicenceHandlers(): void {
  // The licence domain has no channels yet.
}
