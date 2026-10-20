/**
 * Settings → Notifications. Owned by the insights domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'

export default function NotificationsSection(): JSX.Element {
  return <EmptyState size="sm" icon={Construction} title="This section is being built" body="Which notifications you get, and desktop notifications." />
}
