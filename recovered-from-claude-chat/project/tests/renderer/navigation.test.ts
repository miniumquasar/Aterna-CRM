/**
 * The sidebar model (navigation/nav.ts) and the go-to palette's ranking
 * (navigation/search.ts): plain data and functions, no React.
 */
import { describe, expect, it } from 'vitest'
import { NAV_ROUTES } from '../../src/renderer/src/navigation/routes'
import { NAV_GROUPS, OUTSIDE_SIDEBAR, navTargets, placeOf, tabsFor } from '../../src/renderer/src/navigation/nav'
import { matchScore, rankClients, rankScreens } from '../../src/renderer/src/navigation/search'

describe('sidebar', () => {
  const places = NAV_GROUPS.flatMap((g) => g.entries.flatMap((e) => (e.tabs ? e.tabs.map((t) => t.route) : [e.route])))

  it('gives every screen exactly one place: an entry, a tab, or the footer or title bar', () => {
    for (const route of NAV_ROUTES) {
      const count = places.filter((r) => r === route).length + (OUTSIDE_SIDEBAR[route] ? 1 : 0)
      expect([route, count]).toEqual([route, 1])
    }
    expect(places.every((r) => (NAV_ROUTES as readonly string[]).includes(r))).toBe(true)
  })

  it('has about a dozen entries in the five groups, in plain words', () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(['Work', 'Clients', 'Compliance', 'Practice', 'System'])
    const entries = NAV_GROUPS.flatMap((g) => g.entries)
    expect(entries.length).toBeGreaterThanOrEqual(12)
    expect(entries.length).toBeLessThanOrEqual(15)
    // The module names stay as quiet second lines; the entries say what they are.
    expect(entries.find((e) => e.route === 'sentinel')).toMatchObject({ label: 'Risk', sublabel: 'Sentinel' })
    expect(entries.find((e) => e.route === 'communications')?.tabs?.map((t) => t.route)).toEqual(['communications', 'interactions', 'email-templates'])
  })

  it('opens an entry on its first tab, and finds the entry from any of its tabs', () => {
    for (const e of NAV_GROUPS.flatMap((g) => g.entries)) if (e.tabs) expect(e.tabs[0].route).toBe(e.route)
    expect(placeOf('interactions')).toMatchObject({ group: { id: 'clients' }, entry: { route: 'communications' }, tab: { label: 'Calls and meetings' } })
    expect(placeOf('client-file')?.entry.route).toBe('clients')
    expect(placeOf('tasks')).toMatchObject({ entry: { route: 'tasks' }, tab: null })
    expect(placeOf('about')).toBeNull()
  })

  it('shows Import to partners and managers only', () => {
    const settings = placeOf('settings')!.entry
    expect(tabsFor(settings, 'staff').map((t) => t.route)).not.toContain('import')
    expect(tabsFor(settings, 'manager').map((t) => t.route)).toContain('import')
    expect(navTargets('staff').map((t) => t.route)).not.toContain('import')
    expect(navTargets('partner').map((t) => t.route)).toEqual(expect.arrayContaining(['import', 'ai', 'about']))
  })
})

describe('go-to palette', () => {
  it('scores whole, leading, word-start and inner matches in that order', () => {
    expect(matchScore('Templates', 'templates')).toBeGreaterThan(matchScore('Templates', 'temp'))
    expect(matchScore('Communications › Templates', 'temp')).toBeGreaterThan(matchScore('Contemporary', 'temp'))
    expect(matchScore('Alpha Ltd', 'beta')).toBe(0)
    expect(matchScore('Alpha Trading Ltd', 'alpha ltd')).toBeGreaterThan(0)
  })

  it('finds screens by name or by the words people use', () => {
    const targets = navTargets('partner')
    expect(rankScreens(targets, 'templates')[0].title).toBe('Communications › Templates')
    expect(rankScreens(targets, 'wip')[0].route).toBe('wip')
    expect(rankScreens(targets, 'workbook')[0].route).toBe('import')
    expect(rankScreens(targets, 'zzz')).toEqual([])
  })

  it('finds clients by code, name, trading name or company number, ignoring accents and case', () => {
    const clients = [
      { id: 1, ref: 'C10', client_name: 'Alpha Ltd', business_name: null, reg_no: '01234567' },
      { id: 2, ref: 'C1', client_name: 'Café Beta Ltd', business_name: 'Beta Coffee', reg_no: null },
      { id: 3, ref: null, client_name: 'Gamma Partners', business_name: null, reg_no: null }
    ]
    expect(rankClients(clients, 'c1').map((c) => c.id)).toEqual([2, 1])
    expect(rankClients(clients, 'cafe')[0].id).toBe(2)
    expect(rankClients(clients, 'coffee')[0].id).toBe(2)
    expect(rankClients(clients, '01234567')[0].id).toBe(1)
    expect(rankClients(clients, 'gam')[0].id).toBe(3)
    expect(rankClients(clients, '')).toEqual([])
  })

  it('finds a client by any of its other names from the Client file', () => {
    const clients = [
      { id: 1, ref: 'C1', client_name: 'Alpha Ltd', other_names: 'Alpha Bakeries | The Old Mill Tearoom' },
      { id: 2, ref: 'C2', client_name: 'Beta Ltd', other_names: null }
    ]
    expect(rankClients(clients, 'old mill').map((c) => c.id)).toEqual([1])
    expect(rankClients(clients, 'bakeries')[0].id).toBe(1)
    expect(rankClients(clients, 'tearoom alpha')).toEqual([]) // every word must match within one name
  })
})
