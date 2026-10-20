/**
 * Deadlines in Go to… (a client’s name or a kind of return finds its open
 * deadlines). Owned by the compliance domain, which fills in search(); until then it finds nothing.
 */
import type { SearchProvider } from '@renderer/navigation/searchProviders'

export const complianceSearchProvider: SearchProvider = {
  id: 'deadlines',
  heading: 'Deadlines',
  minQueryLength: 2,
  search: () => []
}
