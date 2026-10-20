/**
 * Every screen the app can show — the one list the sidebar, the UI store and
 * App.tsx all use. Add a screen here first; the compiler then points at every
 * place that must handle it, and the navigation test fails until the screen
 * has a place in the sidebar (navigation/nav.ts).
 */
export const NAV_ROUTES = [
  'dashboard', 'clients', 'companies', 'tasks', 'compliance', 'wip', 'interactions', 'communications', 'ai',
  'calendar', 'payments', 'reports', 'email-templates', 'settings', 'licence', 'onboarding-gaps', 'practice', 'references', 'client-file', 'data',
  'import', 'pulse', 'sentinel', 'oracle', 'fortress', 'about'
] as const

export type NavRoute = (typeof NAV_ROUTES)[number]

export const isNavRoute = (value: unknown): value is NavRoute =>
  typeof value === 'string' && (NAV_ROUTES as readonly string[]).includes(value)
