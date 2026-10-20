/**
 * IPC handlers for the integrations domain. Register every channel declared in
 * src/shared/contracts/integrations.ts here with handle(channel, (req, ctx) => …);
 * register-all.ts already calls this function. Background jobs for the
 * domain are registered here too, with registerJob() from ../jobs.
 */
export function registerIntegrationsHandlers(): void {
  // The integrations domain has no channels yet.
}
