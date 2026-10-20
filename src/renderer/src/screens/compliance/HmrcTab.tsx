/**
 * The HMRC tab. Owned by the compliance domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'

export default function HmrcTab(): JSX.Element {
  return <EmptyState icon={Construction} title="This tab is being built" body="The HMRC submissions log will list each return filed, with its reference, and can close the deadline it files." />
}
