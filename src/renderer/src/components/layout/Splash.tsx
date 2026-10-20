/**
 * The short splash as the app opens: under a second, skippable (a click or
 * any key), and none at all under reduced motion. Owned by the design
 * domain, which fills it in; App.tsx already renders it over everything
 * else. Render null once it is done (and from the start when there is none).
 */
export function Splash(): JSX.Element | null {
  return null
}
