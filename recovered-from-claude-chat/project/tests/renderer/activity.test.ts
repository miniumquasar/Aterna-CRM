/**
 * Activity and Risk on screen (screens/crm/Sentinel.tsx, Notifications.tsx,
 * Pulse.tsx, stores/notifications.ts): picking the clients shown on the risk
 * list, the CSV, the notifications list's groups, the next backup in words, and
 * the toasts that come with new notifications. Plain functions and a store, no React.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppNotification, ClientRisk } from '../../src/shared/types'
import { filterRisks, riskCsv } from '../../src/renderer/src/screens/crm/Sentinel'
import { groupNotifications } from '../../src/renderer/src/screens/crm/Notifications'
import { nextBackupText, whoText } from '../../src/renderer/src/screens/crm/Pulse'
import { useNotificationsStore } from '../../src/renderer/src/stores/notifications'

const risk = (id: number, score: number, band: ClientRisk['band'], person: string | null, codes: string[] = []): ClientRisk => ({
  client_id: id, client_ref: `C${id}`, client_name: `Client ${id}`, person, score, band,
  factors: codes.map((code) => ({ code, label: `Because ${code}`, points: 10, target: null }))
})

describe('the risk list on screen', () => {
  const rows = [
    risk(1, 80, 'high', 'Sam', ['deadlines', 'aml_missing']),
    risk(2, 25, 'medium', null, ['engagement_letter']),
    risk(3, 5, 'low', 'Pat', ['data_issues']),
    risk(4, 0, 'clear', 'Sam')
  ]
  const base = { band: 'all' as const, whose: 'everyone' as const, factor: 'all', find: '', me: 'Sam', showClear: false }

  it('hides clients with nothing found unless asked, and narrows by band, person, reason and name', () => {
    expect(filterRisks(rows, base).map((r) => r.client_id)).toEqual([1, 2, 3])
    expect(filterRisks(rows, { ...base, showClear: true }).map((r) => r.client_id)).toEqual([1, 2, 3, 4])
    expect(filterRisks(rows, { ...base, band: 'clear' }).map((r) => r.client_id)).toEqual([4])
    expect(filterRisks(rows, { ...base, whose: 'mine' }).map((r) => r.client_id)).toEqual([1])
    expect(filterRisks(rows, { ...base, whose: 'nobody' }).map((r) => r.client_id)).toEqual([2])
    expect(filterRisks(rows, { ...base, whose: 'p:pat' }).map((r) => r.client_id)).toEqual([3])
    expect(filterRisks(rows, { ...base, factor: 'aml_missing' }).map((r) => r.client_id)).toEqual([1])
    expect(filterRisks(rows, { ...base, find: 'c2' }).map((r) => r.client_id)).toEqual([2])
  })

  it('saves the list with every reason in one cell', () => {
    const { header, rows: lines } = riskCsv([rows[0]])
    expect(header).toEqual(['Client', 'Client code', 'Score', 'Band', 'With', 'Reasons'])
    expect(lines).toEqual([['Client 1', 'C1', '80', 'High', 'Sam', 'Because deadlines (10); Because aml_missing (10)']])
  })

  it('names the app itself plainly in the day’s changes', () => {
    expect(whoText('system')).toBe('The app')
    expect(whoText(null)).toBe('The app')
    expect(whoText('Pat Partner')).toBe('Pat Partner')
  })

  it('says when the next backup is due, or that it is due now', () => {
    const now = new Date('2026-10-19T19:00:00Z')
    expect(nextBackupText(null, now)).toBe('')
    expect(nextBackupText('not a time', now)).toBe('')
    expect(nextBackupText('2026-10-19T12:30:00Z', now)).toBe(' Next backup: due now.')
    expect(nextBackupText('2026-10-20T12:30:00Z', now)).toMatch(/^ Next backup: Tue 20 Oct, \d\d:\d\d\.$/)
  })
})

describe('the notifications list', () => {
  const at = (id: number, severity: AppNotification['severity'], created: string, done: string | null = null): AppNotification => ({
    id, kind: 'deadline', severity, title: `N${id}`, body: null, client_ref: null, client_name: null, target: null,
    created_at: created, done_at: done, done_by: done ? 'Pat' : null
  })
  const now = new Date('2026-10-19T15:00:00Z')

  it('puts the urgent ones first, then the rest by day, each heading once', () => {
    // As the list arrives: urgent first, then newest first.
    const items = [at(6, 'urgent', '2026-10-19 09:00:00'), at(2, 'urgent', '2026-10-18 09:00:00'), at(5, 'info', '2026-10-19 08:00:00'), at(4, 'warning', '2026-10-18 10:00:00'), at(1, 'info', '2026-10-10 10:00:00')]
    expect(groupNotifications(items, 'open', now).map((g) => [g.label, g.items.map((n) => n.id)])).toEqual([
      ['Urgent', [6, 2]],
      ['Today', [5]],
      ['Yesterday', [4]],
      ['10 Oct 2026', [1]]
    ])
  })

  it('groups done ones by the day they were done, urgent or not', () => {
    const items = [at(3, 'urgent', '2026-10-01 09:00:00', '2026-10-19 09:00:00'), at(2, 'info', '2026-10-18 09:00:00', '2026-10-19 08:00:00'), at(1, 'info', '2026-10-17 09:00:00', '2026-10-18 08:00:00')]
    expect(groupNotifications(items, 'done', now).map((g) => [g.label, g.items.map((n) => n.id)])).toEqual([['Today', [3, 2]], ['Yesterday', [1]]])
  })
})

describe('toasts', () => {
  const note = (id: number): AppNotification => ({
    id, kind: 'deadline', severity: 'warning', title: `N${id}`, body: null, client_ref: null, client_name: null, target: null,
    created_at: '2026-10-19 09:00:00', done_at: null, done_by: null
  })
  beforeEach(() => useNotificationsStore.setState({ open: 0, urgent: 0, version: 0, panelOpen: false, toasts: [] }))

  it('shows the newest three at most, and none when asked not to', () => {
    const store = useNotificationsStore.getState()
    store.changed({ open: 2, urgent: 0, created: [note(2), note(1)] }, true)
    store.changed({ open: 4, urgent: 1, created: [note(4), note(3)] }, true)
    const s = useNotificationsStore.getState()
    expect(s.toasts.map((t) => t.notification.id)).toEqual([4, 3, 2])
    expect([s.open, s.urgent, s.version]).toEqual([4, 1, 2])
    s.changed({ open: 5, urgent: 1, created: [note(5)] }, false)
    expect(useNotificationsStore.getState().toasts).toHaveLength(3)
    s.dismissToast(useNotificationsStore.getState().toasts[0].key)
    expect(useNotificationsStore.getState().toasts.map((t) => t.notification.id)).toEqual([3, 2])
  })

  it('clears the toasts when the bell’s panel opens, or the list does', () => {
    const store = useNotificationsStore.getState()
    store.changed({ open: 1, urgent: 0, created: [note(1)] }, true)
    store.setPanelOpen(true)
    expect(useNotificationsStore.getState()).toMatchObject({ panelOpen: true, toasts: [] })
    store.setPanelOpen(false)
    store.changed({ open: 2, urgent: 0, created: [note(2)] }, true)
    store.clearToasts()
    expect(useNotificationsStore.getState().toasts).toEqual([])
  })
})

