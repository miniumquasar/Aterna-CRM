/**
 * Assistant. Owned by the integrations domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, Sparkles } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function AssistantScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Assistant" subtitle="The local assistant, on this PC" icon={Sparkles} />
      <EmptyState icon={Construction} title="This screen is being built" body="The assistant will run on this PC through Ollama, check it is installed and has its model, and answer questions with look-ups into the practice’s records." />
    </>
  )
}
