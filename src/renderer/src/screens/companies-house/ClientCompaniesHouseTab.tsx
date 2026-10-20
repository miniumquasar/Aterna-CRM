/**
 * The client file’s Companies House tab: the company’s profile, officers, PSCs and filing history. Owned by the integrations domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'
import type { ClientFileTabProps } from '@renderer/screens/clients/clientFileTabs'

export default function ClientCompaniesHouseTab(_props: ClientFileTabProps): JSX.Element {
  return <EmptyState icon={Construction} title="This tab is being built" body="The company’s Companies House profile, officers, people with significant control and filing history will show here." />
}
