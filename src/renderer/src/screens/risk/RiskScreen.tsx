/**
 * Risk. Owned by the analytics domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction, ShieldAlert } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/ui'

export default function RiskScreen(): JSX.Element {
  return (
    <>
      <PageHeader title="Risk" subtitle="Clients ranked by risk, with the reasons" icon={ShieldAlert} />
      <EmptyState icon={Construction} title="This screen is being built" body="Risk will score every client out of 100 from reasons that can each be checked and opened: overdue deadlines, open issues, missing AML or engagement letters, authorisations and Companies House red flags." />
    </>
  )
}
