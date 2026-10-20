// @vitest-environment jsdom
/**
 * lib/api.ts against a fake bridge: results become data or ApiCallErrors,
 * a bridge that fails becomes 'unavailable', a mutation refreshes the
 * queries it names, and the browser preview falls back to the demo backend.
 * Then the theme: CSS variables on <html>, and Auto following the OS.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AeternaBridge } from '@shared/ipc/bridge'
import type { EventName } from '@shared/ipc/events'
import { ApiCallError, call, invoke, useApiMutation, useApiQuery } from '@renderer/lib/api'
import { ThemeProvider, useTheme } from '@renderer/theme'
import { DEFAULT_APPEARANCE } from '@shared/theme/appearance'

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

type Listener = (payload: unknown) => void

function fakeBridge(answer: (channel: string, req: unknown) => unknown): AeternaBridge & { fire(event: EventName, payload: unknown): void; calls: string[] } {
  const listeners = new Map<string, Set<Listener>>()
  const calls: string[] = []
  return {
    calls,
    invoke: (async (channel: string, req: unknown) => {
      calls.push(channel)
      return answer(channel, req)
    }) as AeternaBridge['invoke'],
    on: ((event: string, listener: Listener) => {
      const set = listeners.get(event) ?? new Set()
      set.add(listener)
      listeners.set(event, set)
      return () => set.delete(listener)
    }) as AeternaBridge['on'],
    info: { platform: 'win32', versions: { app: '1.0.0', electron: '41' } },
    fire(event, payload) {
      for (const l of listeners.get(event) ?? []) l(payload)
    }
  }
}

afterEach(() => {
  cleanup()
  delete window.aeterna
})

describe('lib/api', () => {
  it('turns results into data, and refusals into ApiCallErrors with their code and field', async () => {
    window.aeterna = fakeBridge((channel) =>
      channel === 'system.ping' ? { ok: true, data: { pong: true, at: 'now' } } : { ok: false, error: { code: 'invalid', message: 'Enter a name.', field: 'name' } }
    )
    expect(await call('system.ping', undefined)).toEqual({ pong: true, at: 'now' })
    const err = await call('auth.signIn', { username: '', password: '' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiCallError)
    expect(err).toMatchObject({ code: 'invalid', message: 'Enter a name.', field: 'name', channel: 'auth.signIn' })
  })

  it('answers “unavailable” when the bridge itself fails, never throwing', async () => {
    window.aeterna = fakeBridge(() => {
      throw new Error('An object could not be cloned')
    })
    expect(await invoke('system.ping', undefined)).toMatchObject({ ok: false, error: { code: 'unavailable' } })
  })

  it('uses the demo backend in the browser preview', async () => {
    expect(window.aeterna).toBeUndefined()
    expect(await invoke('system.ping', undefined)).toMatchObject({ ok: false, error: { code: 'unavailable', message: expect.stringMatching(/browser preview/) } })
  })

  it('refreshes the queries a mutation names, and only those', async () => {
    let saved = 'day'
    const bridge = fakeBridge((channel, req) => {
      if (channel === 'appearance.set') saved = (req as { mode: string }).mode
      if (channel === 'system.ping') return { ok: true, data: { pong: true, at: 'x' } }
      return { ok: true, data: { ...DEFAULT_APPEARANCE, mode: saved } }
    })
    window.aeterna = bridge
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function Probe(): JSX.Element {
      const prefs = useApiQuery('appearance.get', undefined)
      useApiQuery('system.ping', undefined)
      const save = useApiMutation('appearance.set', { invalidates: ['appearance.get'] })
      return (
        <button type="button" onClick={() => save.mutate({ mode: 'night' })}>
          {prefs.data?.mode ?? 'loading'}
        </button>
      )
    }
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>
    )
    await screen.findByRole('button', { name: 'day' })
    const pingsBefore = bridge.calls.filter((c) => c === 'system.ping').length
    await act(async () => screen.getByRole('button').click())
    await screen.findByRole('button', { name: 'night' })
    expect(bridge.calls.filter((c) => c === 'appearance.get')).toHaveLength(2)
    expect(bridge.calls.filter((c) => c === 'system.ping')).toHaveLength(pingsBefore)
  })
})

describe('the theme', () => {
  it('writes the palette as CSS variables on <html>, and Auto follows the operating system', async () => {
    const bridge = fakeBridge((channel) =>
      channel === 'appearance.get' ? { ok: true, data: { ...DEFAULT_APPEARANCE, mode: 'auto', palette: 'burgundy' } } : { ok: false, error: { code: 'unavailable', message: 'x' } }
    )
    window.aeterna = bridge
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function Mode(): JSX.Element {
      return <p>{useTheme().mode}</p>
    }
    render(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <Mode />
        </ThemeProvider>
      </QueryClientProvider>
    )
    await waitFor(() => expect(bridge.calls).toContain('appearance.get'))
    const root = document.documentElement
    expect(root.dataset.palette).toBe('burgundy')
    expect(root.style.getPropertyValue('--accent')).toMatch(/^\d+ \d+ \d+$/)
    expect(root.dataset.mode).toBe('day')
    const daySurface = root.style.getPropertyValue('--surface')
    act(() => bridge.fire('appearance.osChanged', { dark: true }))
    await screen.findByText('night')
    expect(root.dataset.mode).toBe('night')
    expect(root.dataset.scheme).toBe('dark')
    expect(root.style.getPropertyValue('--surface')).not.toBe(daySurface)
  })
})
