/**
 * The notifier (services/notifier.ts): brings the signed-in person's
 * notifications up to date, tells the window, and shows desktop notifications
 * only when the app isn't in front — never for the licence, which has its own
 * daily reminder, never when turned off, and as one summary for many. Nobody
 * signed in: nothing at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { Actor } from '../../src/main/access/policy'
import type { PracticeFacts } from '../../src/main/records/notifications'
import { local, partner, practice } from '../records/helpers'

const state = vi.hoisted(() => ({
  db: null as unknown as Database,
  person: null as Actor | null,
  focused: false,
  desktop: true,
  facts: (): PracticeFacts => ({}),
  sent: [] as Array<[string, unknown]>,
  shown: [] as Array<{ title: string; body: string }>
}))

vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => (state.focused ? {} : null), getAllWindows: () => [] },
  Notification: class {
    static isSupported(): boolean {
      return true
    }
    constructor(private readonly o: { title: string; body: string }) {}
    on(): this {
      return this
    }
    show(): void {
      state.shown.push(this.o)
    }
  }
}))
vi.mock('../../src/main/db/schema', () => ({ getDb: () => state.db }))
vi.mock('../../src/main/window-events', () => ({ sendToRenderer: (channel: string, payload: unknown) => state.sent.push([channel, payload]) }))

const { refreshNow, startNotifier, stopNotifier } = await import('../../src/main/services/notifier')

const deadline = (ref: string, days: number, key: string): void => {
  state.db.prepare("INSERT INTO compliance_periods (client_ref, obligation, period_key, due_date) VALUES (?, 'vat_return', ?, ?)").run(ref, key, local(days))
}

beforeEach(() => {
  state.db = practice()
  state.person = partner
  state.focused = false
  state.desktop = true
  state.facts = () => ({})
  state.sent = []
  state.shown = []
  startNotifier({ whoIsSignedIn: () => state.person, facts: () => state.facts(), settings: () => ({ alertDays: 30, desktop: state.desktop }) })
})

afterEach(() => stopNotifier())

describe('the notifier', () => {
  it('tells nobody anything while nobody is signed in', () => {
    deadline('C3', -2, 'a')
    state.person = null
    expect(refreshNow()).toBeNull()
    expect(state.sent).toEqual([])
    expect(state.shown).toEqual([])
  })

  it('tells the window, and the desktop when the app isn’t in front — but not about the licence', () => {
    deadline('C3', -2, 'a')
    state.facts = () => ({ licence: { state: 'licensed', active: true, validUntil: local(5), daysRemaining: 5, graceEndsOn: null } })
    expect(refreshNow()).toMatchObject({ open: 2, urgent: 2 })
    expect(state.sent).toMatchObject([['notifications:changed', { open: 2, urgent: 2, created: [{ kind: 'licence' }, { kind: 'deadline' }] }]]) // newest first
    expect(state.shown).toEqual([{ title: 'VAT return overdue: Gamma Ltd', body: expect.stringMatching(/^The VAT return was due on /) }])
  })

  it('shows nothing on the desktop when the app is in front, or desktop notifications are off', () => {
    deadline('C3', -2, 'a')
    state.focused = true
    refreshNow()
    deadline('C3', -3, 'b')
    state.focused = false
    state.desktop = false
    refreshNow()
    expect(state.shown).toEqual([])
    expect(state.sent).toHaveLength(2)
  })

  it('shows many as one desktop notification', () => {
    for (const [i, d] of [-1, -2, -3, -4].entries()) deadline('C3', d, `k${i}`)
    refreshNow()
    // Four new deadlines (not more than five) come one by one in the app, as one on the desktop.
    expect(state.shown).toEqual([{ title: '4 new notifications', body: expect.stringMatching(/, and 3 more\. Open AETERNA CRM to go through them\.$/) }])
  })

  it('carries on when the practice’s backup or licence state can’t be read', () => {
    state.facts = () => {
      throw new Error('backup settings unreadable')
    }
    deadline('C3', -2, 'a')
    expect(refreshNow()).toMatchObject({ open: 1 })
  })

  it('says nothing when nothing changed', () => {
    refreshNow()
    expect(state.sent).toEqual([])
  })
})
