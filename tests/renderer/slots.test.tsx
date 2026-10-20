// @vitest-environment jsdom
/**
 * Every pre-wired slot loads and draws: each route's screen, settings
 * section, client-file tab and setup step (each lazily loaded file must
 * default-export a component), plus the shell's banners and the splash.
 * The smoke test drives the real app; this catches a slot it never opens.
 */
import { Suspense, createElement, type ComponentType, type LazyExoticComponent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AuthStatus } from '@shared/contracts/auth'
import { isUnlockPage } from '@renderer/App'
import { ROUTES } from '@renderer/navigation/routes'
import { SEARCH_PROVIDERS } from '@renderer/navigation/searchProviders'
import { CLIENT_FILE_TABS } from '@renderer/screens/clients/clientFileTabs'
import { SETTINGS_SECTIONS } from '@renderer/screens/settings/sections'
import { SETUP_STEPS } from '@renderer/screens/setup/steps'
import { ThemeProvider } from '@renderer/theme'

// jsdom has no matchMedia; Electron always does.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false
})) as unknown as typeof window.matchMedia

afterEach(() => cleanup())

const LOADING = 'slot-loading'

async function draws<P extends object>(Component: LazyExoticComponent<ComponentType<P>>, props: P): Promise<HTMLElement> {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { container } = render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <Suspense fallback={<p>{LOADING}</p>}>
          {createElement(Component as unknown as ComponentType<P>, props)}
        </Suspense>
      </ThemeProvider>
    </QueryClientProvider>
  )
  await waitFor(() => expect(container.textContent).not.toContain(LOADING))
  expect(errors).not.toHaveBeenCalled()
  expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0)
  return container
}

const status: AuthStatus = { setupNeeded: false, setupComplete: false, signedIn: true, actor: { id: 1, username: 'pat', name: 'Pat', role: 'partner' }, firmName: 'Test LLP' }

describe('pre-wired slots', () => {
  it.each(ROUTES.map((r) => [r.id, r] as const))('route %s draws its screen with an h1', async (_id, route) => {
    const container = await draws(route.screen, { params: route.requiredParams?.length ? { clientId: 1 } : {} })
    expect(container.querySelector('h1')).not.toBeNull()
  })

  it.each(SETTINGS_SECTIONS.map((s) => [s.id, s] as const))('settings section %s draws', async (_id, section) => {
    await draws(section.component, {})
  })

  it.each(CLIENT_FILE_TABS.map((t) => [t.id, t] as const))('client file tab %s draws', async (_id, tab) => {
    await draws(tab.component, { clientId: 1 })
  })

  it.each(SETUP_STEPS.map((s) => [s.id, s] as const))('setup step %s draws', async (_id, step) => {
    await draws(step.component, { status, draft: { firmName: 'Test LLP' }, updateDraft: () => undefined, next: () => undefined, back: () => undefined, isFirst: false })
  })

  it('declares each settings section, tab, step and Go to… provider once', () => {
    for (const ids of [SETTINGS_SECTIONS.map((s) => s.id), CLIENT_FILE_TABS.map((t) => t.id), SETUP_STEPS.map((s) => s.id), SEARCH_PROVIDERS.map((p) => p.id)]) {
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('opens the unlock page only at #/unlock', () => {
    expect(isUnlockPage('#/unlock')).toBe(true)
    expect(isUnlockPage('#/unlock?problem=missing_key')).toBe(true)
    expect(isUnlockPage('#/unlocked')).toBe(false)
    expect(isUnlockPage('#/home')).toBe(false)
    expect(isUnlockPage('')).toBe(false)
  })
})
