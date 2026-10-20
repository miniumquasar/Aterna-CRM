/**
 * The wizard's last step: what was done, what was left for later and where
 * to find it, then into the app. Owned by the auth domain.
 */
import { useState } from 'react'
import { ArrowLeft, CircleCheck, CircleDashed, CircleDot, PartyPopper, Users, Building } from 'lucide-react'
import type { SetupStepState } from '@shared/contracts/auth'
import { GlassButton } from '@renderer/components/ui'
import { useApiMutation, useApiQuery } from '@renderer/lib/api'
import { SETUP_STEPS, type SetupStepProps } from './steps'

function StepLine({ title, state, later }: { title: string; state: SetupStepState; later?: string }): JSX.Element {
  const done = state === 'done'
  const leftForLater = state === 'skipped' || state === 'todo'
  const Icon = done ? CircleCheck : leftForLater ? CircleDashed : CircleDot
  return (
    <li className="flex items-start gap-3 py-2">
      <Icon size={17} aria-hidden className={done ? 'mt-0.5 shrink-0 text-success' : leftForLater ? 'mt-0.5 shrink-0 text-warning' : 'mt-0.5 shrink-0 text-fg-subtle'} />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-fg">{title}</p>
        <p className="text-[13px] text-fg-muted">
          {done ? 'Done.' : leftForLater ? `Left for later. You’ll find it in ${later ?? 'Settings'}.` : `Any time in ${later ?? 'Settings'}.`}
        </p>
      </div>
    </li>
  )
}

export default function DoneStep({ status, back }: SetupStepProps): JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const setup = useApiQuery('setup.status', undefined)
  const finish = useApiMutation('setup.finish', { invalidates: ['auth.status', 'setup.status'], onError: (err) => setError(err.message) })
  const states = new Map(setup.data?.steps.map((s) => [s.id, s.state]) ?? [])
  const shown = SETUP_STEPS.filter((s) => s.later)
  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent-text" aria-hidden>
          <PartyPopper size={24} strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-fg">{status.firmName ? `${status.firmName} is ready` : 'The practice is ready'}</h3>
          <p className="mt-1 text-sm text-fg-muted">Everything you need to start is in place. Anything left for later can be done from Settings whenever suits.</p>
        </div>
      </div>

      {setup.data && (
        <ul className="hairline mt-6 divide-y divide-line/10 border-y" aria-label="What setup covered">
          {shown.map((s) => (
            <StepLine key={s.id} title={s.title} state={states.get(s.id) ?? 'passed'} later={s.later} />
          ))}
        </ul>
      )}

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl bg-fg/[0.04] p-3.5">
          <Users size={17} aria-hidden className="mt-0.5 shrink-0 text-accent-text" />
          <p className="text-[13px] text-fg-muted">
            <span className="font-medium text-fg">Invite the rest of the practice</span> from Settings → People. Each person gets a code to set up their own sign-in.
          </p>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-fg/[0.04] p-3.5">
          <Building size={17} aria-hidden className="mt-0.5 shrink-0 text-accent-text" />
          <p className="text-[13px] text-fg-muted">
            <span className="font-medium text-fg">Add the firm’s references</span> (company number, VAT, UTR and PAYE) in Settings → Firm details.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-7 flex justify-between gap-2">
        <GlassButton variant="ghost" icon={ArrowLeft} onClick={back}>
          Back
        </GlassButton>
        <GlassButton variant="primary" size="lg" loading={finish.isPending} onClick={() => finish.mutate()} data-testid="setup-finish">
          Open AETERNA CRM
        </GlassButton>
      </div>
    </div>
  )
}
