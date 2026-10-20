/**
 * Settings → Backups. Owned by the backup domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'

export default function BackupsSection(): JSX.Element {
  return <EmptyState size="sm" icon={Construction} title="This section is being built" body="Automatic daily backups, the backup folder, Test and restore, and the recovery sheet." />
}
