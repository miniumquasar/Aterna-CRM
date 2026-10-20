/**
 * Appearance: Day, Night or Auto, the colour theme and the effects level,
 * saved for the person signed in to this PC (the OS user), so it applies
 * before anyone signs in. Owned by the design domain.
 */
import type { ChannelSpec, ChannelTable } from '../ipc/spec'
import type { AppearancePrefs } from '../theme/appearance'

export type { AppearancePrefs } from '../theme/appearance'

export interface AppearanceContract {
  'appearance.get': ChannelSpec<void, AppearancePrefs>
  /** Saves the fields given and returns the whole, normalised preference set. */
  'appearance.set': ChannelSpec<Partial<AppearancePrefs>, AppearancePrefs>
}

export const appearanceChannels = {
  'appearance.get': { kind: 'read', auth: 'public' },
  'appearance.set': { kind: 'write', auth: 'public', allowWhenReadOnly: true }
} as const satisfies ChannelTable<AppearanceContract>
