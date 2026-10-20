/**
 * Settings → Companies House. Owned by the integrations domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'

export default function CompaniesHouseSection(): JSX.Element {
  return <EmptyState size="sm" icon={Construction} title="This section is being built" body="The firm’s Companies House API key, the daily check and the streaming key." />
}
