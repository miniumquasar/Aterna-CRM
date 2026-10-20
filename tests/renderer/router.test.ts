import { beforeEach, describe, expect, it } from 'vitest'
import { hashToLocation, locationToHash, navigate, useRouter } from '@renderer/stores/router'
import { ROUTES, ROUTE_IDS } from '@renderer/navigation/routes'
import { NAV_GROUPS, navFor } from '@renderer/navigation/nav'

beforeEach(() => useRouter.getState().reset())

describe('routes', () => {
  it('declares every route once, each in a known group or none', () => {
    expect(ROUTES.map((r) => r.id)).toEqual([...ROUTE_IDS])
    const groups = new Set(NAV_GROUPS.map((g) => g.id))
    for (const r of ROUTES) if (r.group) expect(groups.has(r.group)).toBe(true)
  })

  it('shows staff the sidebar without manager-only screens, and hides development screens in builds', () => {
    const staff = navFor('staff', false).flatMap((g) => g.routes.map((r) => r.id))
    expect(staff).toContain('clients')
    expect(staff).not.toContain('forecast')
    expect(navFor('partner', false).flatMap((g) => g.routes.map((r) => r.id))).toContain('forecast')
    expect(navFor('partner', false).flatMap((g) => g.routes)).not.toContainEqual(expect.objectContaining({ id: 'design' }))
  })
})

describe('the router', () => {
  it('writes and reads routes in the address', () => {
    expect(locationToHash({ id: 'clientFile', params: { clientId: 42, tab: 'aml' } })).toBe('#/clientFile?clientId=42&tab=aml')
    expect(hashToLocation('#/clientFile?clientId=42&tab=aml')).toEqual({ id: 'clientFile', params: { clientId: 42, tab: 'aml' } })
    expect(hashToLocation('#/home')).toEqual({ id: 'home', params: {} })
    expect(hashToLocation('#/nowhere')).toBeNull()
    expect(hashToLocation('')).toBeNull()
  })

  it('goes back and forward', () => {
    navigate('clients')
    navigate('clientFile', { clientId: 7 })
    expect(useRouter.getState().location).toEqual({ id: 'clientFile', params: { clientId: 7 } })
    useRouter.getState().goBack()
    expect(useRouter.getState().location.id).toBe('clients')
    useRouter.getState().goBack()
    expect(useRouter.getState().location.id).toBe('home')
    useRouter.getState().goForward()
    expect(useRouter.getState().location.id).toBe('clients')
    navigate('deadlines')
    expect(useRouter.getState().forward).toEqual([])
  })

  it('replaces without adding to history, and ignores going where it already is', () => {
    navigate('settings')
    navigate('settings', { section: 'appearance' }, { replace: true })
    expect(useRouter.getState().back.map((l) => l.id)).toEqual(['home'])
    navigate('settings', { section: 'appearance' })
    expect(useRouter.getState().back).toHaveLength(1)
  })
})
