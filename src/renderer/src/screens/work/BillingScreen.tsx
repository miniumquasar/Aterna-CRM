/**
 * Billing. Owned by the work domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, Receipt } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function BillingScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Billing" subtitle="Invoices, receipts and what is owed" icon={Receipt} />
      <EmptyState icon={Construction} title="This screen is being built" body="Billing will hold invoices (numbered automatically), receipts and the aged receivables summary." />
    </>
  )
}
