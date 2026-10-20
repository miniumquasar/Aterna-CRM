/**
 * Practice details. Owned by the references domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, Building } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function PracticeScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Practice details" subtitle="The firm’s own references and renewals" icon={Building} />
      <EmptyState icon={Construction} title="This screen is being built" body="Practice details will hold the firm’s own identifiers — agent codes, AML supervisor, ICO, professional body, PI insurance and more — with renewal countdowns." />
    </>
  )
}
