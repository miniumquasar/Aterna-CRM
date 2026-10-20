/**
 * Clients the practice no longer acts for.
 *
 * A client whose status is Former client, Ceased or Dissolved, or whose
 * company Companies House lists as dissolved, is a "no longer" client. Their
 * records are kept in full and can always be found and opened, but they are
 * left out of everyday work: deadlines, risk, the forecast, the Companies House
 * check and onboarding, and the client list's everyday view. Money they still
 * owe stays in Billing until it is paid or written off.
 *
 * One definition, used by the main process (as SQL, records/current.ts) and
 * the screens, so every count agrees.
 */

/** The statuses that mean the practice no longer acts for the client, as the status list shows them. */
export const NO_LONGER_STATUSES = ['Former client', 'Ceased', 'Dissolved'] as const

const NO_LONGER = new Set(NO_LONGER_STATUSES.map((s) => s.toLowerCase()))

export interface ClientStanding {
  status?: string | null
  company_status?: string | null
}

const companyDissolved = (c: ClientStanding): boolean => (c.company_status ?? '').trim().toLowerCase() === 'dissolved'

/** Whether the practice no longer acts for the client. */
export function isNoLongerClient(c: ClientStanding): boolean {
  return NO_LONGER.has((c.status ?? '').trim().toLowerCase()) || companyDissolved(c)
}

/** Why a client is a no-longer client, in the words to show beside their name; null for a current client. */
export function noLongerLabel(c: ClientStanding): string | null {
  const status = (c.status ?? '').trim()
  const known = NO_LONGER_STATUSES.find((s) => s.toLowerCase() === status.toLowerCase())
  if (known) return known
  return companyDissolved(c) ? 'Dissolved' : null
}

/** Which clients a list shows: current ones (the everyday view), no-longer ones, or everyone. */
export type ClientView = 'current' | 'no_longer' | 'all'

export const CLIENT_VIEW_LABELS: Record<ClientView, string> = {
  current: 'Current',
  no_longer: 'No longer clients',
  all: 'Everyone'
}

export const inClientView = (c: ClientStanding, view: ClientView): boolean =>
  view === 'all' || (view === 'current') === !isNoLongerClient(c)
