/**
 * IPC handlers for the aml domain. Register every channel declared in
 * src/shared/contracts/aml.ts here with handle(channel, (req, ctx) => …);
 * register-all.ts already calls this function. Background jobs for the
 * domain are registered here too, with registerJob() from ../jobs.
 */
export function registerAmlHandlers(): void {
  // The aml domain has no channels yet.
}
