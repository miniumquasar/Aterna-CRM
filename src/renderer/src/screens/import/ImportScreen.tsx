/**
 * Import. Owned by the import domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, FileSpreadsheet } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function ImportScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Import" subtitle="Bring in the master workbook" icon={FileSpreadsheet} />
      <EmptyState icon={Construction} title="This screen is being built" body="Import will read the master workbook, show a dry run with counts, matches and issues, and bring in exactly what was previewed." />
    </>
  )
}
