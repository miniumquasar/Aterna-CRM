/**
 * The in-app router: a store, not URLs. navigate('clientFile', { clientId: 42 }),
 * back and forward, and the last route remembered per person on this PC.
 * The current route is mirrored in the address's #hash, so a reload keeps
 * it (and the smoke test can open any route).
 */
import { create } from 'zustand'
import { isRouteId, type RouteId, type RouteParams } from '../navigation/routes'

export interface RouteLocation {
  id: RouteId
  params: RouteParams
}

const HOME: RouteLocation = { id: 'home', params: {} }
const MAX_HISTORY = 50

function same(a: RouteLocation, b: RouteLocation): boolean {
  return a.id === b.id && JSON.stringify(a.params) === JSON.stringify(b.params)
}

export function locationToHash(location: RouteLocation): string {
  const query = new URLSearchParams(Object.entries(location.params).map(([k, v]) => [k, String(v)])).toString()
  return `#/${location.id}${query ? `?${query}` : ''}`
}

export function hashToLocation(hash: string): RouteLocation | null {
  const m = /^#\/([A-Za-z]+)(?:\?(.*))?$/.exec(hash)
  if (!m || !isRouteId(m[1])) return null
  const params: Record<string, string | number> = {}
  for (const [k, v] of new URLSearchParams(m[2] ?? '')) params[k] = /^-?\d+$/.test(v) && v.length < 16 ? Number(v) : v
  return { id: m[1], params }
}

interface RouterState {
  location: RouteLocation
  back: RouteLocation[]
  forward: RouteLocation[]
  navigate(id: RouteId, params?: RouteParams, options?: { replace?: boolean }): void
  goBack(): void
  goForward(): void
  reset(location?: RouteLocation): void
}

function initial(): RouteLocation {
  if (typeof window === 'undefined') return HOME
  return hashToLocation(window.location.hash) ?? HOME
}

export const useRouter = create<RouterState>((set, get) => ({
  location: initial(),
  back: [],
  forward: [],
  navigate(id, params = {}, options = {}) {
    const next: RouteLocation = { id, params }
    const { location, back } = get()
    if (same(location, next)) return
    if (options.replace) set({ location: next })
    else set({ location: next, back: [...back, location].slice(-MAX_HISTORY), forward: [] })
  },
  goBack() {
    const { location, back, forward } = get()
    const previous = back[back.length - 1]
    if (!previous) return
    set({ location: previous, back: back.slice(0, -1), forward: [location, ...forward].slice(0, MAX_HISTORY) })
  },
  goForward() {
    const { location, back, forward } = get()
    const next = forward[0]
    if (!next) return
    set({ location: next, back: [...back, location].slice(-MAX_HISTORY), forward: forward.slice(1) })
  },
  reset(location = HOME) {
    set({ location, back: [], forward: [] })
  }
}))

/** navigate() outside components. */
export function navigate(id: RouteId, params?: RouteParams, options?: { replace?: boolean }): void {
  useRouter.getState().navigate(id, params, options)
}

export function useRoute(): RouteLocation {
  return useRouter((s) => s.location)
}

/** Keeps the #hash and the store in step; returns a function that stops. */
export function installHashSync(): () => void {
  const write = (location: RouteLocation): void => {
    const hash = locationToHash(location)
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash)
  }
  write(useRouter.getState().location)
  const unsubscribe = useRouter.subscribe((s) => write(s.location))
  const onHash = (): void => {
    const found = hashToLocation(window.location.hash)
    if (found) useRouter.getState().navigate(found.id, found.params)
  }
  window.addEventListener('hashchange', onHash)
  return () => {
    unsubscribe()
    window.removeEventListener('hashchange', onHash)
  }
}

const rememberKey = (userId: number): string => `aeterna.lastRoute.${userId}`

/** Saves where the person is, for next time (a convenience; nothing depends on it). */
export function rememberRoute(userId: number, location: RouteLocation): void {
  try {
    window.localStorage.setItem(rememberKey(userId), JSON.stringify(location))
  } catch {
    // Storage may be unavailable.
  }
}

export function recallRoute(userId: number): RouteLocation | null {
  try {
    const raw = window.localStorage.getItem(rememberKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RouteLocation>
    return isRouteId(parsed.id) ? { id: parsed.id, params: parsed.params && typeof parsed.params === 'object' ? parsed.params : {} } : null
  } catch {
    return null
  }
}
