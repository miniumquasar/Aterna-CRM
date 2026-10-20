import { useCallback, useEffect } from 'react'
import { create } from 'zustand'
import type { IpcResult, LicenceActivation, LicenceStatus } from '@shared/types'

/** "2027-10-01" → "1 October 2027" */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export const dayCount = (n: number): string => (n === 1 ? '1 day' : `${n} days`)

/** Whose licence this is, in a few words: "Licensed to Firm Ltd", "Free trial" or "Trial ended". */
export function licenceLabel(s: LicenceStatus | null): string {
  if (!s) return ''
  if (s.licensedTo) return `Licensed to ${s.licensedTo}`
  return s.state === 'trial' ? 'Free trial' : 'Trial ended'
}

/** The window's title: the product, then whose licence it is. */
export function licenceTitle(s: LicenceStatus | null): string {
  const label = licenceLabel(s)
  return label ? `AETERNA CRM — ${label}` : 'AETERNA CRM'
}

/** One copy of the status for every screen that shows it. */
const useLicenceStore = create<{ status: LicenceStatus | null; setStatus: (s: LicenceStatus) => void }>((set) => ({
  status: null,
  setStatus: (status) => set({ status })
}))

let listening = false

async function refreshStatus(): Promise<void> {
  try {
    useLicenceStore.getState().setStatus(await window.api.licence.getStatus())
  } catch {
    /* main process still starting; the next refresh will catch up */
  }
}

/** Listens once for the whole app: on activation, on reminders, and every 30 minutes. */
function listen(): void {
  if (listening) return
  listening = true
  void refreshStatus()
  window.api.licence.onChanged(useLicenceStore.getState().setStatus)
  window.api.licence.onReminder(useLicenceStore.getState().setStatus)
  setInterval(() => void refreshStatus(), 30 * 60_000)
}

/** Live licence status, shared by every screen. */
export function useLicence(): {
  status: LicenceStatus | null
  refresh: () => Promise<void>
  activate: (key: string) => Promise<IpcResult<LicenceActivation>>
} {
  const status = useLicenceStore((s) => s.status)
  useEffect(listen, [])

  const activate = useCallback(async (key: string) => {
    const result = await window.api.licence.activate(key)
    if (result.ok) useLicenceStore.getState().setStatus(result.data.status)
    return result
  }, [])

  return { status, refresh: refreshStatus, activate }
}
