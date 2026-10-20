/**
 * Calendar. Owned by the insights domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, CalendarDays } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function CalendarScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Calendar" subtitle="Deadlines and tasks by month and week" icon={CalendarDays} />
      <EmptyState icon={Construction} title="This screen is being built" body="The calendar will show every open deadline and task by month and by week." />
    </>
  )
}
