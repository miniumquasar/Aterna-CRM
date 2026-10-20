/**
 * The AML tab. Owned by the aml domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'

export default function AmlTab(): JSX.Element {
  return <EmptyState icon={Construction} title="This tab is being built" body="AML checks will record customer due diligence, risk level, ID evidence and review dates for every client, kept five years after the relationship ends." />
}
