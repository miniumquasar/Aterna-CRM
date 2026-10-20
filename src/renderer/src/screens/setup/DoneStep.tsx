/** The wizard's last step: finish setting up and open the app. Owned by the auth domain. */
import { useState } from 'react'
import { ArrowLeft, PartyPopper } from 'lucide-react'
import { GlassButton } from '@renderer/components/ui'
import { useApiMutation } from '@renderer/lib/api'
import type { SetupStepProps } from './steps'

export default function DoneStep({ status, back }: SetupStepProps): JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const finish = useApiMutation('setup.finish', { invalidates: ['auth.status'], onError: (err) => setError(err.message) })
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent-text" aria-hidden>
        <PartyPopper size={26} strokeWidth={1.6} />
      </span>
      <h3 className="font-display text-lg font-semibold text-fg">{status.firmName ? `${status.firmName} is set up` : 'The practice is set up'}</h3>
      <p className="mt-1.5 max-w-md text-sm text-fg-muted">Anything you skipped can be done later from Settings. Next, add your clients or import the master workbook.</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-6 flex gap-2">
        <GlassButton variant="ghost" icon={ArrowLeft} onClick={back}>
          Back
        </GlassButton>
        <GlassButton variant="primary" loading={finish.isPending} onClick={() => finish.mutate()} data-testid="setup-finish">
          Open AETERNA CRM
        </GlassButton>
      </div>
    </div>
  )
}
