/**
 * Onboarding gaps. Owned by the compliance domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, ClipboardList } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function OnboardingGapsScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Onboarding gaps" subtitle="What each client still needs to provide" icon={ClipboardList} />
      <EmptyState icon={Construction} title="This screen is being built" body="Onboarding gaps will list what each current client still needs, by client type and service, with counts per requirement." />
    </>
  )
}
