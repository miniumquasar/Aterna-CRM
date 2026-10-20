/**
 * Work in progress. Owned by the work domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, Hourglass } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function WipScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Work in progress" subtitle="Time and work not yet billed" icon={Hourglass} />
      <EmptyState icon={Construction} title="This screen is being built" body="Work in progress will record time and work by client, with its rate and value, ready to bill." />
    </>
  )
}
