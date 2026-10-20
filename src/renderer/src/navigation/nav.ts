/**
 * The sidebar's groups, in order. Each route's group comes from routes.ts;
 * this file says which groups there are, their names and their order.
 */
import { roleAtLeast, type Role } from '@shared/domain/roles'
import { ROUTES, type NavGroupId, type RouteDef } from './routes'

export interface NavGroupDef {
  id: NavGroupId
  title: string
}

export const NAV_GROUPS: readonly NavGroupDef[] = [
  { id: 'work', title: 'Work' },
  { id: 'clients', title: 'Clients' },
  { id: 'compliance', title: 'Compliance' },
  { id: 'practice', title: 'Practice' },
  { id: 'system', title: 'System' }
]

export interface NavGroup extends NavGroupDef {
  routes: RouteDef[]
}

/** Whether a person with `role` can open the route in this build. */
export function canOpen(route: RouteDef, role: Role | null | undefined, dev: boolean): boolean {
  return roleAtLeast(role, route.minRole) && (!route.devOnly || dev)
}

/** The sidebar for a person: each group with the routes they can open (empty groups left out). */
export function navFor(role: Role | null | undefined, dev: boolean): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, routes: ROUTES.filter((r) => r.group === g.id && canOpen(r, role, dev)) })).filter((g) => g.routes.length > 0)
}
