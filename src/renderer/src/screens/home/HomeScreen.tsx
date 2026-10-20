/**
 * Home. Owned by the insights domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, House } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function HomeScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Home" subtitle="Today’s priorities, figures and activity" icon={House} />
      <EmptyState icon={Construction} title="This screen is being built" body="Home will show your priorities for today (overdue and due this week, yours first), the practice’s real figures, deadlines by month, your tasks and recent activity." />
    </>
  )
}
