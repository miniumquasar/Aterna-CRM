/**
 * The auth domain's renderer test kit: a fake bridge answering channels
 * from a table, and a render with the query client and theme.
 */
import type { ReactElement } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AeternaBridge } from '@shared/ipc/bridge'
import type { EventName } from '@shared/ipc/events'
import { ThemeProvider } from '@renderer/theme'

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

export type Answer = (req: unknown) => unknown

export interface FakeBridge extends AeternaBridge {
  calls: Array<{ channel: string; req: unknown }>
  fire(event: EventName, payload: unknown): void
}

export const ok = (data: unknown): unknown => ({ ok: true, data })
export const refuse = (code: string, message: string, field?: string): unknown => ({ ok: false, error: { code, message, ...(field ? { field } : {}) } })

/** Answers each channel from `table`; anything else is 'unavailable'. */
export function installBridge(table: Record<string, Answer>): FakeBridge {
  const listeners = new Map<string, Set<(p: unknown) => void>>()
  const calls: FakeBridge['calls'] = []
  const bridge: FakeBridge = {
    calls,
    invoke: (async (channel: string, req: unknown) => {
      calls.push({ channel, req })
      const answer = table[channel]
      return answer ? answer(req) : refuse('unavailable', `${channel} isn’t answered in this test.`)
    }) as AeternaBridge['invoke'],
    on: ((event: string, listener: (p: unknown) => void) => {
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
  window.aeterna = bridge
  return bridge
}

export function renderWithApp(ui: ReactElement): RenderResult & { client: QueryClient } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const result = render(
    <QueryClientProvider client={client}>
      <ThemeProvider>{ui}</ThemeProvider>
    </QueryClientProvider>
  )
  return { ...result, client }
}

export const callsTo = (bridge: FakeBridge, channel: string): unknown[] => bridge.calls.filter((c) => c.channel === channel).map((c) => c.req)
