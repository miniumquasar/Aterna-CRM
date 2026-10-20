/**
 * Who can do what, by role. A partner can do everything a manager can, and a
 * manager everything a member of staff can.
 */
export const ROLES = ['partner', 'manager', 'staff'] as const
export type Role = (typeof ROLES)[number]

const RANK: Record<Role, number> = { staff: 1, manager: 2, partner: 3 }

export const ROLE_LABELS: Record<Role, string> = {
  partner: 'Partner',
  manager: 'Manager',
  staff: 'Staff'
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

/** True when `role` is `minimum` or above it. */
export function roleAtLeast(role: Role | null | undefined, minimum: Role): boolean {
  if (!role) return false
  return RANK[role] >= RANK[minimum]
}

/** The person signed in, as both processes see them. The renderer never holds a session token. */
export interface Actor {
  id: number
  username: string
  name: string
  role: Role
}
