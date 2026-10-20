import { useId, type FormEvent, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'
import { cx } from '../../lib/cx'
import { Dialog } from './Dialog'
import { GlassButton } from './GlassButton'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

const WIDTH: Record<ModalSize, string> = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }

/**
 * A glass dialog with a heading, body and footer, on Dialog's focus trap.
 *
 * @prop open, onClose      As Dialog.
 * @prop title              The heading; it also names the dialog for screen readers.
 * @prop description        A line under the heading; it also describes the dialog.
 * @prop size               'sm' | 'md' (default) | 'lg' | 'xl'.
 * @prop footer             The actions row (put the main action last).
 * @prop onSubmit           Wraps body and footer in a form: Enter submits, the default is prevented for you.
 * @prop initialFocus       As Dialog.
 * @prop closeOnBackdrop    Default true; turn off for forms where a stray click would lose typing.
 * @prop hideCloseButton    Hides the × in the corner (Escape still closes unless the Dialog says not).
 * @prop role               'dialog' (default) or 'alertdialog'.
 */
export interface GlassModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  size?: ModalSize
  footer?: ReactNode
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  initialFocus?: RefObject<HTMLElement | null> | string
  closeOnBackdrop?: boolean
  hideCloseButton?: boolean
  role?: 'dialog' | 'alertdialog'
  children?: ReactNode
}

export function GlassModal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  onSubmit,
  initialFocus,
  closeOnBackdrop = true,
  hideCloseButton = false,
  role = 'dialog',
  children
}: GlassModalProps): JSX.Element {
  const id = useId()
  const titleId = `${id}-title`
  const descId = description ? `${id}-desc` : undefined
  const body = (
    <>
      {children !== undefined && <div className="px-6 pb-2 text-sm leading-6 text-fg-muted">{children}</div>}
      {footer !== undefined && <div className="hairline mt-3 flex flex-wrap items-center justify-end gap-2 border-t px-6 pb-5 pt-4">{footer}</div>}
    </>
  )
  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={descId}
      role={role}
      initialFocus={initialFocus}
      closeOnBackdrop={closeOnBackdrop}
      className={cx('glass-raised rounded-[22px]', WIDTH[size])}
    >
      <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-6">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold leading-7 tracking-[-0.01em] text-fg">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-1 text-sm leading-6 text-fg-muted">
              {description}
            </p>
          )}
        </div>
        {!hideCloseButton && <GlassButton variant="ghost" size="sm" iconOnly icon={X} aria-label="Close" onClick={onClose} className="-mr-2 -mt-1" data-dialog-close />}
      </div>
      {onSubmit ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(event)
          }}
        >
          {body}
        </form>
      ) : (
        body
      )}
    </Dialog>
  )
}
