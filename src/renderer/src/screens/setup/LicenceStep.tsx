/**
 * The first-run wizard’s Trial or licence step. Owned by the licence domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { ArrowLeft, ArrowRight, Construction } from 'lucide-react'
import { EmptyState, GlassButton } from '@renderer/components/ui'
import type { SetupStepProps } from './steps'

export default function LicenceStep({ next, back, isFirst }: SetupStepProps): JSX.Element {
  return (
    <div>
      <EmptyState size="sm" icon={Construction} title="This step is being built" body="Start the 60-day trial, or enter the firm’s licence key. It can be done later from Settings." />
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
