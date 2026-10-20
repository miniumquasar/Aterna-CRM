/**
 * Activity. Owned by the insights domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, Activity } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function ActivityScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Activity" subtitle="Today’s changes, Companies House news and notifications" icon={Activity} />
      <EmptyState icon={Construction} title="This screen is being built" body="Activity will show today’s imports, edits, filings and deadlines, Companies House changes for your clients, system health and your notifications." />
    </>
  )
}
