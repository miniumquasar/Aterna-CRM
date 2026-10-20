/**
 * Go to… (Ctrl+K) asks each provider in turn. A domain that wants its
 * records in Go to… fills its own provider (pre-wired here), e.g.
 * screens/clients/searchProvider.ts for clients and their other names.
 */
import type { LucideIcon } from 'lucide-react'
import type { Role } from '@shared/domain/roles'
import { clientsSearchProvider } from '../screens/clients/searchProvider'
import { canOpen } from './nav'
import { ROUTES, type RouteId, type RouteParams } from './routes'

export interface SearchContext {
  role: Role
  /** Whether this is a development build (development-only routes appear). */
  dev: boolean
  navigate: (id: RouteId, params?: RouteParams) => void
}

export interface SearchResult {
  /** Unique across all providers: '<provider>:<id>'. */
  id: string
  title: string
  subtitle?: string
  icon?: LucideIcon
  /** A short tag at the right ('CL0042', 'Screen'). */
  hint?: string
  perform(ctx: SearchContext): void
}

export interface SearchProvider {
  id: string
  /** The heading over its results. */
  heading: string
  /** Characters needed before it is asked (0: it answers an empty query too). */
  minQueryLength: number
  search(query: string, ctx: SearchContext): readonly SearchResult[] | Promise<readonly SearchResult[]>
}

function score(text: string, query: string): number {
  const t = text.toLowerCase()
  const q = query.toLowerCase().trim()
  if (!q) return 1
  if (t.startsWith(q)) return 3
  if (t.split(/[\s&,-]+/).some((w) => w.startsWith(q))) return 2
  return t.includes(q) ? 1 : 0
}

export const routesSearchProvider: SearchProvider = {
  id: 'screens',
  heading: 'Screens',
  minQueryLength: 0,
  search(query, ctx) {
    return ROUTES.filter((r) => canOpen(r, ctx.role, ctx.dev) && !r.requiredParams?.length)
      .map((r) => ({ r, s: Math.max(score(r.title, query), ...(r.keywords ?? []).map((k) => score(k, query) - 0.5)) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, query.trim() ? 8 : ROUTES.length)
      .map(({ r }) => ({
        id: `screens:${r.id}`,
        title: r.title,
        subtitle: r.description,
        icon: r.icon,
        hint: 'Screen',
        perform: (c: SearchContext) => c.navigate(r.id)
      }))
  }
}

/** Asked in this order; results show in this order. */
export const SEARCH_PROVIDERS: readonly SearchProvider[] = [clientsSearchProvider, routesSearchProvider]
