/**
 * The first-run wizard’s Recovery sheet step. Owned by the backup domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { ArrowLeft, ArrowRight, Construction } from 'lucide-react'
import { EmptyState, GlassButton } from '@renderer/components/ui'
import type { SetupStepProps } from './steps'

export default function RecoveryStep({ next, back, isFirst }: SetupStepProps): JSX.Element {
  return (
    <div>
      <EmptyState size="sm" icon={Construction} title="This step is being built" body="Save or print the database key’s recovery sheet, so the practice’s data can be opened on another PC. It can be done later from Settings." />
      <div className="mt-6 flex justify-between gap-2">
        <GlassButton variant="ghost" icon={ArrowLeft} onClick={back} disabled={isFirst}>
          Back
        </GlassButton>
        <GlassButton variant="primary" icon={ArrowRight} iconPosition="end" onClick={next}>
          Skip for now
        </GlassButton>
      </div>
    </div>
  )
}
