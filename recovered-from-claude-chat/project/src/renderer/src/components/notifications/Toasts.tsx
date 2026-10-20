import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { EASE_PREMIUM } from '@aether/constants'
import { useMotionLevel } from '@renderer/lib/motion'
import { openTarget } from '@renderer/lib/targets'
import { useNotificationsStore, type Toast } from '@renderer/stores/notifications'
import { KIND_ICONS, KIND_LABELS, SEVERITY_BAR } from './NotificationItem'

const SHOW_MS = 8000

function ToastCard({ toast }: { toast: Toast }): JSX.Element {
  const dismiss = useNotificationsStore((s) => s.dismissToast)
  const motionLevel = useMotionLevel()
  const [held, setHeld] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const n = toast.notification
  const Icon = KIND_ICONS[n.kind]

  // Goes after a few seconds, but not while the pointer or the keyboard is on it.
  useEffect(() => {
    if (held) return
    timer.current = setTimeout(() => dismiss(toast.key), SHOW_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [held, dismiss, toast.key])

  const anim = motionLevel === 'none'
    ? {}
    : { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: 24 }, transition: { duration: 0.22, ease: EASE_PREMIUM } }

  return (
    <motion.div
      layout={motionLevel !== 'none'}
      {...anim}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className="pointer-events-auto relative flex gap-3 overflow-hidden rounded-xl border border-white/10 bg-void/95 px-4 py-3 shadow-2xl backdrop-blur-xl"
      data-testid="toast"
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${SEVERITY_BAR[n.severity]}`} aria-hidden />
      <Icon size={15} className="mt-0.5 shrink-0 text-white/55" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-white/90">{n.title}</p>
        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-white/50">{n.body}</p>}
        <div className="mt-2 flex items-center gap-3 text-xs">
          <span className="text-white/35">{KIND_LABELS[n.kind]}</span>
          {n.target && (
            <button
              type="button"
              className="text-aether/90 hover:underline"
              onClick={() => {
                dismiss(toast.key)
                openTarget(n.target)
              }}
            >
              Open
            </button>
          )}
        </div>
      </div>
      <button type="button" onClick={() => dismiss(toast.key)} aria-label={`Dismiss: ${n.title}`} className="-mr-1 -mt-1 h-6 w-6 shrink-0 rounded-md text-white/40 hover:bg-white/[0.06] hover:text-white/80">
        <X size={13} className="mx-auto" aria-hidden />
      </button>
    </motion.div>
  )
}

/**
 * New notifications, for a moment in the corner as they arrive. Read out
 * politely by screen readers; they stay on the bell and the list afterwards.
 */
export function Toasts(): JSX.Element {
  const toasts = useNotificationsStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-[min(24rem,calc(100vw-3rem))] flex-col gap-2" aria-live="polite" aria-relevant="additions">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.key} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}
