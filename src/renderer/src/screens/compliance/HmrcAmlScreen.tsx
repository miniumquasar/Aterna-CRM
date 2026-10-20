/**
 * HMRC & AML: one screen, two tabs. The HMRC tab is the compliance
 * domain's; the AML tab (AmlTab.tsx) is the aml domain's.
 */
import { Suspense, lazy } from 'react'
import { Landmark, ShieldCheck } from 'lucide-react'
import { Loading, PageHeader, Tabs } from '@renderer/components/ui'
import type { ScreenProps } from '@renderer/navigation/routes'
import { navigate } from '@renderer/stores/router'

const HmrcTab = lazy(() => import('./HmrcTab'))
const AmlTab = lazy(() => import('./AmlTab'))

const TABS = [
  { id: 'hmrc', label: 'HMRC', icon: Landmark },
  { id: 'aml', label: 'AML', icon: ShieldCheck }
] as const

export default function HmrcAmlScreen({ params }: ScreenProps): JSX.Element {
  const tab = params.tab === 'aml' ? 'aml' : 'hmrc'
  return (
    <>
      <PageHeader title="HMRC & AML" subtitle="HMRC submissions and anti-money-laundering checks" icon={Landmark} />
      <Tabs label="HMRC and AML" tabs={TABS} value={tab} onChange={(id) => navigate('hmrcAml', { tab: id }, { replace: true })}>
        <Suspense fallback={<Loading />}>{tab === 'aml' ? <AmlTab /> : <HmrcTab />}</Suspense>
      </Tabs>
    </>
  )
}
