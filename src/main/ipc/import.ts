/**
 * IPC handlers for the import domain. Register every channel declared in
 * src/shared/contracts/import.ts here with handle(channel, (req, ctx) => …);
 * register-all.ts already calls this function. Background jobs for the
 * domain are registered here too, with registerJob() from ../jobs.
 */
export function registerImportHandlers(): void {
  // The import domain has no channels yet.
}
