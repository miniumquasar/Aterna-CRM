/**
 * The client file’s References tab. Owned by the references domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'
import type { ClientFileTabProps } from '@renderer/screens/clients/clientFileTabs'

export default function ClientReferencesTab(_props: ClientFileTabProps): JSX.Element {
  return <EmptyState icon={Construction} title="This tab is being built" body="This client’s other references and agent authorisations will be listed here." />
}
