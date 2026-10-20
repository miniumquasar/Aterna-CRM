/**
 * The first-run wizard’s Import the workbook step. Owned by the import domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { ArrowLeft, ArrowRight, Construction } from 'lucide-react'
import { EmptyState, GlassButton } from '@renderer/components/ui'
import type { SetupStepProps } from './steps'

export default function ImportStep({ next, back, isFirst }: SetupStepProps): JSX.Element {
  return (
    <div>
      <EmptyState size="sm" icon={Construction} title="This step is being built" body="Bring in the practice’s master workbook, with a dry run first. It can be done later from Settings." />
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
