/**
 * The licence gate the rest of the app asks. The IPC registry calls
 * isReadOnly() for every write; the title bar, About, reports and export
 * file names use licenceHolder().
 *
 * Owned by the licence domain, which replaces this file with the real
 * policy (trial, keys, 3 days' grace, then read-only). Keep both exports and
 * their meaning.
 */

/** True once the licence (or trial) has lapsed past its grace period. */
export function isReadOnly(): boolean {
  return false
}

/** The firm the licence names, or null on the trial. */
export function licenceHolder(): string | null {
  return null
}
