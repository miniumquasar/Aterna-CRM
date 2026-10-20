/**
 * Which clients are no longer clients, how the screens name them, and how the
 * searches rank them (Level 5). The main process's SQL follows the same list.
 */
import { describe, expect, it } from 'vitest'
import { CLIENT_VIEW_LABELS, inClientView, isNoLongerClient, NO_LONGER_STATUSES, noLongerLabel } from '../../src/shared/client-status'
import { rankClients } from '../../src/renderer/src/navigation/search'

describe('no-longer clients', () => {
  it('are the ones marked Former client, Ceased or Dissolved, in any case, or a dissolved company', () => {
    expect(NO_LONGER_STATUSES).toEqual(['Former client', 'Ceased', 'Dissolved'])
    expect(isNoLongerClient({ status: ' ceased ' })).toBe(true)
    expect(isNoLongerClient({ status: 'Active', company_status: 'dissolved' })).toBe(true)
    for (const status of ['Active', 'Dormant', 'Inactive', 'Onboarding', 'Prospect', null]) expect(isNoLongerClient({ status })).toBe(false)
    expect(isNoLongerClient({ status: 'Active', company_status: 'liquidation' })).toBe(false)
  })

  it('are named by their status, or as dissolved when Companies House says so', () => {
    expect(noLongerLabel({ status: 'former client' })).toBe('Former client')
    expect(noLongerLabel({ status: 'Active', company_status: 'dissolved' })).toBe('Dissolved')
    expect(noLongerLabel({ status: 'Active' })).toBeNull()
  })

  it('fall into the list views: current, no longer, everyone', () => {
    const gone = { status: 'Ceased' }
    const here = { status: 'Active' }
    expect([inClientView(here, 'current'), inClientView(gone, 'current')]).toEqual([true, false])
    expect([inClientView(here, 'no_longer'), inClientView(gone, 'no_longer')]).toEqual([false, true])
    expect([inClientView(here, 'all'), inClientView(gone, 'all')]).toEqual([true, true])
    expect(CLIENT_VIEW_LABELS).toEqual({ current: 'Current', no_longer: 'No longer clients', all: 'Everyone' })
  })

  it('are still found by every search, after a current client that matches as well', () => {
    const clients = [
      { id: 1, ref: 'A1', client_name: 'Smith Bakery Ltd', status: 'Ceased' },
      { id: 2, ref: 'A2', client_name: 'Smith Builders Ltd', status: 'Active' },
      { id: 3, ref: 'A3', client_name: 'Jones Ltd', status: 'Former client', other_names: 'Smithy’s' }
    ]
    expect(rankClients(clients, 'smith').map((c) => c.ref)).toEqual(['A2', 'A1', 'A3'])
    expect(rankClients(clients, 'smith bakery').map((c) => c.ref)).toEqual(['A1'])
  })
})

