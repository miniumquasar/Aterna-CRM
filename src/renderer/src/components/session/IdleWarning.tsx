/**
 * The idle warning: a minute before the idle sign-out, with Stay signed in.
 * Owned by the auth domain, which fills it in; the app shell already
 * renders it. Render null when there is nothing to say.
 */
export function IdleWarning(): JSX.Element | null {
  return null
}
