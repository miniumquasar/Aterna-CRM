/**
 * Communications. Owned by the comms domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, MessagesSquare } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function CommunicationsScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Communications" subtitle="Every client conversation in one place" icon={MessagesSquare} />
      <EmptyState icon={Construction} title="This screen is being built" body="Communications will show each client’s emails, WhatsApp messages, calls, meetings and notes as one conversation, with follow-ups and templates." />
    </>
  )
}
