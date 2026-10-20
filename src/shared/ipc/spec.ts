/**
 * The building blocks every domain contract uses.
 *
 *   export interface ClientsContract {
 *     'clients.list': ChannelSpec<ClientListQuery, ClientListItem[]>
 *   }
 *   export const clientsChannels = {
 *     'clients.list': { kind: 'read' },
 *   } as const satisfies ChannelTable<ClientsContract>
 */

/** A channel's request and response types. Use `void` for a channel that takes nothing. */
export interface ChannelSpec<Req, Res> {
  req: Req
  res: Res
}

export interface ChannelFlags {
  /** 'write' when the call changes stored data; the read-only gate refuses writes. */
  readonly kind: 'read' | 'write'
  /** 'public' when the call works signed out (sign-in, setup, licence status, appearance, ping). */
  readonly auth?: 'public'
  /** A write still allowed after the licence lapses (licence entry, backups, appearance, sign-out, exports). */
  readonly allowWhenReadOnly?: true
}

/** Exactly one flags entry per channel in the contract `T`. */
export type ChannelTable<T> = { readonly [K in keyof T]: ChannelFlags }
