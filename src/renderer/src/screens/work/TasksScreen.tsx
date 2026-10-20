/**
 * Tasks. Owned by the work domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, ListChecks } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function TasksScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Tasks" subtitle="Work to do, by person and due date" icon={ListChecks} />
      <EmptyState icon={Construction} title="This screen is being built" body="Tasks will list work by person, due date and priority, each linked to its client and deadline." />
    </>
  )
}
