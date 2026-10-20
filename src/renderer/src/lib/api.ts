/**
 * The renderer's one way to the main process.
 *
 *   const clients = useApiQuery('clients.list', { status: 'current' })
 *   const save = useApiMutation('clients.update', { invalidates: ['clients.list', 'clients.get'] })
 *   save.mutate({ id, values })
 *
 * Query keys are [channel, req]. A mutation invalidates every query of each
 * channel it names. A refused call throws an ApiCallError carrying the
 * contract's code, message and field. Screens never touch window.aeterna;
 * where it is absent (the browser preview) the demo backend answers.
 */
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query'
import type { BridgeInfo } from '@shared/ipc/bridge'
import type { Channel, Req, Res } from '@shared/ipc/contract'
import type { ApiEvents, EventName } from '@shared/ipc/events'
import { fail, type ApiError, type ErrorCode, type Result } from '@shared/ipc/result'
import { demoInfo, demoInvoke, demoOn } from '../demo/backend'

/** A refused call, as react-query sees it. */
export class ApiCallError extends Error {
  readonly code: ErrorCode
  readonly field?: string
  readonly channel: Channel

  constructor(error: ApiError, channel: Channel) {
    super(error.message)
    this.name = 'ApiCallError'
    this.code = error.code
    this.channel = channel
    if (error.field !== undefined) this.field = error.field
  }
}

/** True inside the desktop app; false in the browser preview. */
export function bridgeAvailable(): boolean {
  return typeof window !== 'undefined' && window.aeterna !== undefined
}

/** Calls a channel and returns its Result. Never throws. */
export async function invoke<C extends Channel>(channel: C, req: Req<C>): Promise<Result<Res<C>>> {
  const bridge = typeof window !== 'undefined' ? window.aeterna : undefined
  try {
    return bridge ? await bridge.invoke(channel, req) : await demoInvoke(channel, req)
  } catch {
    return fail('unavailable', 'AETERNA CRM couldn’t reach its main process. Restart the app if this keeps happening.')
  }
}

/** Calls a channel and returns its data, or throws an ApiCallError. */
export async function call<C extends Channel>(channel: C, req: Req<C>): Promise<Res<C>> {
  const result = await invoke(channel, req)
  if (!result.ok) throw new ApiCallError(result.error, channel)
  return result.data
}

export function apiQueryKey<C extends Channel>(channel: C, req: Req<C>): readonly [C, Req<C> | null] {
  return [channel, req === undefined ? null : req] as const
}

export type ApiQueryOptions<C extends Channel> = Omit<UseQueryOptions<Res<C>, ApiCallError, Res<C>, readonly unknown[]>, 'queryKey' | 'queryFn'>

export function useApiQuery<C extends Channel>(channel: C, req: Req<C>, options?: ApiQueryOptions<C>): UseQueryResult<Res<C>, ApiCallError> {
  return useQuery({
    queryKey: apiQueryKey(channel, req),
    queryFn: () => call(channel, req),
    ...options
  })
}

export interface ApiMutationOptions<C extends Channel> {
  /** Channels whose queries to refresh after success. */
  invalidates?: readonly Channel[]
  onSuccess?: (data: Res<C>, req: Req<C>) => void
  onError?: (error: ApiCallError, req: Req<C>) => void
}

export function useApiMutation<C extends Channel>(channel: C, options: ApiMutationOptions<C> = {}): UseMutationResult<Res<C>, ApiCallError, Req<C>> {
  const queryClient = useQueryClient()
  return useMutation<Res<C>, ApiCallError, Req<C>>({
    mutationKey: [channel],
    mutationFn: (req) => call(channel, req),
    onSuccess: async (data, req) => {
      await Promise.all((options.invalidates ?? []).map((c) => queryClient.invalidateQueries({ queryKey: [c] })))
      options.onSuccess?.(data, req)
    },
    onError: (error, req) => options.onError?.(error, req)
  })
}

/** Listens for a main-process event; returns a function that stops listening. */
export function onEvent<E extends EventName>(event: E, listener: (payload: ApiEvents[E]) => void): () => void {
  const bridge = typeof window !== 'undefined' ? window.aeterna : undefined
  return bridge ? bridge.on(event, listener) : demoOn(event, listener)
}

/** onEvent for components: listens while mounted, always calling the latest listener. */
export function useApiEvent<E extends EventName>(event: E, listener: (payload: ApiEvents[E]) => void): void {
  const latest = useRef(listener)
  useEffect(() => {
    latest.current = listener
  })
  useEffect(() => onEvent(event, (payload) => latest.current(payload)), [event])
}

/** The platform and versions, from the bridge (or the preview's stand-ins). */
export function appInfo(): BridgeInfo {
  const bridge = typeof window !== 'undefined' ? window.aeterna : undefined
  return bridge?.info ?? demoInfo
}

/** A sentence for any error: the contract's message, or a general one. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiCallError) return error.message
  return 'Something went wrong. Try again, and if it keeps happening, restart AETERNA CRM.'
}
