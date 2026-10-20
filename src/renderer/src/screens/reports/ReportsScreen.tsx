/**
 * Reports. Owned by the analytics domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, ChartColumn } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function ReportsScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Reports" subtitle="The practice report, ready to export" icon={ChartColumn} />
      <EmptyState icon={Construction} title="This screen is being built" body="Reports will produce the practice report with real figures, exported as a PDF that names the licensed firm." />
    </>
  )
}
