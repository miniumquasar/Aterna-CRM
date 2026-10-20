import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

/**
 * A reference number — UTR, VAT, company number, NI number, PAYE reference —
 * set so it can be read back over the phone: tabular figures, a slashed
 * zero, and I, l and 1 told apart. Kept on one line and out of translation.
 *
 * @prop children  The reference as it should read ('1234 56789', 'GB123456789').
 * @prop label     Its name for screen readers when it stands alone ('UTR').
 */
export interface ReferenceProps {
  children: ReactNode
  label?: string
  className?: string
}

export function Reference({ children, label, className }: ReferenceProps): JSX.Element {
  return (
    <span translate="no" className={cx('ref-figures whitespace-nowrap tracking-[0.01em]', className)}>
      {label && <span className="sr-only">{label}: </span>}
      {children}
    </span>
  )
}
