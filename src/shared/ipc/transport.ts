/**
 * The two Electron IPC channels the bridge uses underneath the typed contract.
 * Nothing else crosses between the processes.
 */
export const INVOKE_CHANNEL = 'aeterna:invoke'
export const EVENT_CHANNEL = 'aeterna:event'
