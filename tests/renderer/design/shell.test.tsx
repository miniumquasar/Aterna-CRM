// @vitest-environment jsdom
/**
 * The theme as the app applies it — saved through appearance.set, written
 * to <html> at once (density, effects, transparency, a print theme in Day),
 * cached for the next start — and the shell around it: the splash (short,
 * skippable, none under reduced motion) and the sidebar's folding groups,
 * remembered for each person on this PC.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AeternaBridge } from '@shared/ipc/bridge'
import { DEFAULT_APPEARANCE, normaliseAppearance, type AppearancePrefs } from '@shared/theme/appearance'
import { PALETTES } from '@shared/theme/palettes'
import { hexToChannels } from '@shared/theme/variables'
import { Sidebar } from '@renderer/components/layout/Sidebar'
import { useRouter } from '@renderer/stores/router'
import { ThemeProvider, useTheme } from '@renderer/theme'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

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

function bridge(initial: Partial<AppearancePrefs> = {}): AeternaBridge & { saved: Array<Partial<AppearancePrefs>> } {
  let stored = normaliseAppearance({ ...DEFAULT_APPEARANCE, ...initial })
  const saved: Array<Partial<AppearancePrefs>> = []
  return {
    saved,
    invoke: (async (channel: string, req: unknown) => {
      if (channel === 'appearance.get') return { ok: true, data: stored }
      if (channel === 'appearance.set') {
        saved.push(req as Partial<AppearancePrefs>)
        stored = normaliseAppearance({ ...stored, ...(req as object) })
        return { ok: true, data: stored }
      }
      if (channel === 'auth.signOut') return { ok: true, data: undefined }
      return { ok: false, error: { code: 'unavailable', message: 'Not in this test.' } }
    }) as AeternaBridge['invoke'],
    on: (() => () => undefined) as AeternaBridge['on'],
    info: { platform: 'win32', versions: { app: '1.4.2', electron: '41' } }
  }
}

function withTheme(ui: JSX.Element): JSX.Element {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{ui}</ThemeProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  delete window.aeterna
  const root = document.documentElement
  for (const key of Object.keys(root.dataset)) delete root.dataset[key]
  root.removeAttribute('style')
  document.getElementById('aeterna-print-theme')?.remove()
})

describe('the theme', () => {
  it('saves a change, shows it at once on <html>, prints in Day, and caches it for the next start', async () => {
    const fake = bridge({ mode: 'night' })
    window.aeterna = fake
    let set: (patch: Partial<AppearancePrefs>) => void = () => undefined
    function Grab(): JSX.Element {
      const theme = useTheme()
      set = theme.setPrefs
      return <p>{`${theme.palette.id} ${theme.mode} ${theme.prefs.density}`}</p>
    }
    render(withTheme(<Grab />))
    await screen.findByText('burgundy night comfortable')
    const root = document.documentElement
    expect(root.dataset.mode).toBe('night')
    expect(root.dataset.effects).toBe('balanced')
    expect(root.dataset.density).toBe('comfortable')
    expect(root.dataset.theme).toBe('on')

    act(() => set({ palette: 'petrol', density: 'compact', effects: 'lite', reduceTransparency: true }))
    await screen.findByText('petrol night compact')
    expect(root.dataset.palette).toBe('petrol')
    expect(root.dataset.density).toBe('compact')
    expect(root.dataset.effects).toBe('lite')
    expect(root.dataset.transparency).toBe('reduce')
    // Reduce transparency: the glass is opaque.
    expect(root.style.getPropertyValue('--surface')).toBe(hexToChannels(PALETTES.petrol.night.solid.surface))
    expect(root.style.getPropertyValue('--surface-alpha')).toBe('1')
    await waitFor(() => expect(fake.saved).toEqual([{ palette: 'petrol', density: 'compact', effects: 'lite', reduceTransparency: true }]))

    // Paper gets Petrol's Day tokens, whatever is on screen.
    const print = document.getElementById('aeterna-print-theme')
    expect(print?.getAttribute('media')).toBe('print')
    expect(print?.textContent).toContain(`--text: ${hexToChannels(PALETTES.petrol.day.text)} !important;`)

    // The next start paints from the cache before the database answers.
    expect(JSON.parse(window.localStorage.getItem('aeterna.appearance') ?? '{}')).toMatchObject({ palette: 'petrol', density: 'compact' })
  })

  it('puts the choice back and says so when it can’t be saved', async () => {
    const fake = bridge()
    fake.invoke = (async (channel: string) =>
      channel === 'appearance.get' ? { ok: true, data: DEFAULT_APPEARANCE } : { ok: false, error: { code: 'internal', message: 'Something went wrong.' } }) as AeternaBridge['invoke']
    window.aeterna = fake
    let set: (patch: Partial<AppearancePrefs>) => void = () => undefined
    function Grab(): JSX.Element {
      const theme = useTheme()
      set = theme.setPrefs
      return <p>{theme.prefs.palette}</p>
    }
    render(withTheme(<Grab />))
    await screen.findByText('burgundy')
    act(() => set({ palette: 'emerald' }))
    await screen.findByText('emerald')
    await screen.findByText('burgundy')
  })
})

describe('the splash', () => {
  beforeEach(() => vi.resetModules())

  it('shows the mark for under a second, once per start', async () => {
    const { Splash, SPLASH_HOLD_MS, SPLASH_FADE_MS } = await import('@renderer/components/layout/Splash')
    expect(SPLASH_HOLD_MS + SPLASH_FADE_MS).toBeLessThan(1000)
    const { unmount } = render(<Splash />)
    expect(screen.getByTestId('splash').getAttribute('aria-hidden')).toBe('true')
    await act(() => sleep(SPLASH_HOLD_MS + 30))
    expect(screen.getByTestId('splash').style.opacity).toBe('0')
    await act(() => sleep(SPLASH_FADE_MS + 30))
    expect(screen.queryByTestId('splash')).toBeNull()
    unmount()
    render(<Splash />)
    expect(screen.queryByTestId('splash')).toBeNull()
  })

  it('goes at once on a key or a click', async () => {
    const { Splash, SPLASH_FADE_MS } = await import('@renderer/components/layout/Splash')
    render(<Splash />)
    expect(screen.getByTestId('splash')).toBeTruthy()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(screen.getByTestId('splash').style.opacity).toBe('0')
    await act(() => sleep(SPLASH_FADE_MS + 40))
    expect(screen.queryByTestId('splash')).toBeNull()
  })

  it('never shows under reduced motion', async () => {
    document.documentElement.dataset.motion = 'reduce'
    const { Splash } = await import('@renderer/components/layout/Splash')
    render(<Splash />)
    expect(screen.queryByTestId('splash')).toBeNull()
  })
})

describe('the sidebar', () => {
  it('folds a group away for this person, keeps the screen you are on showing, and remembers it', async () => {
    window.aeterna = bridge()
    const user = userEvent.setup()
    act(() => useRouter.getState().navigate('billing'))
    const actor = { id: 7, username: 'pat', name: 'Pat Partner', role: 'partner' as const }
    const { unmount } = render(withTheme(<Sidebar actor={actor} />))
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(nav.querySelector('[data-nav="billing"]')?.getAttribute('aria-current')).toBe('page')
    expect(nav.querySelector('[data-nav="forecast"]')).not.toBeNull()
    const money = screen.getByRole('button', { name: 'Money' })
    expect(money.getAttribute('aria-expanded')).toBe('true')
    await user.click(money)
    expect(money.getAttribute('aria-expanded')).toBe('false')
    expect(nav.querySelector('[data-nav="forecast"]')).toBeNull()
    expect(nav.querySelector('[data-nav="billing"]')).not.toBeNull()
    unmount()
    render(withTheme(<Sidebar actor={actor} />))
    expect(screen.getByRole('button', { name: 'Money' }).getAttribute('aria-expanded')).toBe('false')
    // Someone else on this PC has their own sidebar.
    cleanup()
    render(withTheme(<Sidebar actor={{ ...actor, id: 8 }} />))
    expect(screen.getByRole('button', { name: 'Money' }).getAttribute('aria-expanded')).toBe('true')
    // The footer: the mode switch as the brief has it, the version, and Sign out.
    expect(screen.getByRole('radiogroup', { name: 'Theme mode' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Day' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'About and help, version 1.4.2' }).textContent).toBe('Version 1.4.2')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })
})
