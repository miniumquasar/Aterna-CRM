/**
 * The signed-in app: backdrop, title bar, sidebar, banners and the current
 * screen, with Go to… on Ctrl+K and back / forward on Alt+← / Alt+→ and the
 * mouse's side buttons.
 */
import { Suspense, useEffect, useState } from 'react'
import type { Actor } from '@shared/domain/roles'
import { useHotkey } from '../../lib/hooks'
import { canOpen } from '../../navigation/nav'
import { ROUTE_BY_ID } from '../../navigation/routes'
import { installHashSync, recallRoute, rememberRoute, useRoute, useRouter } from '../../stores/router'
import { LicenceBanner } from '../licence/LicenceBanner'
import { RecoveryPrompt } from '../recovery/RecoveryPrompt'
import { IdleWarning } from '../session/IdleWarning'
import { DatabaseStatusBanner } from '../system/DatabaseStatusBanner'
import { EmptyState, Loading, dialogOpen } from '../ui'
import { CommandPalette } from './CommandPalette'
import { ScreenBoundary } from './ScreenBoundary'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'

export interface AppShellProps {
  actor: Actor
  firmName: string | null
}

export function AppShell({ actor, firmName }: AppShellProps): JSX.Element {
  const location = useRoute()
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Where this person was last time, unless the address already names a route.
  useEffect(() => {
    if (!window.location.hash) {
      const last = recallRoute(actor.id)
      if (last) useRouter.getState().navigate(last.id, last.params, { replace: true })
    }
    const stopSync = installHashSync()
    const stopRemember = useRouter.subscribe((s) => rememberRoute(actor.id, s.location))
    return () => {
      stopSync()
      stopRemember()
    }
  }, [actor.id])

  useHotkey('k', (e) => {
    e.preventDefault()
    setPaletteOpen((open) => !open)
  }, { mod: true })
  useHotkey('ArrowLeft', (e) => {
    if (dialogOpen()) return
    e.preventDefault()
    useRouter.getState().goBack()
  }, { alt: true })
  useHotkey('ArrowRight', (e) => {
    if (dialogOpen()) return
    e.preventDefault()
    useRouter.getState().goForward()
  }, { alt: true })
  useEffect(() => {
    const onMouse = (e: MouseEvent): void => {
      if (dialogOpen()) return
      if (e.button === 3) useRouter.getState().goBack()
      if (e.button === 4) useRouter.getState().goForward()
    }
    window.addEventListener('mouseup', onMouse)
    return () => window.removeEventListener('mouseup', onMouse)
  }, [])

  const route = ROUTE_BY_ID[location.id]
  const allowed = canOpen(route, actor.role, import.meta.env.DEV)
  const Screen = route.screen
  const routeKey = `${location.id}:${JSON.stringify(location.params)}`

  useEffect(() => {
    document.title = `${route.title} · AETERNA CRM`
  }, [route.title])

  return (
    <div className="relative flex h-full flex-col">
      <div className="app-backdrop" aria-hidden />
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-12 focus:z-50 focus:rounded-lg focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-fg"
      >
        Skip to the screen
      </a>
      <TitleBar firmName={firmName} onOpenPalette={() => setPaletteOpen(true)} />
      <div className="relative z-10 flex min-h-0 flex-1">
        <Sidebar actor={actor} />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto outline-none" data-route={location.id}>
          <div className="mx-auto w-full max-w-[1400px] px-8 py-7">
            <div className="mb-4 flex flex-col gap-3 empty:hidden">
              <LicenceBanner />
              <DatabaseStatusBanner />
              <RecoveryPrompt />
            </div>
            <ScreenBoundary resetKey={routeKey}>
              <Suspense fallback={<Loading label={`Opening ${route.title}…`} />}>
                {allowed ? (
                  <Screen key={routeKey} params={location.params} />
                ) : (
                  <EmptyState title={`${route.title} isn’t open to you`} body="Ask a partner if you need it." />
                )}
              </Suspense>
            </ScreenBoundary>
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} role={actor.role} />
      <IdleWarning />
    </div>
  )
}
