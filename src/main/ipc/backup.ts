/**
 * IPC handlers for the backup domain. Register every channel declared in
 * src/shared/contracts/backup.ts here with handle(channel, (req, ctx) => …);
 * register-all.ts already calls this function. Background jobs for the
 * domain are registered here too, with registerJob() from ../jobs.
 */
export function registerBackupHandlers(): void {
  // The backup domain has no channels yet.
}
