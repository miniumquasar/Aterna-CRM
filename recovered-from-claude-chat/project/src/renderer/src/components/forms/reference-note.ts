import type { ReferenceCheckResult } from '@shared/references'

export const KEPT_ON_SAVE = 'Saving keeps it as entered and flags it under Issues.'

/**
 * What a typed reference looks like to the shared checks: nothing to say, or a
 * gentle note to show under the field. Saving is never blocked by it: a
 * reference that doesn't pass is kept as entered and flagged under Issues on
 * the client's file, not refused.
 */
export function referenceNote(value: string | null | undefined, check: (raw: string) => ReferenceCheckResult): string | undefined {
  const raw = (value ?? '').trim()
  if (!raw) return undefined
  const r = check(raw)
  if (!r.ok) return `${r.error} ${KEPT_ON_SAVE}`
  return r.warning
}

/** Whether a typed reference fails its check (and so will be flagged when saved). */
export const failsCheck = (value: string | null | undefined, check: (raw: string) => ReferenceCheckResult): boolean =>
  (value ?? '').trim() !== '' && !check((value ?? '').trim()).ok
