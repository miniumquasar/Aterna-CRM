/**
 * Settings → Firm details. Owned by the auth domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'

export default function FirmSection(): JSX.Element {
  return <EmptyState size="sm" icon={Construction} title="This section is being built" body="The firm’s name, address, contact details, company number, VAT number, UTR and PAYE reference." />
}
