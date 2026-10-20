import { afterEach, describe, expect, it } from 'vitest'
import { CHANNEL_TABLES, CHANNELS } from '@shared/ipc/contract'
import { EVENTS } from '@shared/ipc/events'
import { INVOKE_CHANNEL } from '@shared/ipc/transport'
import { createMemoryLogger } from '@main/app/logger'
import { registerAllHandlers, DOMAIN_REGISTRARS } from '@main/ipc/register-all'
import { clearHandlers, handledChannels, installIpc, wiringReport, type IpcMainLike } from '@main/ipc/registry'
import { clearJobs, registeredJobs } from '@main/jobs'

function fakeIpcMain(): IpcMainLike & { channels: string[] } {
  const channels: string[] = []
  return {
    channels,
    handle(channel) {
      channels.push(channel)
    },
    removeHandler() {}
  }
}

afterEach(() => {
  clearHandlers()
  clearJobs()
})

describe('the IPC contract', () => {
  it('has a handler for every channel, and a channel for every handler', () => {
    registerAllHandlers()
    const ipc = fakeIpcMain()
    installIpc(ipc, { getDb: () => { throw new Error('unused') }, log: createMemoryLogger(), now: () => new Date(), emit: () => undefined, isReadOnly: () => false })
    expect(ipc.channels).toEqual([INVOKE_CHANNEL])
    const declared = Object.keys(CHANNELS).sort()
    expect(handledChannels().sort()).toEqual(declared)
    expect(wiringReport().missing).toEqual([])
  })

  it('pre-wires every domain, and each channel belongs to exactly one domain', () => {
    expect(Object.keys(CHANNEL_TABLES).sort()).toEqual(DOMAIN_REGISTRARS.map(([d]) => d).sort())
    const seen = new Map<string, string>()
    for (const [domain, table] of Object.entries(CHANNEL_TABLES)) {
      for (const channel of Object.keys(table)) {
        expect(seen.get(channel), `${channel} is declared by both ${seen.get(channel)} and ${domain}`).toBeUndefined()
        seen.set(channel, domain)
      }
    }
    expect([...seen.keys()].sort()).toEqual(Object.keys(CHANNELS).sort())
  })

  it('names channels <area>.<verb> and gives each valid flags', () => {
    for (const [channel, flags] of Object.entries(CHANNELS)) {
      expect(channel).toMatch(/^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/)
      expect(['read', 'write']).toContain(flags.kind)
      if ('auth' in flags) expect(flags.auth).toBe('public')
      if ('allowWhenReadOnly' in flags) {
        expect(flags.allowWhenReadOnly).toBe(true)
        expect(flags.kind, `${channel} is allowed when read-only but isn’t a write`).toBe('write')
      }
    }
  })

  it('names events <area>.<pastTense> with no repeats', () => {
    expect(new Set(EVENTS).size).toBe(EVENTS.length)
    for (const e of EVENTS) expect(e).toMatch(/^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/)
  })

  it('registers background jobs with unique names', () => {
    registerAllHandlers()
    const jobs = registeredJobs()
    expect(new Set(jobs).size).toBe(jobs.length)
  })
})
