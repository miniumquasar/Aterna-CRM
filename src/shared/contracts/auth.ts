/**
 * Sign-in, sessions and first-run setup. Owned by the auth domain.
 *
 * The session lives in the main process, bound to the window that signed in;
 * the renderer never holds a token.
 */
import type { Actor } from '../domain/roles'
import type { ChannelSpec, ChannelTable } from '../ipc/spec'

export interface AuthStatus {
  /** Nobody can sign in yet: a new installation, so the first-run wizard shows. */
  setupNeeded: boolean
  /** The first-run wizard has been finished (or a practice existed before it). */
  setupComplete: boolean
  signedIn: boolean
  /** The person signed in on this window, or null. */
  actor: Actor | null
  /** The practice's name from Settings → Firm, or null before setup. */
  firmName: string | null
}

export interface FirstPartnerInput {
  firmName: string
  name: string
  username: string
  password: string
}

export interface SignInInput {
  username: string
  password: string
}

export interface AuthContract {
  'auth.status': ChannelSpec<void, AuthStatus>
  'auth.signIn': ChannelSpec<SignInInput, AuthStatus>
  'auth.signOut': ChannelSpec<void, AuthStatus>
  /** Only while nobody can sign in: saves the firm's name, creates the first partner and signs them in. */
  'setup.createFirstPartner': ChannelSpec<FirstPartnerInput, AuthStatus>
  /** A partner finishes the first-run wizard. */
  'setup.finish': ChannelSpec<void, AuthStatus>
}

export const authChannels = {
  'auth.status': { kind: 'read', auth: 'public' },
  'auth.signIn': { kind: 'write', auth: 'public', allowWhenReadOnly: true },
  'auth.signOut': { kind: 'write', auth: 'public', allowWhenReadOnly: true },
  'setup.createFirstPartner': { kind: 'write', auth: 'public' },
  'setup.finish': { kind: 'write', allowWhenReadOnly: true }
} as const satisfies ChannelTable<AuthContract>
