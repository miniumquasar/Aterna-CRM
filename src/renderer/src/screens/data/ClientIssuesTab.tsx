/**
 * The client file’s Issues tab. Owned by the aml domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'
import type { ClientFileTabProps } from '@renderer/screens/clients/clientFileTabs'

export default function ClientIssuesTab(_props: ClientFileTabProps): JSX.Element {
  return <EmptyState icon={Construction} title="This tab is being built" body="Data issues about this client will be listed here." />
}
