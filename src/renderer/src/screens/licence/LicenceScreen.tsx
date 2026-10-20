/**
 * Licence. Owned by the licence domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, KeyRound } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function LicenceScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Licence" subtitle="The licence, its validity and key entry" icon={KeyRound} />
      <EmptyState icon={Construction} title="This screen is being built" body="The licence screen will show the licence’s status and validity date, take a new key, and list the keys entered on this PC." />
    </>
  )
}
