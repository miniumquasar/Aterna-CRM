/**
 * The grouped sidebar, a floating glass panel: the groups from
 * navigation/nav.ts, each folding away (remembered for each person on this
 * PC; the group holding the current screen always shows), then the person
 * signed in with Sign out, the Day / Night / Auto switch, and the version
 * (which opens About and help).
 */
import { useId, useState } from 'react'
import { ChevronDown, LogOut } from 'lucide-react'
import { ROLE_LABELS, type Actor } from '@shared/domain/roles'
import { appInfo } from '../../lib/api'
import { cx } from '../../lib/cx'
import { navFor, type NavGroup } from '../../navigation/nav'
import type { NavGroupId } from '../../navigation/routes'
import { navigate, useRoute } from '../../stores/router'
import { useSignOut } from '../../stores/session'
import { Avatar, GlassButton, Tooltip } from '../ui'
import { ModeSwitch } from './ModeSwitch'

export interface SidebarProps {
  actor: Actor
}

const storageKey = (actorId: number): string => `aeterna.nav.folded.${actorId}`

function readFolded(actorId: number): Set<NavGroupId> {
  try {
    const raw = window.localStorage.getItem(storageKey(actorId))
    const ids = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(ids) ? (ids.filter((x) => typeof x === 'string') as NavGroupId[]) : [])
  } catch {
    return new Set()
  }
}

function saveFolded(actorId: number, folded: ReadonlySet<NavGroupId>): void {
  try {
    window.localStorage.setItem(storageKey(actorId), JSON.stringify([...folded]))
  } catch {
    // Storage can be unavailable; the groups simply open next time.
  }
}

export function Sidebar({ actor }: SidebarProps): JSX.Element {
  const route = useRoute()
  const signOut = useSignOut()
  const groups = navFor(actor.role, import.meta.env.DEV)
  const version = appInfo().versions.app
  const [folded, setFolded] = useState(() => readFolded(actor.id))
  const activeId = route.id === 'clientFile' ? 'clients' : route.id

  const toggle = (id: NavGroupId): void => {
    setFolded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveFolded(actor.id, next)
      return next
    })
  }

  return (
    <nav aria-label="Main" className="glass-panel relative z-10 flex w-[244px] shrink-0 flex-col rounded-panel" data-print="hide">
      <div className="flex-1 overflow-y-auto px-3 pb-2 pt-2">
        {groups.map((group) => (
          <NavSection
            key={group.id}
            group={group}
            activeId={activeId}
            open={!folded.has(group.id)}
            onToggle={() => toggle(group.id)}
          />
        ))}
      </div>
      <div className="flex flex-col gap-2 p-3 pt-1.5">
        <div className="hairline flex items-center gap-2.5 rounded-2xl border bg-fg/[0.035] px-2 py-1.5">
          <Avatar name={actor.name} size="sm" decorative />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-5 text-fg">{actor.name}</p>
            <p className="truncate text-[11.5px] leading-4 text-fg-muted">{ROLE_LABELS[actor.role]}</p>
          </div>
          <Tooltip content="Sign out" describe={false} side="top">
            <GlassButton variant="ghost" size="sm" iconOnly icon={LogOut} aria-label="Sign out" loading={signOut.isPending} onClick={() => signOut.mutate()} />
          </Tooltip>
        </div>
        <ModeSwitch />
        <button
          type="button"
          onClick={() => navigate('about')}
          className="self-start rounded-md px-1.5 py-0.5 text-[11.5px] text-fg-muted transition-colors hover:text-fg"
          aria-label={`About and help, version ${version}`}
        >
          Version {version}
        </button>
      </div>
    </nav>
  )
}

/** A folded group still shows the screen you are on, so the sidebar always says where you are. */
function NavSection({ group, activeId, open, onToggle }: { group: NavGroup; activeId: string; open: boolean; onToggle: () => void }): JSX.Element {
  const listId = useId()
  const routes = open ? group.routes : group.routes.filter((r) => r.id === activeId)
  return (
    <div className="mb-1.5 last:mb-0">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={onToggle}
          className="group/heading flex w-full items-center justify-between rounded-lg px-3 pb-1 pt-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.16em] text-fg-muted transition-colors hover:text-fg"
        >
          <span>{group.title}</span>
          <ChevronDown
            size={13}
            aria-hidden
            className={cx('transition duration-200', open ? 'opacity-0 group-hover/heading:opacity-70 group-focus-visible/heading:opacity-70' : '-rotate-90 opacity-70')}
          />
        </button>
      </h2>
      <ul id={listId} className="flex flex-col gap-0.5">
        {routes.map((r) => {
          const active = r.id === activeId
          const Icon = r.icon
          return (
            <li key={r.id} className="relative">
              {active && <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" aria-hidden />}
              <button
                type="button"
                data-nav={r.id}
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate(r.id)}
                className={cx(
                  'group flex h-[34px] w-full items-center gap-3 rounded-xl px-3 text-left text-[13.5px] font-medium transition duration-150 ease-glass',
                  active ? 'segment-on' : 'text-fg-muted hover:bg-fg/[0.06] hover:text-fg'
                )}
              >
                <Icon size={17} aria-hidden strokeWidth={1.8} className={cx('shrink-0', active ? 'text-accent-text' : 'text-fg-subtle group-hover:text-fg-muted')} />
                <span className="truncate">{r.title}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
