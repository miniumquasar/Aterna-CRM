/**
 * Forecast. Owned by the analytics domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, TrendingUp } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function ForecastScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Forecast" subtitle="Deadlines, work and money in the months ahead" icon={TrendingUp} />
      <EmptyState icon={Construction} title="This screen is being built" body="The forecast will show deadlines by month, kind of work and person, billing expected from service fees, and money received and falling due." />
    </>
  )
}
