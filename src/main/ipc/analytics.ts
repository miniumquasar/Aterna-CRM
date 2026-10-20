/**
 * IPC handlers for the analytics domain. Register every channel declared in
 * src/shared/contracts/analytics.ts here with handle(channel, (req, ctx) => …);
 * register-all.ts already calls this function. Background jobs for the
 * domain are registered here too, with registerJob() from ../jobs.
 */
export function registerAnalyticsHandlers(): void {
  // The analytics domain has no channels yet.
}
