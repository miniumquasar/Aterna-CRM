import { create } from 'zustand'
import type { AppNotification, NotificationCounts, NotificationsChanged } from '@shared/types'

/** A notification shown for a moment in the corner as it arrives. */
export interface Toast {
  key: number
  notification: AppNotification
}

interface NotificationsState extends NotificationCounts {
  /** Goes up whenever notifications change, so open lists reload. */
  version: number
  /** The bell's panel. */
  panelOpen: boolean
  toasts: Toast[]
  setCounts: (c: NotificationCounts) => void
  changed: (c: NotificationsChanged, showToasts: boolean) => void
  /** Opening the panel clears the toasts: the same notifications are listed there. */
  setPanelOpen: (open: boolean) => void
  dismissToast: (key: number) => void
  clearToasts: () => void
}

let nextKey = 1
/** At most this many toasts at once; older ones make way. */
const MAX_TOASTS = 3

/**
 * The signed-in person's notification counts — the bell, the sidebar badge and
 * the tab read them — and the toasts on screen. The main process pushes every
 * change (notifications:changed); signing out reloads the window, which clears it.
 */
export const useNotificationsStore = create<NotificationsState>((set) => ({
  open: 0,
  urgent: 0,
  version: 0,
  panelOpen: false,
  toasts: [],
  setCounts: (c) => set({ open: c.open, urgent: c.urgent }),
  changed: (c, showToasts) =>
    set((s) => ({
      open: c.open,
      urgent: c.urgent,
      version: s.version + 1,
      toasts: showToasts && c.created.length
        ? [...c.created.slice(0, MAX_TOASTS).map((n) => ({ key: nextKey++, notification: n })), ...s.toasts].slice(0, MAX_TOASTS)
        : s.toasts
    })),
  setPanelOpen: (panelOpen) => set(panelOpen ? { panelOpen, toasts: [] } : { panelOpen }),
  dismissToast: (key) => set((s) => ({ toasts: s.toasts.filter((t) => t.key !== key) })),
  clearToasts: () => set((s) => (s.toasts.length ? { toasts: [] } : s))
}))

