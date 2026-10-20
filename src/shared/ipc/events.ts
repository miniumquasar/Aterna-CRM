/**
 * Main → renderer pushes, each with its payload.
 *
 * Domains append their events inside their own marked block, in BOTH places
 * below: the `ApiEvents` interface and the `EVENT_NAMES` table (the compiler
 * checks the two agree). Name events '<area>.<pastTense>' in camelCase.
 */

export interface ApiEvents {
  // ── system (backup domain) ────────────────────────────────────────────────
  // ── end system ────────────────────────────────────────────────────────────

  // ── appearance (design domain) ────────────────────────────────────────────
  /** Windows switched between light and dark; Auto follows it. */
  'appearance.osChanged': { dark: boolean }
  // ── end appearance ────────────────────────────────────────────────────────

  // ── auth ──────────────────────────────────────────────────────────────────
  /** This window's session ended (signed out elsewhere, idle, access removed, locked after wrong passwords). */
  'session.ended': { reason: 'signed_out' | 'idle' | 'access_removed' | 'expired' | 'locked' }
  // ── end auth ──────────────────────────────────────────────────────────────

  // ── licence ───────────────────────────────────────────────────────────────
  /** The licence state changed (key entered, expired, grace began); screens re-read it. */
  'licence.changed': { readOnly: boolean }
  // ── end licence ───────────────────────────────────────────────────────────

  // ── backup ────────────────────────────────────────────────────────────────
  // ── end backup ────────────────────────────────────────────────────────────

  // ── clients ───────────────────────────────────────────────────────────────
  // ── end clients ───────────────────────────────────────────────────────────

  // ── compliance ────────────────────────────────────────────────────────────
  // ── end compliance ────────────────────────────────────────────────────────

  // ── work ──────────────────────────────────────────────────────────────────
  // ── end work ──────────────────────────────────────────────────────────────

  // ── aml ───────────────────────────────────────────────────────────────────
  // ── end aml ───────────────────────────────────────────────────────────────

  // ── comms ─────────────────────────────────────────────────────────────────
  // ── end comms ─────────────────────────────────────────────────────────────

  // ── references ────────────────────────────────────────────────────────────
  // ── end references ────────────────────────────────────────────────────────

  // ── import ────────────────────────────────────────────────────────────────
  // ── end import ────────────────────────────────────────────────────────────

  // ── insights ──────────────────────────────────────────────────────────────
  /** The signed-in person's notifications changed; the bell re-reads its count. */
  'notifications.changed': { unread: number }
  // ── end insights ──────────────────────────────────────────────────────────

  // ── analytics ─────────────────────────────────────────────────────────────
  // ── end analytics ─────────────────────────────────────────────────────────

  // ── integrations ──────────────────────────────────────────────────────────
  // ── end integrations ──────────────────────────────────────────────────────
}

export type EventName = keyof ApiEvents & string

/** Every event name once; a missing or extra name is a compile error. */
const EVENT_NAMES = {
  // ── system ──
  // ── end system ──

  // ── appearance ──
  'appearance.osChanged': true,
  // ── end appearance ──

  // ── auth ──
  'session.ended': true,
  // ── end auth ──

  // ── licence ──
  'licence.changed': true,
  // ── end licence ──

  // ── backup ──
  // ── end backup ──

  // ── clients ──
  // ── end clients ──

  // ── compliance ──
  // ── end compliance ──

  // ── work ──
  // ── end work ──

  // ── aml ──
  // ── end aml ──

  // ── comms ──
  // ── end comms ──

  // ── references ──
  // ── end references ──

  // ── import ──
  // ── end import ──

  // ── insights ──
  'notifications.changed': true,
  // ── end insights ──

  // ── analytics ──
  // ── end analytics ──

  // ── integrations ──
  // ── end integrations ──
} as const satisfies Record<EventName, true>

/** The runtime list the bridge checks `on()` against. */
export const EVENTS: readonly EventName[] = Object.freeze(Object.keys(EVENT_NAMES) as EventName[])

export function isEventName(name: unknown): name is EventName {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(EVENT_NAMES, name)
}
