// @vitest-environment jsdom
/**
 * Settings → People: the list, a person's dialog (removal refused with the
 * reason and a way forward; your own row offering only what you may change),
 * and an invitation's code shown once.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PeopleOverview, Person } from '@shared/contracts/auth'
import PeopleSection from '@renderer/screens/settings/PeopleSection'
import { callsTo, installBridge, ok, renderWithApp } from './kit'

afterEach(() => {
  cleanup()
  delete window.aeterna
})

const person = (over: Partial<Person>): Person => ({
  id: 1,
  username: 'pat.partner',
  name: 'Pat Partner',
  email: null,
  role: 'partner',
  active: true,
  locked: false,
  lockedAt: null,
  selfUnlocksAt: null,
  mustChangePassword: false,
  failedSignIns: 0,
  lastSignInAt: '2026-10-20T08:00:00.000Z',
  createdAt: '2026-01-01T09:00:00.000Z',
  signedIn: true,
  clients: { assigned: 0, responsible: 3 },
  isYou: true,
  ...over
})

const overview: PeopleOverview = {
  people: [
    person({}),
    person({ id: 3, username: 'sam.staff', name: 'Sam Staff', role: 'staff', isYou: false, signedIn: false, locked: true, lockedAt: '2026-10-20T08:30:00.000Z', failedSignIns: 5, clients: { assigned: 12, responsible: 0 } })
  ],
  invites: [{ id: 7, name: 'Jane Smith', email: 'jane@example.test', role: 'manager', invitedBy: 'Pat Partner', createdAt: '2026-10-19T09:00:00.000Z', expiresAt: '2026-10-26T09:00:00.000Z', expired: false }],
  idle: { practiceMinutes: 30 },
  lockAfter: 5
}

describe('Settings → People', () => {
  it('lists people and invitations, and explains why someone with clients can’t be removed', async () => {
    const bridge = installBridge({
      'people.list': () => ok(overview),
      'auth.status': () => ok({ setupNeeded: false, setupComplete: true, signedIn: true, actor: null, firmName: 'Alder & Birch LLP' }),
      'people.removalCheck': () => ok({ canRemove: false, links: [{ label: '12 clients they look after', count: 12 }], reason: 'Sam Staff can’t be removed while there are records under them.' })
    })
    renderWithApp(<PeopleSection />)
    expect(await screen.findByText('2 people · 1 signed in now · 1 invitation waiting')).toBeTruthy()
    expect(screen.getByText('Sam Staff’s account is locked.', { exact: false })).toBeTruthy()
    expect(screen.getByText('Jane Smith')).toBeTruthy()
    const user = userEvent.setup()
    await user.click(screen.getByRole('row', { name: 'Open Sam Staff' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sam Staff' })
    expect(within(dialog).getByRole('button', { name: 'Unlock' })).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Remove from the practice' }))
    expect(await within(dialog).findByText('Sam Staff can’t be removed yet')).toBeTruthy()
    expect(within(dialog).getByText('12 clients they look after')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Turn access off instead' })).toBeTruthy()
    expect(callsTo(bridge, 'people.remove')).toEqual([])
  })

  it('offers only your details on your own row', async () => {
    installBridge({ 'people.list': () => ok(overview), 'auth.status': () => ok({ setupNeeded: false, setupComplete: true, signedIn: true, actor: null, firmName: null }) })
    renderWithApp(<PeopleSection />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('row', { name: 'Open Pat Partner' }))
    const dialog = await screen.findByRole('dialog', { name: 'Pat Partner' })
    expect(within(dialog).getByText(/This is you/)).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Remove from the practice' })).toBeNull()
    expect(within(dialog).queryByRole('switch')).toBeNull()
  })

  it('shows a new invitation’s code once, with how to use it', async () => {
    const bridge = installBridge({
      'people.list': () => ok({ ...overview, invites: [] }),
      'auth.status': () => ok({ setupNeeded: false, setupComplete: true, signedIn: true, actor: null, firmName: 'Alder & Birch LLP' }),
      'people.invite': () => ok({ invite: { ...overview.invites[0], id: 8, name: 'Ann Other', role: 'staff' }, code: 'ABCD-EFGH-JKMN' })
    })
    renderWithApp(<PeopleSection />)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('people-invite'))
    const dialog = await screen.findByRole('dialog', { name: 'Invite someone' })
    await user.click(within(dialog).getByRole('button', { name: 'Create invitation' }))
    expect(within(dialog).getByText('Enter their name.')).toBeTruthy()
    await user.type(within(dialog).getByLabelText('Their name'), 'Ann Other')
    await user.click(within(dialog).getByRole('button', { name: 'Create invitation' }))
    await waitFor(() => expect(callsTo(bridge, 'people.invite')).toEqual([{ name: 'Ann Other', email: null, role: 'staff', expiresInDays: 7 }]))
    expect((await within(dialog).findByTestId('invite-code-shown')).textContent).toBe('ABCD-EFGH-JKMN')
    expect(within(dialog).getByText(/isn’t shown again/)).toBeTruthy()
  })
})
