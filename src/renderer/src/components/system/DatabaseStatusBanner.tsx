/**
 * The database status banner: locked, not saving, and notices from start-up.
 * Owned by the backup domain, which fills it in; the app shell already
 * renders it. Render null when there is nothing to say.
 */
export function DatabaseStatusBanner(): JSX.Element | null {
  return null
}
