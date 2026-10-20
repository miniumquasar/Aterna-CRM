/**
 * Deadlines. Owned by the compliance domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, CalendarClock } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function DeadlinesScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Deadlines" subtitle="Every open statutory deadline, overdue first" icon={CalendarClock} />
      <EmptyState icon={Construction} title="This screen is being built" body="Deadlines will list every open statutory deadline — accounts, CT600, VAT, confirmation statements, Self Assessment, payroll — with Mark filed and Not needed." />
    </>
  )
}
