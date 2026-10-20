/**
 * Asking before going ahead, in the app's own dialog (never window.confirm).
 *
 *   const confirm = useConfirm()
 *   if (await confirm({ title: 'Remove this contact?', body: 'Ann Alder is removed from Alder Ltd.', confirmLabel: 'Remove contact', tone: 'danger' })) …
 *
 * Resolves true for the button that goes ahead; false for Cancel, Escape or
 * a click outside. A danger question puts focus on the safe choice.
 * <ConfirmHost /> is mounted once, in App.
 */
import { useCallback, useId, type ReactNode } from 'react'
import { CircleHelp, TriangleAlert } from 'lucide-react'
import { create } from 'zustand'
import { cx } from '../../lib/cx'
import { Dialog } from './Dialog'
import { GlassButton } from './GlassButton'

/**
 * @prop title         The question, short: 'Remove this contact?'
 * @prop body          What happens, naming what goes.
 * @prop confirmLabel  The button that goes ahead, named for what it does: 'Remove contact'.
 * @prop cancelLabel   Defaults to 'Cancel'.
 * @prop tone          'danger' for something that removes or can't be undone.
 */
export interface ConfirmOptions {
  title: string
  body?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}

interface Pending {
  id: number
  options: ConfirmOptions
  resolve: (answer: boolean) => void
}

const useConfirmStore = create<{ queue: Pending[]; push(p: Pending): void; done(id: number): void }>((set) => ({
  queue: [],
  push: (p) => set((s) => ({ queue: [...s.queue, p] })),
  done: (id) => set((s) => ({ queue: s.queue.filter((p) => p.id !== id) }))
}))

let nextId = 1

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.getState().push({ id: nextId++, options, resolve }))
}

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  return useCallback((options: ConfirmOptions) => confirmAction(options), [])
}

export function ConfirmHost(): JSX.Element | null {
  const pending = useConfirmStore((s) => s.queue[0])
  const done = useConfirmStore((s) => s.done)
  const id = useId()
  if (!pending) return null
  const { options } = pending
  const danger = options.tone === 'danger'
  const answer = (value: boolean): void => {
    done(pending.id)
    pending.resolve(value)
  }
  return (
    <Dialog
      key={pending.id}
      open
      onClose={() => answer(false)}
      role="alertdialog"
      labelledBy={`${id}-title`}
      describedBy={options.body ? `${id}-body` : undefined}
      initialFocus={danger ? '[data-choice="cancel"]' : '[data-choice="confirm"]'}
      className="glass-raised max-w-md rounded-[22px] p-6"
    >
      <div className="flex items-start gap-4">
        <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', danger ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent-text')} aria-hidden>
          {danger ? <TriangleAlert size={19} strokeWidth={1.8} /> : <CircleHelp size={19} strokeWidth={1.8} />}
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 id={`${id}-title`} className="text-lg font-semibold leading-7 tracking-[-0.01em] text-fg">
            {options.title}
          </h2>
          {options.body && (
            <div id={`${id}-body`} className="mt-1.5 whitespace-pre-line text-sm leading-6 text-fg-muted">
              {options.body}
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <GlassButton variant="ghost" data-choice="cancel" data-testid="confirm-cancel" onClick={() => answer(false)}>
          {options.cancelLabel ?? 'Cancel'}
        </GlassButton>
        <GlassButton variant={danger ? 'danger' : 'primary'} data-choice="confirm" data-testid="confirm-ok" onClick={() => answer(true)}>
          {options.confirmLabel}
        </GlassButton>
      </div>
    </Dialog>
  )
}
