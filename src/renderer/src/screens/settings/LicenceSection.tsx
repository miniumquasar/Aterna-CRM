/**
 * Settings → Licence. Owned by the licence domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'

export default function LicenceSection(): JSX.Element {
  return <EmptyState size="sm" icon={Construction} title="This section is being built" body="The licence’s status and key entry." />
}
