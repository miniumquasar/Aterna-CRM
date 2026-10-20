/**
 * The signed-in app: the colour field, the title bar, and two glass panels
 * floating over it — the sidebar and the main panel with the banners and
 * the current screen — with Go to… on Ctrl+K and back / forward on
 * Alt+← / Alt+→ and the mouse's side buttons. The main panel carries the
 * pointer highlight (Full effects only).
 */
import { Suspense, useEffect, useRef, useState } from 'react'
import type { Actor } from '@shared/domain/roles'
import { useHotkey } from '../../lib/hooks'
import { canOpen } from '../../navigation/nav'
import { ROUTE_BY_ID } from '../../navigation/routes'
import { installHashSync, recallRoute, rememberRoute, useRoute, useRouter } from '../../stores/router'
import { LicenceBanner } from '../licence/LicenceBanner'
import { RecoveryPrompt } from '../recovery/RecoveryPrompt'
import { IdleWarning } from '../session/IdleWarning'
import { DatabaseStatusBanner } from '../system/DatabaseStatusBanner'
import { EmptyState, Loading, dialogOpen, useSpecular } from '../ui'
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
  const panel = useRef<HTMLElement>(null)
  const lit = useSpecular(panel)

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
    <div className="relative flex h-full flex-col" data-app-shell>
      <div className="app-backdrop" aria-hidden />
      <div className="app-grain" aria-hidden />
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-12 focus:z-50 focus:rounded-xl focus:bg-surface-raised focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-fg focus:shadow-raised"
      >
        Skip to the screen
      </a>
      <TitleBar firmName={firmName} onOpenPalette={() => setPaletteOpen(true)} />
      <div className="relative z-10 flex min-h-0 flex-1 gap-3 px-3 pb-3">
        <Sidebar actor={actor} />
        <main ref={panel} id="main" tabIndex={-1} className="glass-panel min-w-0 flex-1 overflow-hidden rounded-panel outline-none" data-route={location.id} data-print-flow>
          {lit && <span className="specular" aria-hidden />}
          <div className="h-full overflow-y-auto [scrollbar-gutter:stable]" data-print-flow>
            <div className="mx-auto w-full max-w-[1360px] px-8 pb-10 pt-7" data-print-flow>
              <div className="mb-4 flex flex-col gap-3 empty:hidden">
                <LicenceBanner />
                <DatabaseStatusBanner />
                <RecoveryPrompt />
              </div>
              <ScreenBoundary resetKey={routeKey}>
                <Suspense fallback={<Loading label={`Opening ${route.title}…`} />}>
                  {allowed ? (
                    // Keyed by route only: a change of params (a tab, a section, another client) keeps the screen mounted and focus in place.
                    <Screen key={location.id} params={location.params} />
                  ) : (
                    <EmptyState title={`${route.title} isn’t open to you`} body="Ask a partner if you need it." />
                  )}
                </Suspense>
              </ScreenBoundary>
            </div>
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} role={actor.role} />
      <IdleWarning />
    </div>
  )
}
