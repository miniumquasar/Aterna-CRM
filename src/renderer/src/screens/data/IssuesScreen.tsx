/**
 * Data issues. Owned by the aml domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, TriangleAlert } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function IssuesScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Data issues" subtitle="Things in the data that need a look" icon={TriangleAlert} />
      <EmptyState icon={Construction} title="This screen is being built" body="Data issues will list references that fail their check, import findings and other problems, with filters, severity and the record each concerns." />
    </>
  )
}
