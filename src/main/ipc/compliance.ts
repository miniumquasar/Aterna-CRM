/**
 * IPC handlers for the compliance domain. Register every channel declared in
 * src/shared/contracts/compliance.ts here with handle(channel, (req, ctx) => …);
 * register-all.ts already calls this function. Background jobs for the
 * domain are registered here too, with registerJob() from ../jobs.
 */
export function registerComplianceHandlers(): void {
  // The compliance domain has no channels yet.
}
