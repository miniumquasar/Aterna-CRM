/**
 * Short messages that come and go, at the bottom right:
 *
 *   toast.success('Client saved')
 *   toast.error('The backup couldn’t be made', { description: err.message })
 *
 * Errors stay until dismissed or for longer; others go after 5 seconds
 * (paused while hovered or focused). <Toaster /> is mounted once, in App,
 * as a live region, so screen readers hear each message.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { create } from 'zustand'
import { cx } from '../../lib/cx'

export type ToastTone = 'success' | 'info' | 'warning' | 'error'

/**
 * @prop description A second line.
 * @prop durationMs  How long it shows; 0 keeps it until dismissed. Defaults to 5,000 (errors 9,000).
 * @prop action      One button, e.g. { label: 'Undo', onClick }.
 */
export interface ToastOptions {
  description?: string
  durationMs?: number
  action?: { label: string; onClick: () => void }
}

interface ToastItem extends ToastOptions {
  id: number
  tone: ToastTone
  message: string
}

const useToastStore = create<{ items: ToastItem[]; add(t: ToastItem): void; remove(id: number): void }>((set) => ({
  items: [],
  add: (t) => set((s) => ({ items: [...s.items.slice(-4), t] })),
  remove: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) }))
}))

let nextId = 1

function show(tone: ToastTone, message: string, options: ToastOptions = {}): number {
  const id = nextId++
  useToastStore.getState().add({ id, tone, message, ...options })
  return id
}

export const toast = {
  success: (message: string, options?: ToastOptions) => show('success', message, options),
  info: (message: string, options?: ToastOptions) => show('info', message, options),
  warning: (message: string, options?: ToastOptions) => show('warning', message, options),
  error: (message: string, options?: ToastOptions) => show('error', message, options),
  dismiss: (id: number) => useToastStore.getState().remove(id)
}

const ICON: Record<ToastTone, LucideIcon> = { success: CircleCheck, info: Info, warning: TriangleAlert, error: CircleAlert }
const ICON_TONE: Record<ToastTone, string> = { success: 'text-success', info: 'text-info', warning: 'text-warning', error: 'text-danger' }

function ToastCard({ item }: { item: ToastItem }): JSX.Element {
  const remove = useToastStore((s) => s.remove)
  const [paused, setPaused] = useState(false)
  const duration = item.durationMs ?? (item.tone === 'error' ? 9000 : 5000)
  useEffect(() => {
    if (paused || duration === 0) return
    const t = setTimeout(() => remove(item.id), duration)
    return () => clearTimeout(t)
  }, [paused, duration, item.id, remove])
  const Icon = ICON[item.tone]
  return (
    <li
      className="glass-raised pointer-events-auto flex w-[22rem] animate-toast-in items-start gap-3 rounded-xl p-3.5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon size={18} className={cx('mt-0.5 shrink-0', ICON_TONE[item.tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{item.message}</p>
        {item.description && <p className="mt-0.5 text-[13px] text-fg-muted">{item.description}</p>}
        {item.action && (
          <button
            type="button"
            className="mt-2 rounded-md text-[13px] font-semibold text-accent-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            onClick={() => {
              item.action?.onClick()
              remove(item.id)
            }}
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className="rounded-md p-0.5 text-fg-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        onClick={() => remove(item.id)}
      >
        <X size={15} aria-hidden />
      </button>
    </li>
  )
}

/** Rendered straight into <body>, outside the app root, so it stays live while a dialog makes the rest inert. */
export function Toaster(): JSX.Element {
  const items = useToastStore((s) => s.items)
  const polite = items.filter((t) => t.tone !== 'error')
  const urgent = items.filter((t) => t.tone === 'error')
  return createPortal(
    <div data-inert-exempt className="pointer-events-none fixed bottom-4 right-4 z-[70] flex flex-col items-end gap-2">
      <ol aria-live="assertive" aria-label="Problems" className="flex flex-col items-end gap-2">
        {urgent.map((t) => (
          <ToastCard key={t.id} item={t} />
        ))}
      </ol>
      <ol aria-live="polite" aria-label="Messages" className="flex flex-col items-end gap-2">
        {polite.map((t) => (
          <ToastCard key={t.id} item={t} />
        ))}
      </ol>
    </div>,
    document.body
  )
}
