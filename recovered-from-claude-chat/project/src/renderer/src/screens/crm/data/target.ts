import { create } from 'zustand'

/** What the Data screen should open on (set by other screens before navigating). */
export const useDataTarget = create<{ table: string | null; clientRef: string | null; open: (table: string | null, clientRef: string | null) => void }>((set) => ({
  table: null,
  clientRef: null,
  open: (table, clientRef) => set({ table, clientRef })
}))

/** Which client the Client file screen should open on. */
export const useClientFileTarget = create<{ clientRef: string | null; setClientRef: (clientRef: string | null) => void }>((set) => ({
  clientRef: null,
  setClientRef: (clientRef) => set({ clientRef })
}))

/**
 * What the Clients screen should do when it opens: select a client (one with
 * no client code, which has no client file), or start a new client.
 */
export const useClientListTarget = create<{
  clientId: number | null
  newClient: boolean
  select: (clientId: number | null) => void
  startNewClient: (on: boolean) => void
}>((set) => ({
  clientId: null,
  newClient: false,
  select: (clientId) => set({ clientId }),
  startNewClient: (newClient) => set({ newClient })
}))

/** Which client's Companies House changes Activity should show (a notification or Risk sets it); null shows every client's. */
export const usePulseTarget = create<{ clientRef: string | null; focus: (clientRef: string | null) => void }>((set) => ({
  clientRef: null,
  focus: (clientRef) => set({ clientRef })
}))

/** Which client's AML check Compliance → HMRC and AML should open (Risk sets it). */
export const useAmlTarget = create<{ clientRef: string | null; open: (clientRef: string | null) => void }>((set) => ({
  clientRef: null,
  open: (clientRef) => set({ clientRef })
}))

