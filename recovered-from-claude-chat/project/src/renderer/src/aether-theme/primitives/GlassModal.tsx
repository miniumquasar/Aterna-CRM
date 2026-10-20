import { useId, type ReactNode } from 'react'
import { Modal } from '@renderer/components/ui/Modal'

interface GlassModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** The dialog's name: shown as its heading and read out when it opens. */
  title: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeClasses: Record<NonNullable<GlassModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl'
}

/**
 * The glass-styled dialog, built on the shared Modal: the app behind is inert
 * while it is open, Tab stays inside, Escape and the backdrop close it, and
 * focus goes back where it was afterwards.
 */
export function GlassModal({ open, onClose, children, title, size = 'md' }: GlassModalProps): JSX.Element {
  const id = useId()
  return (
    <Modal open={open} onClose={onClose} labelledBy={`${id}-title`} width={sizeClasses[size]} padded={false} className="max-h-[90vh] overflow-y-auto p-8">
      <h2 id={`${id}-title`} className="mb-6 text-xl font-light tracking-tight text-white/90">
        {title}
      </h2>
      {children}
    </Modal>
  )
}
