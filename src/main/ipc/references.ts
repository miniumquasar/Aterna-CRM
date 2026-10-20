/**
 * IPC handlers for the references domain. Register every channel declared in
 * src/shared/contracts/references.ts here with handle(channel, (req, ctx) => …);
 * register-all.ts already calls this function. Background jobs for the
 * domain are registered here too, with registerJob() from ../jobs.
 */
export function registerReferencesHandlers(): void {
  // The references domain has no channels yet.
}
