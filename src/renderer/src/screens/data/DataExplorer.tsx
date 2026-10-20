/**
 * Data explorer. Owned by the import domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, Database } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function DataExplorer(): JSX.Element {
  return (
    <>
      <PageHeader title="Data explorer" subtitle="Every register, searchable and sortable" icon={Database} />
      <EmptyState icon={Construction} title="This screen is being built" body="The data explorer will show every register by domain, searchable and sortable." />
    </>
  )
}
