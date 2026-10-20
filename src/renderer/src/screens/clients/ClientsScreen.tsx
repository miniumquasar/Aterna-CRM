/**
 * Clients. Owned by the clients domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, Users } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function ClientsScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Clients" subtitle="Every client, searchable and filterable" icon={Users} />
      <EmptyState icon={Construction} title="This screen is being built" body="The client list will search names, trading names, other names, codes and company numbers, with filters by type, status and who looks after each client." />
    </>
  )
}
