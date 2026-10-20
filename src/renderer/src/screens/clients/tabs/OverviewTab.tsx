/**
 * The client file’s Overview tab. Owned by the clients domain (docs/DOMAINS.md), which replaces this placeholder.
 * Keep the assistant's briefing (integrations) on it.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'
import { AssistantBriefing } from '@renderer/screens/assistant/AssistantBriefing'
import type { ClientFileTabProps } from '@renderer/screens/clients/clientFileTabs'

export default function OverviewTab({ clientId }: ClientFileTabProps): JSX.Element {
  return (
    <>
      <AssistantBriefing subject={{ kind: 'client', clientId }} />
      <EmptyState icon={Construction} title="This tab is being built" body="The overview will show the client’s key details, references, services and people at a glance." />
    </>
  )
}
