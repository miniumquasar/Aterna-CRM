/**
 * IPC handlers for the clients domain. Register every channel declared in
 * src/shared/contracts/clients.ts here with handle(channel, (req, ctx) => …);
 * register-all.ts already calls this function. Background jobs for the
 * domain are registered here too, with registerJob() from ../jobs.
 */
export function registerClientsHandlers(): void {
  // The clients domain has no channels yet.
}
