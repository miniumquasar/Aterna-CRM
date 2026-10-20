import type { NotificationTarget } from '@shared/types'
import { isNavRoute } from '@renderer/navigation/routes'
import { useUiStore } from '@renderer/stores/ui'
import { useAmlTarget, useClientFileTarget, useClientListTarget, useCommsTarget, useDeadlinesTarget, usePulseTarget } from '@renderer/screens/crm/data/target'
import { useReferenceTarget } from '@renderer/screens/crm/references/target'

/**
 * Goes where a notification or a risk reason points: the client file, the
 * deadline list, a client's conversation, their Companies House changes, their
 * AML check or their authorisations. A target the app doesn't know is ignored.
 */
export function openTarget(target: NotificationTarget | null | undefined): void {
  if (!target || !isNavRoute(target.route)) return
  const ref = target.clientRef ?? null
  switch (target.route) {
    case 'client-file':
      useClientFileTarget.getState().setClientRef(ref)
      break
    case 'clients':
      if (target.clientId) useClientListTarget.getState().select(target.clientId)
      break
    case 'deadlines':
      if (target.window) useDeadlinesTarget.getState().show(target.window)
      break
    case 'communications':
      if (ref) useCommsTarget.getState().open(ref)
      break
    case 'pulse':
      usePulseTarget.getState().focus(ref)
      break
    case 'references':
      if (ref) useReferenceTarget.getState().setClientRef(ref)
      break
    case 'compliance':
      if (ref) useAmlTarget.getState().open(ref)
      break
    default:
      break
  }
  useUiStore.getState().navigateTo(target.route)
}

