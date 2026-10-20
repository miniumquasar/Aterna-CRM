import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  CheckSquare,
  House,
  LockKeyhole,
  LogOut,
  MessagesSquare,
  PoundSterling,
  Radar,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon
} from 'lucide-react'
import { useAuthStore } from '@renderer/stores/crm/auth'
import { licenceLabel, useLicence } from '@renderer/hooks/useLicence'
import { useMotionLevel } from '@renderer/lib/motion'
import { signOut } from '@renderer/lib/session'
import { NAV_GROUPS, placeOf } from '@renderer/navigation/nav'
import type { NavRoute } from '@renderer/navigation/routes'
import { EASE_PREMIUM } from '../constants'

export type { NavRoute }

/** The icon for each sidebar entry (keyed by the entry's route). */
const ICONS: Partial<Record<NavRoute, LucideIcon>> = {
  dashboard: House,
  tasks: CheckSquare,
  calendar: CalendarDays,
  clients: Users,
  communications: MessagesSquare,
  companies: Building2,
  compliance: ShieldCheck,
  sentinel: Radar,
  payments: PoundSterling,
  reports: BarChart3,
  oracle: TrendingUp,
  pulse: Activity,
  settings: Settings,
  fortress: LockKeyhole
}

interface AetherSidebarProps {
  activeRoute: NavRoute
  onNavigate: (route: NavRoute) => void
  /** A count to show beside an entry (alerts waiting, for example). */
  badges?: Partial<Record<NavRoute, number>>
}

/**
 * The sidebar: five groups of plain-language entries (navigation/nav.ts). An
 * entry with tabs stays highlighted on every one of its tabs.
 */
export function AetherSidebar({ activeRoute, onNavigate, badges = {} }: AetherSidebarProps): JSX.Element {
  const motionLevel = useMotionLevel()
  const { status } = useLicence()
  const activeEntry = placeOf(activeRoute)?.entry.route ?? null

  return (
    <aside className="flex w-60 flex-shrink-0 flex-col border-r border-white/5 bg-void/40 backdrop-blur-xl" aria-label="Main">
      {/* Logo lockup */}
      <div className="border-b border-white/5 px-5 pb-5 pt-16">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-aether/30 bg-gradient-to-br from-aether/30 to-divine/20 shadow-aether">
            <div className="h-4 w-4 rounded-full bg-aether shadow-[0_0_16px_rgba(0,245,232,0.8)]" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-light tracking-wide text-white">AETERNA CRM</div>
            <div className="truncate text-[10px] text-white/35" title={status?.licensedTo ?? undefined}>
              {status?.licensedTo ?? 'Practice CRM'}
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} role="group" aria-labelledby={`nav-group-${group.id}`}>
            <p id={`nav-group-${group.id}`} className="px-3 pb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/30">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.entries.map((entry) => {
                const active = entry.route === activeEntry
                const Icon = ICONS[entry.route] ?? Settings
                const badge = badges[entry.route] ?? 0
                return (
                  <li key={entry.route}>
                    <motion.button
                      type="button"
                      onClick={() => onNavigate(entry.route)}
                      aria-current={active ? 'page' : undefined}
                      data-testid={`nav-${entry.route}`}
                      whileHover={motionLevel === 'none' ? undefined : { x: 2 }}
                      whileTap={motionLevel === 'none' ? undefined : { scale: 0.98 }}
                      transition={{ duration: 0.2, ease: EASE_PREMIUM }}
                      className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-200 ${
                        active ? 'bg-aether/10 text-aether' : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId={motionLevel === 'none' ? undefined : 'sidebar-active-indicator'}
                          transition={{ duration: 0.35, ease: EASE_PREMIUM }}
                          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-aether shadow-[0_0_10px_rgba(0,245,232,0.6)]"
                        />
                      )}
                      <Icon size={16} className="flex-shrink-0" aria-hidden />
                      <span className="flex min-w-0 flex-1 items-baseline gap-2">
                        <span className="truncate text-[13px] font-medium tracking-wide">{entry.label}</span>
                        {entry.sublabel && <span className="truncate text-[10px] text-white/30">{entry.sublabel}</span>}
                      </span>
                      {badge > 0 && (
                        <span className="rounded-full bg-divine/90 px-1.5 text-[10px] font-semibold tabular-nums text-black" aria-label={`${badge} waiting`}>
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </motion.button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <SidebarFooter onAbout={() => onNavigate('about')} />
    </aside>
  )
}

/** Who is signed in, signing out, whose licence, and the version (opens About). */
function SidebarFooter({ onAbout }: { onAbout: () => void }): JSX.Element {
  const user = useAuthStore((s) => s.user)
  const { status } = useLicence()
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.api.getAppVersion().then(setVersion).catch(() => setVersion(''))
  }, [])
  return (
    <div className="space-y-2 border-t border-white/5 p-4">
      {user && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-white/80">{user.name}</p>
            <p className="text-[10px] capitalize text-white/40">{user.role}</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/[0.06]"
            data-testid="sign-out"
          >
            <LogOut size={12} aria-hidden /> Sign out
          </button>
        </div>
      )}
      {status && (
        <p className="truncate text-[10px] text-white/45" title={licenceLabel(status)}>
          {licenceLabel(status)}
        </p>
      )}
      <button type="button" onClick={onAbout} className="text-left text-[10px] text-white/30 underline-offset-2 hover:text-white/60 hover:underline">
        AETERNA CRM{version ? ` ${version}` : ''} · About and help
      </button>
    </div>
  )
}
