/**
 * Settings → Assistant. Owned by the integrations domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'

export default function AssistantSection(): JSX.Element {
  return <EmptyState size="sm" icon={Construction} title="This section is being built" body="The local assistant: whether Ollama is installed and running, and its model." />
}
