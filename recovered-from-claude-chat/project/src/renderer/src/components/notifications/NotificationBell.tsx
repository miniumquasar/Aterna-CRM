import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, X } from 'lucide-react'
import type { AppNotification } from '@shared/types'
import { EASE_PREMIUM } from '@aether/constants'
import { useMotionLevel } from '@renderer/lib/motion'
import { openTarget } from '@renderer/lib/targets'
import { useNotificationsStore } from '@renderer/stores/notifications'
import { useUiStore } from '@renderer/stores/ui'
import { NotificationItem } from './NotificationItem'

const SHOWN = 8

/**
 * The bell in the title bar: how many notifications need attention, and a
 * panel with the newest of them — Open, Done, Mark all done — and a way to the
 * full list (Activity → Notifications). Escape or a click outside closes it.
 *
 * The panel is drawn at the top of the page (a portal), not inside the title
 * bar: the bar's frosted glass would otherwise hold it — the screen beneath
 * would be drawn over it, and "outside" would be only the bar itself.
 */
export function NotificationBell(): JSX.Element {
  const { open, urgent, panelOpen, setPanelOpen, version } = useNotificationsStore()
  const navigateTo = useUiStore((s) => s.navigateTo)
  const motionLevel = useMotionLevel()
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  // Only the latest request's answer is shown: an earlier, slower one never replaces it.
  const latest = useRef(0)
  // Just below the bell, wherever the title bar is (a banner can sit above it); measured before it is drawn.
  const [top, setTop] = useState(56)
  useLayoutEffect(() => {
    if (!panelOpen) return
    const place = (): void => {
      const r = button.current?.getBoundingClientRect()
      if (r) setTop(Math.round(r.bottom + 8))
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [panelOpen])

  const load = useCallback(async () => {
    const mine = ++latest.current
    const r = await window.api.notifications.list({ show: 'open', limit: SHOWN }).catch(() => null)
    if (mine !== latest.current) return
    if (r?.ok) {
      setItems(r.data)
      setError(null)
    } else setError(r ? r.error : 'The notifications couldn’t be read.')
  }, [])

  // The list, at once when the panel opens and again whenever notifications change while it is open.
  useEffect(() => {
    if (panelOpen) void load()
  }, [panelOpen, version, load])
  // Opening the panel also brings the list up to date. Focus goes to the panel itself, not a button
  // in it, so pressing Enter straight away can't mark everything done.
  useEffect(() => {
    if (!panelOpen) return
    requestAnimationFrame(() => panel.current?.focus())
    void window.api.notifications.refresh().catch(() => null).then(() => load())
  }, [panelOpen, load])

  const close = useCallback((): void => {
    setPanelOpen(false)
    button.current?.focus()
  }, [setPanelOpen])

  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelOpen, close])

  const done = async (ids: number[] | 'all'): Promise<void> => {
    const r = await window.api.notifications.done(ids)
    if (!r.ok) setError(r.error)
    await load()
  }

  const go = (n: AppNotification): void => {
    setPanelOpen(false)
    openTarget(n.target)
  }

  const anim = motionLevel === 'none'
    ? {}
    : { initial: { opacity: 0, y: -6, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.18, ease: EASE_PREMIUM } }

  const panelLayer = (
    <AnimatePresence>
      {panelOpen && (
        <>
          <button type="button" aria-label="Close notifications" tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={close} />
          <motion.div
            ref={panel}
            role="dialog"
            aria-label="Notifications"
            tabIndex={-1}
            {...anim}
            style={{ top }}
            className="fixed right-4 z-50 flex max-h-[min(70vh,40rem)] w-[min(26rem,calc(100vw-2rem))] flex-col rounded-2xl border border-white/10 bg-[#0a0710]/95 shadow-2xl shadow-black/60 outline-none backdrop-blur-xl"
            data-testid="notification-panel"
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
              <div>
                <h2 className="text-sm font-medium text-white/90">Notifications</h2>
                <p className="text-[11px] text-white/45">{open ? `${open} need${open === 1 ? 's' : ''} attention` : 'Nothing needs your attention'}</p>
              </div>
              <div className="flex items-center gap-1">
                {open > 0 && (
                  <button type="button" onClick={() => void done('all')} className="rounded-lg px-2 py-1 text-[11px] text-white/55 hover:bg-white/[0.06] hover:text-white/85" data-testid="notification-all-done">
                    Mark all done
                  </button>
                )}
                <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1 text-white/45 hover:bg-white/[0.06] hover:text-white/85">
                  <X size={14} aria-hidden />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {error && <p role="alert" className="mb-2 text-xs text-rose-300">{error}</p>}
              {items === null ? (
                <p className="py-6 text-center text-xs text-white/40" aria-busy="true">Loading…</p>
              ) : items.length === 0 ? (
                <p className="py-8 text-center text-sm text-white/40">You’re all caught up.</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((n) => (
                    <NotificationItem key={n.id} n={n} compact onOpen={go} onDone={(x) => void done([x.id])} />
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-white/5 px-4 py-2.5">
              <button
                type="button"
                onClick={() => {
                  setPanelOpen(false)
                  navigateTo('notifications')
                }}
                className="text-xs text-aether/90 hover:underline"
                data-testid="notification-see-all"
              >
                See all notifications{open > SHOWN ? ` (${open})` : ''}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setPanelOpen(!panelOpen)}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        aria-label={open ? `Notifications: ${open} need${open === 1 ? 's' : ''} attention${urgent ? `, ${urgent} urgent` : ''}` : 'Notifications: nothing needs attention'}
        className="relative rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/85"
        data-testid="notification-bell"
      >
        <Bell size={15} aria-hidden />
        {open > 0 && (
          <span
            className={`absolute -right-1 -top-1 min-w-[1.1rem] rounded-full px-1 text-center text-[10px] font-semibold tabular-nums leading-[1.1rem] ${urgent ? 'bg-rose-400 text-black' : 'bg-divine/90 text-black'}`}
            aria-hidden
          >
            {open > 99 ? '99+' : open}
          </span>
        )}
      </button>

      {createPortal(panelLayer, document.body)}
    </>
  )
}
