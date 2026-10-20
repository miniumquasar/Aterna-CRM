import { useEffect, useMemo, useState } from 'react'

/** The register's client statuses, used until the practice's own list loads (or if it can't be read). */
export const DEFAULT_CLIENT_STATUSES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'Active', label: 'Active' },
  { value: 'Prospect', label: 'Prospect' },
  { value: 'Dormant', label: 'Dormant' },
  { value: 'Review required', label: 'Review required' },
  { value: 'Former client', label: 'Former client' },
  { value: 'Ceased', label: 'Ceased' },
  { value: 'Dissolved', label: 'Dissolved' }
]

/**
 * The statuses a client can be given: the practice's list of client statuses,
 * plus the client's current status when it isn't on that list — kept, and
 * marked as an older status, so opening and saving a client never changes it
 * by accident.
 */
export function useClientStatuses(current?: string | null): Array<{ value: string; label: string }> {
  const [list, setList] = useState<ReadonlyArray<{ value: string; label: string }>>(DEFAULT_CLIENT_STATUSES)
  useEffect(() => {
    let live = true
    window.api.registers
      .getLookups('client_status')
      .then((r) => {
        if (!live || !r.ok || r.data.length === 0) return
        setList(r.data.filter((v) => v.active !== 0).map((v) => ({ value: v.value_key, label: v.label })))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  return useMemo(() => withCurrent(list, current), [list, current])
}

export function withCurrent(list: ReadonlyArray<{ value: string; label: string }>, current?: string | null): Array<{ value: string; label: string }> {
  const out = [...list]
  const now = current?.trim()
  if (now && !out.some((s) => s.value.toLowerCase() === now.toLowerCase())) out.push({ value: now, label: `${now} (older status)` })
  return out
}
