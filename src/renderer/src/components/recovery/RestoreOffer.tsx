/**
 * Shown in the first-run wizard while nobody can sign in yet: restore the
 * practice from a backup instead (a new PC, with the key typed from the
 * recovery sheet). Owned by the backup domain, which fills it in; the wizard
 * already renders it. Render null when there is nothing to offer.
 */
export function RestoreOffer(): JSX.Element | null {
  return null
}
