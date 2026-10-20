/**
 * The client file’s Registers tab. Owned by the clients domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'
import type { ClientFileTabProps } from '@renderer/screens/clients/clientFileTabs'

export default function RegistersTab(_props: ClientFileTabProps): JSX.Element {
  return <EmptyState icon={Construction} title="This tab is being built" body="Registers will hold partners, members and trustees, payroll schemes, workplace pensions, Self Assessment, linked clients and other names." />
}
