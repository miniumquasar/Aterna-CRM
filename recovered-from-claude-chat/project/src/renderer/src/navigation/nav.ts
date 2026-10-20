/**
 * The sidebar: about a dozen plain-language entries in five groups. Screens
 * that belong together sit as tabs inside one entry (Messages, Calls and
 * meetings and Templates are all "Communications"). Every route in routes.ts
 * has exactly one place: an entry, a tab, or one of the two spots outside the
 * sidebar (About in its footer, the AI assistant in the title bar).
 *
 * Plain data, no React: the sidebar, the tab bars and the go-to palette all
 * read it, and tests/renderer/navigation.test.ts checks it.
 */
import type { UserRole } from '@shared/types'
import type { NavRoute } from './routes'

export type NavGroupId = 'work' | 'clients' | 'compliance' | 'practice' | 'system'

export interface NavTab {
  route: NavRoute
  label: string
  /** Only these roles see the tab; everyone when absent. */
  roles?: readonly UserRole[]
  /** Other words the go-to palette matches. */
  keywords?: readonly string[]
}

export interface NavEntry {
  /** What the entry opens: its first tab when it has tabs. */
  route: NavRoute
  label: string
  /** A quieter second line: the module's own name (Pulse, Sentinel…). */
  sublabel?: string
  /** Screens shown as tabs inside this entry, the first being `route`. */
  tabs?: readonly NavTab[]
  keywords?: readonly string[]
}

export interface NavGroup {
  id: NavGroupId
  label: string
  entries: readonly NavEntry[]
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'work',
    label: 'Work',
    entries: [
      { route: 'dashboard', label: 'Home', keywords: ['dashboard', 'overview', 'today', 'start'] },
      { route: 'tasks', label: 'Tasks', keywords: ['to do', 'jobs', 'work'] },
      { route: 'calendar', label: 'Calendar', keywords: ['diary', 'deadlines', 'dates', 'month'] }
    ]
  },
  {
    id: 'clients',
    label: 'Clients',
    entries: [
      {
        route: 'clients',
        label: 'Clients',
        keywords: ['customers', 'list'],
        tabs: [
          { route: 'clients', label: 'All clients' },
          { route: 'client-file', label: 'Client file', keywords: ['everything', 'registers', 'record'] }
        ]
      },
      {
        route: 'communications',
        label: 'Communications',
        keywords: ['email', 'whatsapp', 'messages', 'comms'],
        tabs: [
          { route: 'communications', label: 'Messages', keywords: ['email', 'whatsapp', 'send'] },
          { route: 'interactions', label: 'Calls and meetings', keywords: ['interactions', 'phone', 'notes'] },
          { route: 'email-templates', label: 'Templates', keywords: ['letters', 'wording'] }
        ]
      },
      { route: 'companies', label: 'Companies House', keywords: ['search', 'company number', 'officers', 'filings'] }
    ]
  },
  {
    id: 'compliance',
    label: 'Compliance',
    entries: [
      {
        route: 'compliance',
        label: 'Compliance',
        tabs: [
          { route: 'compliance', label: 'HMRC and AML', keywords: ['submissions', 'anti money laundering', 'kyc', 'returns'] },
          { route: 'onboarding-gaps', label: 'Onboarding gaps', keywords: ['missing', 'id', 'engagement letter'] },
          { route: 'references', label: 'References and logins', keywords: ['utr', 'paye', 'vat number', 'authorisations', 'vault', 'passwords'] }
        ]
      },
      { route: 'sentinel', label: 'Risk', sublabel: 'Sentinel', keywords: ['risky clients', 'strike-off'] }
    ]
  },
  {
    id: 'practice',
    label: 'Practice',
    entries: [
      {
        route: 'payments',
        label: 'Billing',
        keywords: ['money', 'fees'],
        tabs: [
          { route: 'payments', label: 'Invoices and payments', keywords: ['receipts', 'owed', 'debtors', 'fees'] },
          { route: 'wip', label: 'Work in progress', keywords: ['wip', 'unbilled'] }
        ]
      },
      { route: 'reports', label: 'Reports', keywords: ['practice report', 'insights', 'export'] },
      { route: 'oracle', label: 'Forecast', sublabel: 'Oracle', keywords: ['workload', 'cash'] },
      { route: 'pulse', label: 'Activity', sublabel: 'Pulse', keywords: ['today', 'changes', 'health'] }
    ]
  },
  {
    id: 'system',
    label: 'System',
    entries: [
      {
        route: 'settings',
        label: 'Settings',
        tabs: [
          { route: 'settings', label: 'General', keywords: ['preferences', 'appearance', 'email', 'backups', 'companies house key'] },
          { route: 'practice', label: 'Practice details', keywords: ['agent', 'firm', 'practice logins'] },
          { route: 'data', label: 'Data', keywords: ['registers', 'tables', 'explore'] },
          { route: 'import', label: 'Import', roles: ['partner', 'manager'], keywords: ['workbook', 'spreadsheet', 'excel', 'master'] },
          { route: 'licence', label: 'Licence', keywords: ['key', 'trial', 'activation'] }
        ]
      },
      { route: 'fortress', label: 'Security', sublabel: 'Fortress', keywords: ['users', 'sign-in history', 'audit'] }
    ]
  }
]

/** Routes reached from outside the sidebar, and where. */
export const OUTSIDE_SIDEBAR: Readonly<Partial<Record<NavRoute, string>>> = {
  about: 'the sidebar footer',
  ai: 'the title bar'
}

export interface NavPlace {
  group: NavGroup
  entry: NavEntry
  /** The tab, when the route is one of the entry's tabs. */
  tab: NavTab | null
}

/** Where a route sits in the sidebar; null for About and the AI assistant. */
export function placeOf(route: NavRoute): NavPlace | null {
  for (const group of NAV_GROUPS) {
    for (const entry of group.entries) {
      if (entry.tabs) {
        const tab = entry.tabs.find((t) => t.route === route)
        if (tab) return { group, entry, tab }
      } else if (entry.route === route) {
        return { group, entry, tab: null }
      }
    }
  }
  return null
}

/** The tabs a role can see. */
export const tabsFor = (entry: NavEntry, role: UserRole | null | undefined): NavTab[] =>
  (entry.tabs ?? []).filter((t) => !t.roles || (role ? t.roles.includes(role) : false))

/** A screen the go-to palette can open. */
export interface NavTarget {
  route: NavRoute
  /** "Communications › Templates", or just "Tasks". */
  title: string
  words: string
}

/** Every screen a role can open, for the go-to palette. */
export function navTargets(role: UserRole | null | undefined): NavTarget[] {
  const out: NavTarget[] = []
  for (const group of NAV_GROUPS) {
    for (const entry of group.entries) {
      const base = [entry.label, entry.sublabel ?? '', ...(entry.keywords ?? [])]
      if (entry.tabs) {
        for (const tab of tabsFor(entry, role)) {
          out.push({ route: tab.route, title: `${entry.label} › ${tab.label}`, words: [...base, tab.label, ...(tab.keywords ?? [])].join(' ').toLowerCase() })
        }
      } else {
        out.push({ route: entry.route, title: entry.sublabel ? `${entry.label} (${entry.sublabel})` : entry.label, words: base.join(' ').toLowerCase() })
      }
    }
  }
  out.push({ route: 'ai', title: 'AI assistant', words: 'ai assistant ask question ollama' })
  out.push({ route: 'about', title: 'About and help', words: 'about help support version contact' })
  return out
}
