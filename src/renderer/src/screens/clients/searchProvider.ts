/**
 * Clients in Go to… (Ctrl+K): names, codes, company numbers and other
 * names. Owned by the clients domain, which fills in search() with its
 * clients search channel; until then it finds nothing.
 */
import type { SearchProvider } from '@renderer/navigation/searchProviders'

export const clientsSearchProvider: SearchProvider = {
  id: 'clients',
  heading: 'Clients',
  minQueryLength: 1,
  search: () => []
}
