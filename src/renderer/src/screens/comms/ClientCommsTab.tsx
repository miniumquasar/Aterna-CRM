/**
 * The client file’s Communications tab. Owned by the comms domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'
import type { ClientFileTabProps } from '@renderer/screens/clients/clientFileTabs'

export default function ClientCommsTab(_props: ClientFileTabProps): JSX.Element {
  return <EmptyState icon={Construction} title="This tab is being built" body="This client’s emails, messages, calls, meetings and notes will appear here as one conversation." />
}
