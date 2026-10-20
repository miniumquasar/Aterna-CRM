/**
 * IPC handlers for the insights domain. Register every channel declared in
 * src/shared/contracts/insights.ts here with handle(channel, (req, ctx) => …);
 * register-all.ts already calls this function. Background jobs for the
 * domain are registered here too, with registerJob() from ../jobs.
 */
export function registerInsightsHandlers(): void {
  // The insights domain has no channels yet.
}
