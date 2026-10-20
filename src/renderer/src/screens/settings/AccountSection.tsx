/**
 * Settings → Your sign-in: change your own password (everyone). Owned by the auth domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'

export default function AccountSection(): JSX.Element {
  return <EmptyState size="sm" icon={Construction} title="This section is being built" body="Change your password here, with your current one." />
}
