/**
 * Settings → Import. Owned by the import domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'

export default function ImportSection(): JSX.Element {
  return <EmptyState size="sm" icon={Construction} title="This section is being built" body="Bring in the master workbook, and undo the latest import." />
}
