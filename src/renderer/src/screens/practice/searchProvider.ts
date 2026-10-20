/**
 * References in Go to…: whose reference is this? A UTR, VAT number, PAYE or
 * agent reference typed in finds the client (or the practice) it belongs
 * to. Owned by the references domain, which fills in search() with its
 * look-up channel; until then it finds nothing.
 */
import type { SearchProvider } from '@renderer/navigation/searchProviders'

export const referencesSearchProvider: SearchProvider = {
  id: 'references',
  heading: 'References',
  minQueryLength: 2,
  search: () => []
}
