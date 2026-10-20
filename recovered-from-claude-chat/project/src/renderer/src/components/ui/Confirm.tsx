import { useId } from 'react'
import { create } from 'zustand'
import { Modal } from './Modal'
import { primaryButton, quietButton } from '@renderer/components/forms/FormDialog'

/** The red button for a confirmation that removes something or can't be undone. */
export const dangerPrimaryButton =
  'rounded-xl bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

export interface ConfirmOptions {
  /** The question, short: "Remove this contact?" */
  title: string
  /** What happens, in a sentence or two. */
  body?: string
  /** The button that goes ahead, named for what it does: "Remove contact". */
  confirm: string
  /** The button that doesn't. "Cancel" unless given. */
  cancel?: string
  /** 'danger' when it removes something or can't be undone: the button is red and the safe choice has focus. */
  tone?: 'danger' | 'normal'
}

interface Request {
  id: number
  kind: 'confirm' | 'notice'
  options: ConfirmOptions
  resolve: (ok: boolean) => void
}

const useConfirmStore = create<{ queue: Request[]; push: (r: Request) => void; done: (id: number) => void }>((set) => ({
  queue: [],
  push: (r) => set((s) => ({ queue: [...s.queue, r] })),
  done: (id) => set((s) => ({ queue: s.queue.filter((r) => r.id !== id) }))
}))

let nextId = 1

/**
 * Asks before going ahead, in the app's own dialog: true when the person
 * chooses the button that goes ahead; false for Cancel, Escape or a click
 * outside it.
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.getState().push({ id: nextId++, kind: 'confirm', options, resolve }))
}

/** Tells the person something they need to read before carrying on: what went wrong, and what to do about it. */
export function showNotice(options: { title: string; body?: string; ok?: string }): Promise<void> {
  return new Promise((resolve) =>
    useConfirmStore.getState().push({ id: nextId++, kind: 'notice', options: { title: options.title, body: options.body, confirm: options.ok ?? 'OK' }, resolve: () => resolve() })
  )
}

/**
 * Shows the questions and notices one at a time, oldest first. Mounted once,
 * at the root of the app, so every screen (and the setup wizard) can ask.
 */
export function ConfirmHost(): JSX.Element | null {
  const request = useConfirmStore((s) => s.queue[0])
  const done = useConfirmStore((s) => s.done)
  const id = useId()
  if (!request) return null
  const { options, kind } = request
  const danger = kind === 'confirm' && options.tone === 'danger'
  const answer = (ok: boolean): void => {
    done(request.id)
    request.resolve(ok)
  }
  return (
    <Modal
      key={request.id}
      open
      onClose={() => answer(false)}
      labelledBy={`${id}-title`}
      describedBy={options.body ? `${id}-body` : undefined}
      role="alertdialog"
      initialFocus={danger ? '[data-choice="safe"]' : '[data-choice="go"]'}
    >
      <h2 id={`${id}-title`} className="text-lg font-light text-white/95">
        {options.title}
      </h2>
      {options.body && (
        <p id={`${id}-body`} className="mt-2 whitespace-pre-line text-sm text-white/65">
          {options.body}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {kind === 'confirm' && (
          <button type="button" className={quietButton} onClick={() => answer(false)} data-choice="safe" data-testid="confirm-cancel">
            {options.cancel ?? 'Cancel'}
          </button>
        )}
        <button type="button" className={danger ? dangerPrimaryButton : primaryButton} onClick={() => answer(true)} data-choice="go" data-testid="confirm-ok">
          {options.confirm}
        </button>
      </div>
    </Modal>
  )
}
