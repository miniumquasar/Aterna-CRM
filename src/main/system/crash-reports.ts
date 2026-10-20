/**
 * Crash reports, saved on this PC only (never uploaded). Owned by the backup
 * domain, which replaces these placeholders; keep their signatures.
 *
 *  startCrashReports   start-up step 2 calls it once the data folder exists:
 *                      e.g. app.setPath('crashDumps', …) and
 *                      crashReporter.start({ uploadToServer: false }), and
 *                      handlers for the main process's uncaught errors.
 *  recordCrash         the main window calls it when its page's process
 *                      stops unexpectedly (it is then reloaded).
 */
import type { Logger } from '../app/logger'
import type { DataPaths } from '../app/paths'

export function startCrashReports(ctx: { paths: DataPaths; log: Logger }): void {
  ctx.log.info('Crash reports aren’t set up in this build; problems are written to the app’s log.')
}

export function recordCrash(kind: 'page', detail: string, log: Logger): void {
  log.error(`Crash (${kind}): ${detail}`)
}
