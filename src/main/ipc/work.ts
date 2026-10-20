/**
 * IPC handlers for the work domain. Register every channel declared in
 * src/shared/contracts/work.ts here with handle(channel, (req, ctx) => …);
 * register-all.ts already calls this function. Background jobs for the
 * domain are registered here too, with registerJob() from ../jobs.
 */
export function registerWorkHandlers(): void {
  // The work domain has no channels yet.
}
