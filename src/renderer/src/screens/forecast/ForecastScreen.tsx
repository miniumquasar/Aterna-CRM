/**
 * Forecast. Owned by the analytics domain (docs/DOMAINS.md), which replaces this placeholder.
 * Keep the assistant's briefing (integrations) on the screen.
 */
import { Construction, TrendingUp } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'
import { AssistantBriefing } from '@renderer/screens/assistant/AssistantBriefing'

export default function ForecastScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Forecast" subtitle="Deadlines, work and money in the months ahead" icon={TrendingUp} />
      <AssistantBriefing subject={{ kind: 'forecast' }} />
      <EmptyState icon={Construction} title="This screen is being built" body="The forecast will show deadlines by month, kind of work and person, billing expected from service fees, and money received and falling due." />
    </>
  )
}
