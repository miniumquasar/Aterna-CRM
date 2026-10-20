/**
 * Notifications, kept up to date while someone is signed in: every five
 * minutes, a few seconds after signing in, and soon after anything that may
 * change them (a deadline filed, Companies House changes found). What each
 * person is told is worked out in ../records/notifications.ts.
 *
 * New notifications go to the open window (the badge, the bell and a toast).
 * When the window isn't in front, they also come as desktop notifications —
 * unless the practice has turned those off in Settings. Nobody signed in:
 * nothing is announced, so the sign-in screen never shows a client's name.
 */
import { BrowserWindow, Notification } from 'electron'
import type { NotificationsChanged } from '../../shared/types'
import { canManage, type Actor } from '../access/policy'
import { getDb } from '../db/schema'
import { notificationCounts, refreshNotifications, type PracticeFacts } from '../records/notifications'
import { sendToRenderer } from '../window-events'

const TICK_MS = 5 * 60 * 1000
const SOON_MS = 3000

export interface NotifierDeps {
  whoIsSignedIn: () => Actor | null
  /** The licence and backups, for partners and managers. */
  facts: () => PracticeFacts
  /** Days ahead deadlines are announced, and whether desktop notifications are on. */
  settings: () => { alertDays: number; desktop: boolean }
}

let deps: NotifierDeps | null = null
let timer: ReturnType<typeof setInterval> | null = null
let soon: ReturnType<typeof setTimeout> | null = null

export function startNotifier(d: NotifierDeps): void {
  stopNotifier()
  deps = d
  checkNotificationsSoon()
  timer = setInterval(check, TICK_MS)
}

export function stopNotifier(): void {
  if (timer) clearInterval(timer)
  if (soon) clearTimeout(soon)
  timer = null
  soon = null
  deps = null
}

/** Something may have changed (someone signed in, a deadline was filed): check in a few seconds. */
export function checkNotificationsSoon(): void {
  if (!deps) return
  if (soon) clearTimeout(soon)
  soon = setTimeout(() => {
    soon = null
    check()
  }, SOON_MS)
}

/** Brings the signed-in person's notifications up to date now; the counts after. */
export function refreshNow(): NotificationsChanged | null {
  return check()
}

/** Tells the window the counts changed (a notification marked done). */
export function pushCounts(person: Actor): void {
  sendToRenderer('notifications:changed', { ...notificationCounts(getDb(), person), created: [] } satisfies NotificationsChanged)
}

function check(): NotificationsChanged | null {
  if (!deps) return null
  try {
    const person = deps.whoIsSignedIn()
    if (!person) return null
    const { alertDays, desktop } = deps.settings()
    const r = refreshNotifications(getDb(), person, { alertDays, facts: canManage(person) ? safeFacts() : {} })
    const changed: NotificationsChanged = { open: r.open, urgent: r.urgent, created: r.created.slice(0, 5) }
    if (r.created.length || r.resolved) sendToRenderer('notifications:changed', changed)
    // The licence already has its own daily desktop reminder (../licence), so it isn't announced twice.
    const desktopItems = r.created.filter((n) => n.kind !== 'licence')
    if (desktopItems.length && desktop && !BrowserWindow.getFocusedWindow()) announce(desktopItems.map((n) => ({ title: n.title, body: n.body ?? '' })))
    return changed
  } catch (err) {
    console.error('[notifications]', (err as Error).message)
    return null
  }
}

function safeFacts(): PracticeFacts {
  try {
    return deps?.facts() ?? {}
  } catch (err) {
    console.error('[notifications] facts', (err as Error).message)
    return {}
  }
}

/**
 * Desktop notifications on screen, held so a click still reaches its handler
 * (one that has been garbage-collected loses it). The oldest go first.
 */
const shown: Notification[] = []
const HOLD = 20

/** Desktop notifications: each of a few, or one for many. Clicking one brings the app forward on its notifications. */
function announce(items: ReadonlyArray<{ title: string; body: string }>): void {
  if (!Notification.isSupported()) return
  const show = (title: string, body: string): void => {
    const n = new Notification({ title, body })
    shown.push(n)
    if (shown.length > HOLD) shown.splice(0, shown.length - HOLD)
    const forget = (): void => {
      const i = shown.indexOf(n)
      if (i >= 0) shown.splice(i, 1)
    }
    n.on('close', forget)
    n.on('click', () => {
      forget()
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      }
      sendToRenderer('notifications:open', null)
    })
    n.show()
  }
  if (items.length <= 3) for (const i of items) show(i.title, i.body)
  else show(`${items.length} new notifications`, `${items[0].title}, and ${items.length - 1} more. Open AETERNA CRM to go through them.`)
}
