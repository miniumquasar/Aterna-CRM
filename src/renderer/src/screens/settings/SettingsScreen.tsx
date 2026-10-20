/**
 * Settings: the sections in sections.ts that the person's role opens, a
 * list at the left and the chosen section at the right.
 */
import { Suspense } from 'react'
import { Settings } from 'lucide-react'
import { roleAtLeast } from '@shared/domain/roles'
import { GlassCard, Loading, PageHeader } from '@renderer/components/ui'
import { cx } from '@renderer/lib/cx'
import type { ScreenProps } from '@renderer/navigation/routes'
import { navigate } from '@renderer/stores/router'
import { useActor } from '@renderer/stores/session'
import { SETTINGS_SECTIONS } from './sections'

export default function SettingsScreen({ params }: ScreenProps): JSX.Element {
  const actor = useActor()
  const sections = SETTINGS_SECTIONS.filter((s) => roleAtLeast(actor?.role, s.minRole))
  const current = sections.find((s) => s.id === params.section) ?? sections[0]
  const Section = current.component
  return (
    <>
      <PageHeader title="Settings" subtitle="Saved for the practice, or for you on this PC where it says so" icon={Settings} />
      <div className="grid grid-cols-[15rem_minmax(0,1fr)] gap-6">
        <nav aria-label="Settings sections">
          <ul className="flex flex-col gap-0.5">
            {sections.map((s) => {
              const active = s.id === current.id
              const Icon = s.icon
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    data-section={s.id}
                    onClick={() => navigate('settings', { section: s.id }, { replace: true })}
                    className={cx(
                      'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                      active ? 'glass text-fg' : 'text-fg-muted hover:bg-fg/[0.06] hover:text-fg'
                    )}
                  >
                    <Icon size={17} aria-hidden strokeWidth={1.8} className={cx('mt-0.5 shrink-0', active ? 'text-accent-text' : 'text-fg-subtle')} />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium">{s.title}</span>
                      <span className="block text-xs text-fg-subtle">{s.description}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
        <GlassCard title={current.title} subtitle={current.description} headingLevel={2} padding="lg">
          <Suspense fallback={<Loading />}>
            <Section />
          </Suspense>
        </GlassCard>
      </div>
    </>
  )
}
