/**
 * Security: an overview of what protects the practice's data, and the
 * audit log. Owned by the analytics domain; the Audit log tab
 * (AuditLogTab.tsx) is the aml domain's.
 */
import { Suspense, lazy } from 'react'
import { Construction, LayoutDashboard, ScrollText, ShieldCheck } from 'lucide-react'
import { EmptyState, Loading, PageHeader, Tabs } from '@renderer/components/ui'
import type { ScreenProps } from '@renderer/navigation/routes'
import { navigate } from '@renderer/stores/router'

const AuditLogTab = lazy(() => import('./AuditLogTab'))

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'audit', label: 'Audit log', icon: ScrollText }
] as const

export default function SecurityScreen({ params }: ScreenProps): JSX.Element {
  const tab = params.tab === 'audit' ? 'audit' : 'overview'
  return (
    <>
      <PageHeader title="Security" subtitle="Database, licence, backups, sign-ins and the audit log" icon={ShieldCheck} />
      <Tabs label="Security" tabs={TABS} value={tab} onChange={(id) => navigate('security', { tab: id }, { replace: true })}>
        <Suspense fallback={<Loading />}>
          {tab === 'audit' ? (
            <AuditLogTab />
          ) : (
            <EmptyState
              icon={Construction}
              title="This tab is being built"
              body="The overview will say first what needs a look, then show the database, licence, backups, recovery sheet, vault and audit log, who can sign in and the sign-in history."
            />
          )}
        </Suspense>
      </Tabs>
    </>
  )
}
