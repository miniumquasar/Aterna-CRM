import { useUiStore } from '@renderer/stores/ui'
import { useClientFileTarget, useClientListTarget } from '@renderer/screens/crm/data/target'

/**
 * Opens a client from anywhere (Home, the go-to palette, a worklist): its
 * client file, with everything held about it. A client with no client code has
 * no client file yet, so the Clients screen opens with it selected instead.
 */
export function openClient(client: { id: number; ref: string | null }): void {
  const { navigateTo } = useUiStore.getState()
  if (client.ref) {
    useClientFileTarget.getState().setClientRef(client.ref)
    navigateTo('client-file')
  } else {
    useClientListTarget.getState().select(client.id)
    navigateTo('clients')
  }
}
