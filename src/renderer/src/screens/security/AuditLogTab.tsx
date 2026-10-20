/**
 * The Audit log tab. Owned by the aml domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'

export default function AuditLogTab(): JSX.Element {
  return <EmptyState icon={Construction} title="This tab is being built" body="The audit log will be browsable and filterable by person, action, record and date, with changed fields named in words, a CSV export and the hash-chain check." />
}
