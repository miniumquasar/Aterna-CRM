/**
 * The bridge: the only code with ipcRenderer. It exposes exactly
 * `window.aeterna` = { invoke, on, info } and refuses any channel or event
 * that isn't in the contract. The renderer reaches it only through
 * src/renderer/src/lib/api.ts.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AeternaBridge, Platform } from '@shared/ipc/bridge'
import { isChannel } from '@shared/ipc/contract'
import { isEventName, type EventName } from '@shared/ipc/events'
import { fail } from '@shared/ipc/result'
import { EVENT_CHANNEL, INVOKE_CHANNEL } from '@shared/ipc/transport'

const listeners = new Map<EventName, Set<(payload: unknown) => void>>()

ipcRenderer.on(EVENT_CHANNEL, (_event: IpcRendererEvent, name: unknown, payload: unknown) => {
  if (!isEventName(name)) return
  for (const listener of listeners.get(name) ?? []) {
    try {
      listener(payload)
    } catch (err) {
      console.error(`A listener for ${name} failed`, err)
    }
  }
})

const bridge: AeternaBridge = {
  invoke(channel, req) {
    if (!isChannel(channel)) {
      return Promise.resolve(fail('not_found', 'That isn’t something this version of AETERNA CRM can do.'))
    }
    return ipcRenderer.invoke(INVOKE_CHANNEL, channel, req)
  },
  on(event, listener) {
    if (!isEventName(event)) throw new Error(`“${String(event)}” isn’t an event AETERNA CRM sends.`)
    let set = listeners.get(event)
    if (!set) {
      set = new Set()
      listeners.set(event, set)
    }
    const wrapped = listener as (payload: unknown) => void
    set.add(wrapped)
    return () => {
      set.delete(wrapped)
    }
  },
  info: Object.freeze({
    platform: process.platform as Platform,
    versions: Object.freeze({ app: __APP_VERSION__, electron: process.versions.electron ?? '' })
  })
}

contextBridge.exposeInMainWorld('aeterna', bridge)
