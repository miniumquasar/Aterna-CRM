/**
 * Ranking for the go-to palette (⌘K / Ctrl+K): screens by name and the words
 * people use for them, clients by name, code, trading name or company number.
 * Plain functions, tested in tests/renderer/navigation.test.ts.
 */
import { isNoLongerClient } from '@shared/client-status'
import type { NavTarget } from './nav'

export interface ClientLike {
  id: number
  ref: string | null
  client_name: string
  business_name?: string | null
  reg_no?: string | null
  /** Other names on the Client file, joined with " | ". */
  other_names?: string | null
  /** For marking clients the practice no longer acts for (src/shared/client-status.ts). */
  status?: string | null
  company_status?: string | null
}

const norm = (s: string | null | undefined): string => (s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim()

/**
 * How well `text` matches `query` (0 = not at all): the whole text, its start,
 * the start of one of its words, then anywhere in it. Every word of the query
 * must match somewhere.
 */
export function matchScore(text: string, query: string): number {
  const t = norm(text)
  const q = norm(query)
  if (!q) return 1
  if (!t) return 0
  if (t === q) return 100
  if (t.startsWith(q)) return 80
  const words = q.split(/\s+/).filter(Boolean)
  let score = 0
  for (const w of words) {
    if (new RegExp(`(^|[\\s/(›,.&-])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) score += 20
    else if (t.includes(w)) score += 8
    else return 0
  }
  return score
}

export function rankScreens(targets: readonly NavTarget[], query: string, limit = 6): NavTarget[] {
  if (!norm(query)) return targets.slice(0, limit)
  return targets
    .map((t) => ({ t, s: Math.max(matchScore(t.title, query) * 2, matchScore(t.words, query)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.t.title.localeCompare(b.t.title))
    .slice(0, limit)
    .map((x) => x.t)
}

export function rankClients<C extends ClientLike>(clients: readonly C[], query: string, limit = 8): C[] {
  const q = norm(query)
  if (!q) return []
  return clients
    .map((c) => {
      const byName = matchScore(c.client_name, q) * 2
      const byRef = c.ref && norm(c.ref) === q ? 300 : c.ref && norm(c.ref).startsWith(q) ? 150 : 0
      const byTrading = matchScore(c.business_name ?? '', q)
      const byOtherName = Math.max(0, ...(c.other_names ?? '').split(' | ').map((n) => matchScore(n, q)))
      const byNumber = c.reg_no && norm(c.reg_no).replace(/\s+/g, '') === q.replace(/\s+/g, '') ? 250 : 0
      return { c, s: Math.max(byName, byRef, byTrading, byOtherName, byNumber) }
    })
    .filter((x) => x.s > 0)
    // Every client can be found; between equally good matches, a current client comes first.
    .sort((a, b) => b.s - a.s || Number(isNoLongerClient(a.c)) - Number(isNoLongerClient(b.c)) || a.c.client_name.localeCompare(b.c.client_name))
    .slice(0, limit)
    .map((x) => x.c)
}
