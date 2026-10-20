/**
 * Main → renderer pushes. Handlers emit through their context
 * (`ctx.emit('notifications.changed', { unread })`); background jobs through
 * their job context. Only events declared in src/shared/ipc/events.ts can be
 * sent, and only to the main window.
 */
import { EVENT_CHANNEL } from '@shared/ipc/transport'
import { isEventName, type ApiEvents, type EventName } from '@shared/ipc/events'

export interface EventTarget {
  send(channel: string, ...args: unknown[]): void
  isDestroyed(): boolean
}

let target: () => EventTarget | null = () => null
const taps = new Set<(event: EventName, payload: unknown) => void>()

/** Start-up points this at the main window's webContents. */
export function setEventTarget(getter: () => EventTarget | null): void {
  target = getter
}

export function emit<E extends EventName>(event: E, payload: ApiEvents[E]): void {
  if (!isEventName(event)) throw new Error(`“${String(event)}” isn’t a declared event (src/shared/ipc/events.ts).`)
  const t = target()
  if (t && !t.isDestroyed()) t.send(EVENT_CHANNEL, event, payload)
  for (const tap of taps) tap(event, payload)
}

/** Sees every event emitted (tests). Returns a function that stops it. */
export function tapEvents(listener: (event: EventName, payload: unknown) => void): () => void {
  taps.add(listener)
  return () => taps.delete(listener)
}

export type Emit = typeof emit
