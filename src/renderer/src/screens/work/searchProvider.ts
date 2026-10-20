/**
 * Tasks and invoices in Go to… (an invoice number finds its invoice). Owned by the work domain, which fills in search(); until then it finds nothing.
 */
import type { SearchProvider } from '@renderer/navigation/searchProviders'

export const workSearchProvider: SearchProvider = {
  id: 'work',
  heading: 'Tasks and invoices',
  minQueryLength: 2,
  search: () => []
}
