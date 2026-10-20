/**
 * The first-run wizard: firm details, first partner, recovery sheet, vault
 * passphrase, trial or licence, workbook import, then ready. Before anyone
 * can sign in it starts at the firm; once the first partner exists it
 * resumes after the partner step. Owned by the auth domain. While nobody can
 * sign in, the backup domain's RestoreOffer (restore from a backup instead,
 * on a new PC) sits under the steps; keep it.
 */
import { Suspense, useState } from 'react'
import { Check } from 'lucide-react'
import type { AuthStatus } from '@shared/contracts/auth'
import { PRODUCT_NAME } from '@shared/product'
import { BrandMark } from '@renderer/components/layout/BrandMark'
import { ModeSwitch } from '@renderer/components/layout/ModeSwitch'
import { RestoreOffer } from '@renderer/components/recovery/RestoreOffer'
import { GlassPanel, Loading } from '@renderer/components/ui'
import { cx } from '@renderer/lib/cx'
import { SETUP_STEPS, type SetupDraft } from './steps'

export function SetupWizard({ status }: { status: AuthStatus }): JSX.Element {
  const firstAvailable = status.setupNeeded ? 0 : SETUP_STEPS.findIndex((s) => !s.beforePartner)
  const [index, setIndex] = useState(firstAvailable)
  const [draft, setDraft] = useState<SetupDraft>({ firmName: status.firmName ?? '' })
  // Once the partner exists, the steps before it are done and can't be reopened.
  const at = Math.max(index, firstAvailable)
  const current = SETUP_STEPS[at]
  const Step = current.component

  return (
    <div className="relative flex h-full flex-col">
      <div className="app-backdrop" aria-hidden />
      <header className="titlebar relative z-10 flex items-center gap-2.5 pl-5">
        <BrandMark size={22} />
        <span className="font-display text-[13px] font-semibold tracking-[0.18em] text-fg">{PRODUCT_NAME}</span>
      </header>
      <main className="relative z-10 flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 py-10">
        <div className="grid w-full max-w-4xl grid-cols-[14rem_minmax(0,1fr)] gap-8">
          <aside>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-fg-subtle">Setting up</p>
            <h1 className="mb-6 font-display text-2xl font-semibold text-fg">Welcome</h1>
            <ol className="flex flex-col gap-1" aria-label="Setup steps">
              {SETUP_STEPS.map((s, i) => {
                const done = i < at
                const active = i === at
                return (
                  <li key={s.id} aria-current={active ? 'step' : undefined} className={cx('flex items-start gap-3 rounded-xl px-3 py-2', active && 'glass')}>
                    <span
                      className={cx(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                        done ? 'border-accent bg-accent text-accent-fg' : active ? 'border-accent text-accent-text' : 'border-line/30 text-fg-subtle'
                      )}
                      aria-hidden
                    >
                      {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={cx('block text-[13px] font-medium', active || done ? 'text-fg' : 'text-fg-muted')}>{s.title}</span>
                      <span className="block text-xs text-fg-subtle">{s.description}</span>
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
          <GlassPanel tone="raised" padding="lg" as="section" aria-labelledby="setup-step-title">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-fg-subtle">
              Step {at + 1} of {SETUP_STEPS.length}
            </p>
            <h2 id="setup-step-title" className="mb-5 mt-1 font-display text-xl font-semibold text-fg">
              {current.title}
            </h2>
            <Suspense fallback={<Loading />}>
              <Step
                key={current.id}
                status={status}
                draft={draft}
                updateDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                next={() => setIndex(Math.min(SETUP_STEPS.length - 1, at + 1))}
                back={() => setIndex(Math.max(firstAvailable, at - 1))}
                isFirst={at === firstAvailable}
              />
            </Suspense>
          </GlassPanel>
        </div>
      </main>
    </div>
  )
}
