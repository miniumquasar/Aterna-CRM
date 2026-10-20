/**
 * Small pieces the People screens share: role and status badges, copying to
 * the clipboard, and a temporary password suggestion. Owned by the auth
 * domain.
 */
import { CircleUserRound, KeyRound, LockKeyhole, ShieldOff } from 'lucide-react'
import type { Person } from '@shared/contracts/auth'
import { ROLE_LABELS, type Role } from '@shared/domain/roles'
import { GlassBadge, toast, type BadgeTone } from '@renderer/components/ui'

const ROLE_TONE: Record<Role, BadgeTone> = { partner: 'accent', manager: 'info', staff: 'neutral' }

export function RoleBadge({ role, size = 'sm' }: { role: Role; size?: 'sm' | 'md' }): JSX.Element {
  return (
    <GlassBadge tone={ROLE_TONE[role]} size={size}>
      {ROLE_LABELS[role]}
    </GlassBadge>
  )
}

/** What stands out about a person's sign-in, most important first. */
export function PersonBadges({ person }: { person: Person }): JSX.Element {
  return (
    <span className="flex flex-wrap gap-1.5">
      {!person.active && (
        <GlassBadge tone="neutral" size="sm" icon={ShieldOff}>
          Access off
        </GlassBadge>
      )}
      {person.locked && (
        <GlassBadge tone="danger" size="sm" icon={LockKeyhole}>
          Locked
        </GlassBadge>
      )}
      {person.mustChangePassword && (
        <GlassBadge tone="warning" size="sm" icon={KeyRound}>
          New password due
        </GlassBadge>
      )}
      {person.active && person.signedIn && (
        <GlassBadge tone="success" size="sm" dot>
          Signed in now
        </GlassBadge>
      )}
      {person.active && !person.locked && !person.mustChangePassword && !person.signedIn && (
        <GlassBadge tone="neutral" size="sm" icon={CircleUserRound}>
          Can sign in
        </GlassBadge>
      )}
    </span>
  )
}

/** 'a member of staff', 'a manager', 'a partner'. */
export function roleNoun(role: Role): string {
  return role === 'staff' ? 'a member of staff' : `a ${role}`
}

/** Copies text, saying so; if the clipboard can't be reached, says what to do instead. */
export async function copyText(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  } catch {
    toast.error(`The ${what.toLowerCase()} couldn’t be copied`, { description: 'Select it and copy it with Ctrl+C instead.' })
  }
}

const SAFE = 'abcdefghjkmnpqrstuvwxyz23456789'

/** A temporary password that is easy to read out and type: 'q7mz-4hxp-t2wk'. */
export function suggestTemporaryPassword(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, (b) => SAFE[b % SAFE.length])
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((g) => g.join('')).join('-')
}
