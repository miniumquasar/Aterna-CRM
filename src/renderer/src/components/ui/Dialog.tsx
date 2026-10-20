/**
 * The dialog primitive under GlassModal, the confirm dialog and the command
 * palette. While open:
 *  - it renders into its own layer at the end of <body>;
 *  - everything else is inert (unclickable, unfocusable, hidden from screen
 *    readers), so Tab stays inside, and focus wraps from last to first;
 *  - Escape and a click on the backdrop close it (each can be turned off);
 *  - focus goes to `initialFocus`, else an element marked data-autofocus,
 *    else the first control (the close button only if there is nothing else),
 *    else the panel,
 *    and returns where it was when the dialog closes.
 * Dialogs stack safely: only the top one responds to Escape and holds focus.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../../lib/cx'
import { focusElement, focusableWithin } from '../../lib/focus'

const stack: string[] = []
const layers = new Map<string, HTMLElement>()

/** Marks everything but the top dialog's layer inert. Elements with data-inert-exempt (the toasts) are left alone. */
function syncInert(): void {
  const top = stack[stack.length - 1]
  const topLayer = top ? layers.get(top) : undefined
  for (const el of Array.from(document.body.children)) {
    if (!(el instanceof HTMLElement) || el.hasAttribute('data-inert-exempt')) continue
    const shouldBeInert = topLayer !== undefined && el !== topLayer
    if (shouldBeInert && !el.hasAttribute('inert')) {
      el.setAttribute('inert', '')
      el.dataset.dialogInert = 'true'
    } else if (!shouldBeInert && el.dataset.dialogInert) {
      el.removeAttribute('inert')
      delete el.dataset.dialogInert
    }
  }
}

/** True while any dialog is open (the shell's own shortcuts stand aside). */
export function dialogOpen(): boolean {
  return stack.length > 0
}

/**
 * @prop open             Whether it shows.
 * @prop onClose          Called for Escape, a backdrop click, or the dialog's own close controls.
 * @prop labelledBy       The id of the element that names it (or use `label`).
 * @prop label            A name, when no visible heading names it.
 * @prop describedBy      The id of the element that describes it.
 * @prop role             'dialog' (default) or 'alertdialog' (a question that needs an answer).
 * @prop initialFocus     A ref, or a CSS selector inside the dialog, for the first focus.
 * @prop closeOnBackdrop  Default true.
 * @prop closeOnEscape    Default true.
 * @prop placement        'center' (default) or 'top' (the command palette).
 * @prop className        Classes for the panel.
 */
export interface DialogProps {
  open: boolean
  onClose: () => void
  labelledBy?: string
  label?: string
  describedBy?: string
  role?: 'dialog' | 'alertdialog'
  initialFocus?: RefObject<HTMLElement | null> | string
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  placement?: 'center' | 'top'
  className?: string
  children: ReactNode
}

export function Dialog(props: DialogProps): JSX.Element | null {
  return props.open ? <OpenDialog {...props} /> : null
}

function OpenDialog({
  onClose,
  labelledBy,
  label,
  describedBy,
  role = 'dialog',
  initialFocus,
  closeOnBackdrop = true,
  closeOnEscape = true,
  placement = 'center',
  className,
  children
}: DialogProps): JSX.Element | null {
  const id = useId()
  const panel = useRef<HTMLDivElement>(null)
  const [layer] = useState(() => {
    const el = document.createElement('div')
    el.dataset.dialogLayer = id
    return el
  })
  const latestClose = useRef(onClose)
  useEffect(() => {
    latestClose.current = onClose
  })

  // Join the stack, make the rest inert, and give focus back afterwards.
  useLayoutEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.appendChild(layer)
    stack.push(id)
    layers.set(id, layer)
    syncInert()
    return () => {
      const at = stack.indexOf(id)
      if (at >= 0) stack.splice(at, 1)
      layers.delete(id)
      layer.remove()
      syncInert()
      if (returnTo && returnTo.isConnected) focusElement(returnTo)
    }
  }, [id, layer])

  // First focus.
  useEffect(() => {
    const root = panel.current
    if (!root) return
    let target: HTMLElement | null = null
    if (typeof initialFocus === 'string') target = root.querySelector<HTMLElement>(initialFocus)
    else if (initialFocus?.current) target = initialFocus.current
    const focusable = focusableWithin(root)
    // The dialog's own close button is a last resort: the first field or action is more useful.
    target ??= root.querySelector<HTMLElement>('[data-autofocus]') ?? focusable.find((el) => !el.hasAttribute('data-dialog-close')) ?? focusable[0] ?? root
    focusElement(target)
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Escape (top dialog only) and Tab wrapping.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (stack[stack.length - 1] !== id) return
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault()
        event.stopPropagation()
        latestClose.current()
        return
      }
      if (event.key !== 'Tab' || !panel.current) return
      const items = focusableWithin(panel.current)
      if (items.length === 0) {
        event.preventDefault()
        focusElement(panel.current)
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panel.current.contains(active))) {
        event.preventDefault()
        focusElement(last)
      } else if (!event.shiftKey && (active === last || !panel.current.contains(active))) {
        event.preventDefault()
        focusElement(first)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [id, closeOnEscape])

  const onBackdrop = (event: MouseEvent<HTMLDivElement>): void => {
    if (closeOnBackdrop && event.target === event.currentTarget) latestClose.current()
  }

  return createPortal(
    <div
      className={cx(
        'fixed inset-0 z-50 flex animate-fade-in justify-center overflow-y-auto bg-shadow/45 px-4 backdrop-blur-[2px]',
        placement === 'top' ? 'items-start pt-[12vh]' : 'items-center py-10'
      )}
      onMouseDown={onBackdrop}
      data-testid="dialog-backdrop"
    >
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cx('relative w-full animate-dialog-in outline-none', className)}
      >
        {children}
      </div>
    </div>,
    layer
  )
}
