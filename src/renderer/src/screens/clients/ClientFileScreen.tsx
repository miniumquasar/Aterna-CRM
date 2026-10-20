/**
 * The client file: one client's header and its tabs (clientFileTabs.ts).
 * Owned by the clients domain, which adds the header (status, assignee,
 * key references, quick actions) from clients.get.
 */
import { Suspense } from 'react'
import { ArrowLeft, FolderOpen } from 'lucide-react'
import { roleAtLeast } from '@shared/domain/roles'
import { EmptyState, GlassButton, Loading, PageHeader, Tabs } from '@renderer/components/ui'
import type { ScreenProps } from '@renderer/navigation/routes'
import { navigate } from '@renderer/stores/router'
import { useActor } from '@renderer/stores/session'
import { CLIENT_FILE_TABS } from './clientFileTabs'

export default function ClientFileScreen({ params }: ScreenProps): JSX.Element {
  const actor = useActor()
  const clientId = typeof params.clientId === 'number' && params.clientId > 0 ? params.clientId : null
  const tabs = CLIENT_FILE_TABS.filter((t) => roleAtLeast(actor?.role, t.minRole))
  const current = tabs.find((t) => t.id === params.tab) ?? tabs[0]
  const Tab = current.component
  const back = <GlassButton variant="ghost" icon={ArrowLeft} onClick={() => navigate('clients')}>All clients</GlassButton>

  if (clientId === null) {
    return (
      <>
        <PageHeader title="Client file" icon={FolderOpen} actions={back} />
        <EmptyState title="No client chosen" body="Open a client from the client list or Go to… (Ctrl+K)." action={back} />
      </>
    )
  }
  return (
    <>
      <PageHeader title="Client file" eyebrow={`Client ${clientId}`} icon={FolderOpen} actions={back} />
      <Tabs
        label="Client file"
        tabs={tabs.map((t) => ({ id: t.id, label: t.title, icon: t.icon }))}
        value={current.id}
        onChange={(id) => navigate('clientFile', { clientId, tab: id }, { replace: true })}
      >
        <Suspense fallback={<Loading />}>
          <Tab clientId={clientId} />
        </Suspense>
      </Tabs>
    </>
  )
}
