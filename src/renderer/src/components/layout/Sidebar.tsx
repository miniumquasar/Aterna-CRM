/**
 * The grouped sidebar: Work, Clients, Compliance, Practice, System. Its
 * footer has the Day / Night / Auto switch, the version, About and help,
 * and the person signed in with Sign out.
 */
import { LogOut } from 'lucide-react'
import { ROLE_LABELS, type Actor } from '@shared/domain/roles'
import { appInfo } from '../../lib/api'
import { cx } from '../../lib/cx'
import { navFor } from '../../navigation/nav'
import { navigate, useRoute } from '../../stores/router'
import { useSignOut } from '../../stores/session'
import { Avatar, GlassButton, Tooltip } from '../ui'
import { ModeSwitch } from './ModeSwitch'

export interface SidebarProps {
  actor: Actor
}

export function Sidebar({ actor }: SidebarProps): JSX.Element {
  const route = useRoute()
  const signOut = useSignOut()
  const groups = navFor(actor.role, import.meta.env.DEV)
  const version = appInfo().versions.app
  return (
    <nav aria-label="Main" className="hairline relative z-10 flex w-60 shrink-0 flex-col border-r bg-surface/[0.18]">
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.id} className="mb-5 last:mb-0">
            <h2 className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle">{group.title}</h2>
            <ul className="flex flex-col gap-0.5">
              {group.routes.map((r) => {
                const active = route.id === r.id || (r.id === 'clients' && route.id === 'clientFile')
                const Icon = r.icon
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      data-nav={r.id}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => navigate(r.id)}
                      className={cx(
                        'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13.5px] transition duration-150 ease-glass',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                        active ? 'glass text-fg' : 'text-fg-muted hover:bg-fg/[0.06] hover:text-fg'
                      )}
                    >
                      {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent" aria-hidden />}
                      <Icon size={17} aria-hidden strokeWidth={1.8} className={active ? 'text-accent-text' : 'text-fg-subtle group-hover:text-fg-muted'} />
                      <span className="truncate">{r.title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="hairline flex flex-col gap-3 border-t p-3">
        <div className="flex items-center justify-between gap-2">
          <ModeSwitch />
          <button
            type="button"
            onClick={() => navigate('about')}
            className="rounded-md px-1.5 py-0.5 text-[11px] text-fg-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            aria-label={`About and help, version ${version}`}
          >
            v{version}
          </button>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
          <Avatar name={actor.name} size="sm" decorative />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-fg">{actor.name}</p>
            <p className="truncate text-[11px] text-fg-subtle">{ROLE_LABELS[actor.role]}</p>
          </div>
          <Tooltip content="Sign out" describe={false} side="top">
            <GlassButton variant="ghost" size="sm" iconOnly icon={LogOut} aria-label="Sign out" loading={signOut.isPending} onClick={() => signOut.mutate()} />
          </Tooltip>
        </div>
      </div>
    </nav>
  )
}
