/**
 * Every route in the app, declared once: id, title, sidebar group, icon,
 * minimum role and a lazily loaded screen. The sidebar (nav.ts), Go to…
 * (searchProviders.ts), the router and the smoke test all read this list.
 *
 * Keep this file free of browser-only code at module level: the smoke test
 * imports it under Node to visit every route.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import {
  Activity,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  Building,
  ClipboardList,
  Database,
  FileSpreadsheet,
  FolderOpen,
  Hourglass,
  House,
  Info,
  KeyRound,
  Landmark,
  ListChecks,
  MessagesSquare,
  Palette,
  Receipt,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Users,
  type LucideIcon
} from 'lucide-react'
import type { Role } from '@shared/domain/roles'

export const ROUTE_IDS = [
  'home',
  'tasks',
  'calendar',
  'clients',
  'communications',
  'deadlines',
  'hmrcAml',
  'risk',
  'billing',
  'wip',
  'forecast',
  'reports',
  'security',
  'settings',
  'activity',
  'onboardingGaps',
  'practice',
  'clientFile',
  'import',
  'data',
  'issues',
  'licence',
  'assistant',
  'about',
  'design'
] as const

export type RouteId = (typeof ROUTE_IDS)[number]

export type NavGroupId = 'work' | 'clients' | 'compliance' | 'practice' | 'system'

/** A route's parameters, as they appear in the address (#/clientFile?clientId=42). */
export type RouteParams = Readonly<Record<string, string | number>>

export interface ScreenProps {
  params: RouteParams
}

export interface RouteDef {
  id: RouteId
  title: string
  /** One line, for Go to… and the tooltip. */
  description: string
  /** The sidebar group, or null for a route with no sidebar entry. */
  group: NavGroupId | null
  icon: LucideIcon
  minRole: Role
  screen: LazyExoticComponent<ComponentType<ScreenProps>>
  /** Parameters the route can't open without (it is then left out of Go to…). */
  requiredParams?: readonly string[]
  /** Only in development builds (`npm run dev`). */
  devOnly?: boolean
  /** Other words Go to… finds it by. */
  keywords?: readonly string[]
}

type ScreenModule = { default: ComponentType<ScreenProps> }
const screen = (load: () => Promise<ScreenModule>): LazyExoticComponent<ComponentType<ScreenProps>> => lazy(load)

export const ROUTES: readonly RouteDef[] = [
  // ── Your day ──
  { id: 'home', title: 'Home', description: 'Today’s priorities, figures and activity', group: 'work', icon: House, minRole: 'staff', screen: screen(() => import('../screens/home/HomeScreen')), keywords: ['dashboard', 'today'] },
  { id: 'tasks', title: 'Tasks', description: 'Work to do, by person and due date', group: 'work', icon: ListChecks, minRole: 'staff', screen: screen(() => import('../screens/work/TasksScreen')), keywords: ['to do', 'jobs'] },
  { id: 'calendar', title: 'Calendar', description: 'Deadlines and tasks by month and week', group: 'work', icon: CalendarDays, minRole: 'staff', screen: screen(() => import('../screens/calendar/CalendarScreen')) },
  // ── Clients ──
  { id: 'clients', title: 'Clients', description: 'Every client, searchable and filterable', group: 'clients', icon: Users, minRole: 'staff', screen: screen(() => import('../screens/clients/ClientsScreen')), keywords: ['companies', 'customers'] },
  { id: 'communications', title: 'Communications', description: 'Emails, calls, meetings and notes with each client', group: 'clients', icon: MessagesSquare, minRole: 'staff', screen: screen(() => import('../screens/comms/CommunicationsScreen')), keywords: ['email', 'whatsapp', 'messages', 'templates'] },
  // ── Compliance ──
  { id: 'deadlines', title: 'Deadlines', description: 'Every open statutory deadline, overdue first', group: 'compliance', icon: CalendarClock, minRole: 'staff', screen: screen(() => import('../screens/compliance/DeadlinesScreen')), keywords: ['due', 'filing', 'vat', 'accounts', 'ct600'] },
  { id: 'hmrcAml', title: 'HMRC & AML', description: 'HMRC submissions and anti-money-laundering checks', group: 'compliance', icon: Landmark, minRole: 'staff', screen: screen(() => import('../screens/compliance/HmrcAmlScreen')), keywords: ['submissions', 'money laundering', 'due diligence'] },
  { id: 'risk', title: 'Risk', description: 'Clients ranked by risk, with the reasons', group: 'compliance', icon: ShieldAlert, minRole: 'staff', screen: screen(() => import('../screens/risk/RiskScreen')) },
  // ── Money ──
  { id: 'billing', title: 'Billing', description: 'Invoices, receipts and what is owed', group: 'practice', icon: Receipt, minRole: 'staff', screen: screen(() => import('../screens/work/BillingScreen')), keywords: ['invoices', 'payments', 'receivables'] },
  { id: 'wip', title: 'Work in progress', description: 'Time and work not yet billed', group: 'practice', icon: Hourglass, minRole: 'staff', screen: screen(() => import('../screens/work/WipScreen')), keywords: ['wip', 'time'] },
  { id: 'forecast', title: 'Forecast', description: 'Deadlines, work and money in the months ahead', group: 'practice', icon: TrendingUp, minRole: 'manager', screen: screen(() => import('../screens/forecast/ForecastScreen')) },
  { id: 'reports', title: 'Reports', description: 'The practice report, ready to export', group: 'practice', icon: ChartColumn, minRole: 'manager', screen: screen(() => import('../screens/reports/ReportsScreen')) },
  // ── The practice ──
  { id: 'security', title: 'Security', description: 'Database, licence, backups, sign-ins and the audit log', group: 'system', icon: ShieldCheck, minRole: 'manager', screen: screen(() => import('../screens/security/SecurityScreen')), keywords: ['audit log', 'sign-in history'] },
  { id: 'settings', title: 'Settings', description: 'Appearance, firm, people, backups and more', group: 'system', icon: Settings, minRole: 'staff', screen: screen(() => import('../screens/settings/SettingsScreen')), keywords: ['preferences', 'appearance', 'theme'] },
  // ── No sidebar entry ──
  // Activity from the bell and Home, Onboarding gaps from Clients and Home,
  // Practice details from Settings → Firm details; all from Go to….
  { id: 'activity', title: 'Activity', description: 'Today’s changes, Companies House news and notifications', group: null, icon: Activity, minRole: 'staff', screen: screen(() => import('../screens/activity/ActivityScreen')), keywords: ['notifications', 'today'] },
  { id: 'onboardingGaps', title: 'Onboarding gaps', description: 'What each client still needs to provide', group: null, icon: ClipboardList, minRole: 'staff', screen: screen(() => import('../screens/compliance/OnboardingGapsScreen')), keywords: ['missing', 'requirements'] },
  { id: 'practice', title: 'Practice details', description: 'The firm’s own references and renewals', group: null, icon: Building, minRole: 'staff', screen: screen(() => import('../screens/practice/PracticeScreen')), keywords: ['firm', 'references', 'aml supervisor', 'insurance'] },
  { id: 'clientFile', title: 'Client file', description: 'One client’s record', group: null, icon: FolderOpen, minRole: 'staff', screen: screen(() => import('../screens/clients/ClientFileScreen')), requiredParams: ['clientId'] },
  { id: 'import', title: 'Import', description: 'Bring in the master workbook', group: null, icon: FileSpreadsheet, minRole: 'partner', screen: screen(() => import('../screens/import/ImportScreen')), keywords: ['workbook', 'excel', 'spreadsheet'] },
  { id: 'data', title: 'Data explorer', description: 'Every register, searchable and sortable', group: null, icon: Database, minRole: 'manager', screen: screen(() => import('../screens/data/DataExplorer')), keywords: ['registers', 'tables'] },
  { id: 'issues', title: 'Data issues', description: 'Things in the data that need a look', group: null, icon: TriangleAlert, minRole: 'staff', screen: screen(() => import('../screens/data/IssuesScreen')), keywords: ['problems', 'checks'] },
  { id: 'licence', title: 'Licence', description: 'The licence, its validity and key entry', group: null, icon: KeyRound, minRole: 'staff', screen: screen(() => import('../screens/licence/LicenceScreen')), keywords: ['key', 'trial', 'renew'] },
  { id: 'assistant', title: 'Assistant', description: 'The local assistant, on this PC', group: null, icon: Sparkles, minRole: 'staff', screen: screen(() => import('../screens/assistant/AssistantScreen')), keywords: ['ai', 'ollama', 'chat'] },
  { id: 'about', title: 'About and help', description: 'Version, guides and support', group: null, icon: Info, minRole: 'staff', screen: screen(() => import('../screens/about/AboutScreen')), keywords: ['help', 'support', 'version'] },
  { id: 'design', title: 'Design gallery', description: 'Every component in the current theme', group: null, icon: Palette, minRole: 'staff', screen: screen(() => import('../screens/system/DesignGallery')), devOnly: true }
]

export const ROUTE_BY_ID: Readonly<Record<RouteId, RouteDef>> = Object.freeze(Object.fromEntries(ROUTES.map((r) => [r.id, r])) as Record<RouteId, RouteDef>)

export function isRouteId(value: unknown): value is RouteId {
  return typeof value === 'string' && (ROUTE_IDS as readonly string[]).includes(value)
}
