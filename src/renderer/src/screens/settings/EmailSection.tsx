/**
 * Settings → Email. Owned by the comms domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'

export default function EmailSection(): JSX.Element {
  return <EmptyState size="sm" icon={Construction} title="This section is being built" body="Email opens in this PC’s mail app; SMTP, Microsoft 365 and Resend can be set up here instead." />
}
