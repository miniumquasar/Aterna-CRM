import { useRef, type KeyboardEvent } from 'react'
import { useAuthStore } from '@renderer/stores/crm/auth'
import { placeOf, tabsFor } from '@renderer/navigation/nav'
import type { NavRoute } from '@renderer/navigation/routes'

/** Screens reached from outside the sidebar, and what their header says. */
const OUTSIDE: Partial<Record<NavRoute, { group: string; title: string }>> = {
  about: { group: 'Help', title: 'About and help' }
}

/** Home greets you with its own heading, and the assistant fills the window with its own bar. */
const OWN_HEADER: ReadonlySet<NavRoute> = new Set(['dashboard', 'ai'])

/** What the screen is called: its sidebar entry (and tab), for the heading and for what a screen reader announces. */
export function screenTitle(route: NavRoute): { group: string; title: string; tab: string | null } | null {
  const place = placeOf(route)
  if (place) return { group: place.group.label, title: place.entry.label, tab: place.tab && place.entry.tabs && place.entry.tabs.length > 1 ? place.tab.label : null }
  const outside = OUTSIDE[route]
  return outside ? { ...outside, tab: null } : route === 'ai' ? { group: 'Assistant', title: 'AI assistant', tab: null } : null
}

/**
 * The top of every screen: which group it is in, its name as the page's one
 * heading, and — for a sidebar entry that holds several screens
 * (Communications: Conversations and Templates) — its tabs. Arrow keys move
 * between tabs, Home and End go to the first and last.
 */
export function ScreenHeader({ route, onNavigate }: { route: NavRoute; onNavigate: (route: NavRoute) => void }): JSX.Element | null {
  const role = useAuthStore((s) => s.user?.role)
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  if (OWN_HEADER.has(route)) return null
  const place = placeOf(route)
  const named = screenTitle(route)
  if (!named) return null
  const tabs = place?.entry.tabs ? tabsFor(place.entry, role) : []
  const showTabs = tabs.length >= 2
  const current = tabs.findIndex((t) => t.route === route)

  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const last = tabs.length - 1
    const next =
      e.key === 'ArrowRight' ? (current >= last ? 0 : current + 1)
        : e.key === 'ArrowLeft' ? (current <= 0 ? last : current - 1)
          : e.key === 'Home' ? 0
            : e.key === 'End' ? last
              : null
    if (next === null) return
    e.preventDefault()
    onNavigate(tabs[next].route)
    requestAnimationFrame(() => refs.current[next]?.focus())
  }

  return (
    <div className={`flex flex-wrap items-end justify-between gap-3 border-b border-white/5 px-10 pt-6 ${showTabs ? '' : 'pb-4'}`} data-testid="screen-header">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/55">{named.group}</p>
        {/* The skip link lands here, so it can take focus without a ring of its own. */}
        <h1 id="screen-title" tabIndex={-1} className="text-xl font-light tracking-tight text-white/90 focus:outline-none">
          {named.title}
          {/* With tabs, the heading names the tab too, for screen readers ("Clients: Client file"); the tab bar shows it on screen. */}
          {showTabs && named.tab && named.tab !== named.title && <span className="sr-only">: {named.tab}</span>}
        </h1>
      </div>
      {showTabs && (
        <div role="tablist" aria-label={named.title} className="-mb-px flex flex-wrap gap-1" onKeyDown={onKey}>
          {tabs.map((tab, i) => {
            const selected = tab.route === route
            return (
              <button
                key={tab.route}
                ref={(el) => {
                  refs.current[i] = el
                }}
                type="button"
                role="tab"
                id={`tab-${tab.route}`}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                data-testid={`tab-${tab.route}`}
                onClick={() => onNavigate(tab.route)}
                className={`rounded-t-xl border-b-2 px-4 py-2.5 text-sm transition-colors ${
                  selected ? 'border-aether text-aether' : 'border-transparent text-white/60 hover:text-white/85'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
