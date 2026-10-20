/**
 * What the auth domain offers the other domains' main-process code:
 *
 *   requireRecentReauth(ctx, 'print the recovery sheet')
 *       In a protected handler: refuses unless the person on this window
 *       confirmed their password (auth.reauth, or signing in) in the last
 *       REAUTH_MINUTES. The refusal is { code: 'forbidden', field: 'reauth' };
 *       the renderer's ensureRecentReauth() / withReauth() (components/session/reauth.ts)
 *       asks for the password and tries again.
 *
 *   registerPersonLinkCheck({ id, count, describe })
 *       Records under a person (tasks, time, invoices…) that stop them being
 *       removed from the practice. Call it from your registerXxxHandlers().
 *
 *   registerSetupProbe('recovery' | 'vault' | 'licence' | 'import', (db) => done)
 *       Tells the first-run wizard whether your step's work is done.
 *
 *   activePeople(db)
 *       Everyone who can sign in, by name ({ id, name, role }).
 */
export { requireRecentReauth, reauthUntil, type ReauthContext } from './reauth'
export { registerPersonLinkCheck, personLinks, type PersonLinkCheck } from './person-links'
export { registerSetupProbe, type SetupProbe } from './setup-state'
export { directory as activePeople } from './people'
