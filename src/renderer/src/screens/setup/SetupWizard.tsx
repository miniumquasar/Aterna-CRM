/**
 * The first-run wizard: firm details, first partner, recovery sheet, vault
 * passphrase, trial or licence, workbook import, then ready. Before anyone
 * can sign in it starts at the firm (or the partner, once the firm is
 * saved); once the first partner exists it carries on at the step it was
 * showing, which it records as it goes (setup.progress). Owned by the auth
 * domain; each step is a slot its domain fills (steps.ts). While nobody can
 * sign in, the backup domain's RestoreOffer (restore from a backup instead,
 * on a new PC) sits under the steps; keep it.
 */
import { Suspense, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Minus } from 'lucide-react'
import type { AuthStatus, SetupStatus, SetupStepState } from '@shared/contracts/auth'
import { PRODUCT_NAME } from '@shared/product'
import { BrandMark } from '@renderer/components/layout/BrandMark'
import { ModeSwitch } from '@renderer/components/layout/ModeSwitch'
import { RestoreOffer } from '@renderer/components/recovery/RestoreOffer'
import { ReauthHost } from '@renderer/components/session/ReauthDialog'
import { GlassPanel, Loading, LoadProblem } from '@renderer/components/ui'
import { apiQueryKey, useApiMutation, useApiQuery } from '@renderer/lib/api'
import { cx } from '@renderer/lib/cx'
import { SETUP_STEPS, type SetupDraft, type SetupStepId } from './steps'

const indexOf = (id: SetupStepId): number => SETUP_STEPS.findIndex((s) => s.id === id)
const PARTNER = indexOf('partner')

function Frame({ children, aside }: { children: ReactNode; aside?: ReactNode }): JSX.Element {
  return (
    <div className="relative flex h-full flex-col">
      <div className="app-backdrop" aria-hidden />
      <header className="titlebar relative z-10 flex shrink-0 items-center gap-2.5 pl-5">
        <BrandMark size={22} />
        <span className="font-display text-[13px] font-semibold tracking-[0.18em] text-fg">{PRODUCT_NAME}</span>
      </header>
      <main className="relative z-10 flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 py-10">
        <div className="grid w-full max-w-4xl grid-cols-1 gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
          {aside ?? <div />}
          {children}
        </div>
      </main>
      <ReauthHost />
    </div>
  )
}

export function SetupWizard({ status }: { status: AuthStatus }): JSX.Element {
  const setup = useApiQuery('setup.status', undefined, { staleTime: 0 })
  const queryClient = useQueryClient()
  const [chosen, setChosen] = useState<SetupStepId | null>(null)
  const [draft, setDraft] = useState<SetupDraft>({ firmName: status.firmName ?? '' })
  const progress = useApiMutation('setup.progress', {
    onSuccess: (data) => queryClient.setQueryData(apiQueryKey('setup.status', undefined), data)
  })

  if (setup.isPending) {
    return (
      <Frame>
        <Loading label="Opening setup…" />
      </Frame>
    )
  }
  if (setup.isError) {
    return (
      <Frame>
        <LoadProblem title="Setup couldn’t be opened" error={setup.error} onRetry={() => void setup.refetch()} retrying={setup.isFetching} />
      </Frame>
    )
  }

  const data: SetupStatus = setup.data
  // Once the partner exists, the steps before it are done and can't be reopened.
  const firstAvailable = status.setupNeeded ? 0 : PARTNER + 1
  const at = Math.max(firstAvailable, chosen ? indexOf(chosen) : indexOf(data.resumeAt))
  const current = SETUP_STEPS[at]
  const Step = current.component
  const stateOf = (id: SetupStepId): SetupStepState => data.steps.find((s) => s.id === id)?.state ?? 'todo'

  const go = (index: number): void => {
    const target = SETUP_STEPS[Math.max(firstAvailable, Math.min(SETUP_STEPS.length - 1, index))]
    setChosen(target.id)
    // Remembered once a partner can sign in, so the wizard carries on here after a restart.
    if (!status.setupNeeded && indexOf(target.id) > PARTNER) progress.mutate({ at: target.id })
  }

  const aside = (
    <aside>
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-fg-subtle">Setting up</p>
      <h1 className="mb-6 font-display text-2xl font-semibold text-fg">{status.firmName ?? 'Welcome'}</h1>
      <ol className="flex flex-col gap-1" aria-label="Setup steps">
        {SETUP_STEPS.map((s, i) => {
          const active = i === at
          const state = stateOf(s.id)
          const passed = i < at
          // Only a step whose domain says its work isn't done counts as left for later.
          const later = passed && state === 'skipped'
          const ticked = passed && !later
          return (
            <li key={s.id} aria-current={active ? 'step' : undefined} className={cx('flex items-start gap-3 rounded-xl px-3 py-2', active && 'glass')}>
              <span
                className={cx(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                  ticked ? 'border-accent bg-accent text-accent-fg' : later ? 'border-warning/60 text-warning' : active ? 'border-accent text-accent-text' : 'border-line/30 text-fg-subtle'
                )}
                aria-hidden
              >
                {ticked ? <Check size={12} strokeWidth={3} /> : later ? <Minus size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cx('block text-[13px] font-medium', active || passed ? 'text-fg' : 'text-fg-muted')}>{s.title}</span>
                <span className="block text-xs text-fg-subtle">{later ? 'Left for later' : s.description}</span>
                <span className="sr-only">{ticked ? ' (done)' : later ? ' (left for later)' : active ? ' (this step)' : ''}</span>
              </span>
            </li>
          )
        })}
      </ol>
      {status.setupNeeded && (
        <div className="mt-6 empty:hidden">
          <RestoreOffer />
        </div>
      )}
      <div className="mt-8">
        <ModeSwitch />
      </div>
    </aside>
  )

  return (
    <Frame aside={aside}>
      <GlassPanel tone="raised" padding="lg" as="section" aria-labelledby="setup-step-title">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-fg-subtle">
            Step {at + 1} of {SETUP_STEPS.length}
          </p>
          <div className="flex w-28 gap-1" aria-hidden>
            {SETUP_STEPS.map((s, i) => (
              <span key={s.id} className={cx('h-1 flex-1 rounded-full', i <= at ? 'bg-accent' : 'bg-fg/[0.1]')} />
            ))}
          </div>
        </div>
        <h2 id="setup-step-title" className="mb-5 mt-1 font-display text-xl font-semibold text-fg">
          {current.title}
        </h2>
        <Suspense fallback={<Loading />}>
          <Step
            key={current.id}
            status={status}
            draft={draft}
            updateDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            next={() => go(at + 1)}
            back={() => go(at - 1)}
            isFirst={at === firstAvailable}
          />
        </Suspense>
      </GlassPanel>
    </Frame>
  )
}
