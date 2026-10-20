/**
 * Settings → People. Owned by the auth domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'

export default function PeopleSection(): JSX.Element {
  return <EmptyState size="sm" icon={Construction} title="This section is being built" body="Invite people, change roles, turn access off, unlock and reset passwords." />
}
