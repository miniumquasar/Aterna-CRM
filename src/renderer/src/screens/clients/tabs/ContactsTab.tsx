/**
 * The client file’s Contacts tab. Owned by the clients domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'
import type { ClientFileTabProps } from '@renderer/screens/clients/clientFileTabs'

export default function ContactsTab(_props: ClientFileTabProps): JSX.Element {
  return <EmptyState icon={Construction} title="This tab is being built" body="Contacts will list directors, PSCs, payroll and other contacts, with the primary contact marked." />
}
