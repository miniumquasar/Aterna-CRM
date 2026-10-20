/**
 * How an audit entry is described, the same in the app and in the CSV export.
 */

/**
 * Who an entry says did it, in words: "system" is the app itself; no name at
 * all is an attempt made before anyone signed in (a wrong password, an
 * unknown username).
 */
export const auditWho = (who: string | null): string => (who === 'system' ? 'The app' : who === null || who === '' ? 'Nobody signed in' : who)

