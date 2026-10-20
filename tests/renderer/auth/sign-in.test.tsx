// @vitest-environment jsdom
/**
 * The sign-in screen: the firm's name, the server's answers shown plainly
 * (wrong password as an alert, a locked account and access turned off as
 * their own notes), Show password and Caps Lock, the note after an idle
 * sign-out, choosing your own password after a temporary one, and joining
 * with an invitation code.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AuthStatus } from '@shared/contracts/auth'
import { SignInScreen } from '@renderer/screens/auth/SignInScreen'
import { setSignOutNotice } from '@renderer/stores/session'
import { callsTo, installBridge, ok, refuse, renderWithApp } from './kit'

const signedOut: AuthStatus = { setupNeeded: false, setupComplete: true, signedIn: false, actor: null, firmName: 'Alder & Birch LLP' }

afterEach(() => {
  cleanup()
  delete window.aeterna
  setSignOutNotice(null)
  window.localStorage.clear()
})

describe('the sign-in screen', () => {
  it('shows the firm and says plainly when the password is wrong', async () => {
    const bridge = installBridge({ 'auth.signIn': () => refuse('invalid', 'That username and password don’t match. Check them and try again.') })
    renderWithApp(<SignInScreen status={signedOut} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Alder & Birch LLP' })).toBeTruthy()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Username'), 'sam.staff')
    await user.type(screen.getByLabelText('Password'), 'wrong one')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/don’t match/)
    expect(callsTo(bridge, 'auth.signIn')).toEqual([{ username: 'sam.staff', password: 'wrong one' }])
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('')
  })

  it('asks for both fields before trying', async () => {
    const bridge = installBridge({})
    renderWithApp(<SignInScreen status={signedOut} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Enter your username and password.')).toBeTruthy()
    expect(callsTo(bridge, 'auth.signIn')).toEqual([])
  })

  it('shows a locked account as its own clear note', async () => {
    installBridge({ 'auth.signIn': () => refuse('locked', 'This account is locked after too many wrong passwords. Ask a partner to unlock it in Settings → People.') })
    renderWithApp(<SignInScreen status={signedOut} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Username'), 'sam.staff')
    await user.type(screen.getByLabelText('Password'), 'anything at all')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const note = await screen.findByRole('alert')
    expect(note.textContent).toBe('This account is locked after too many wrong passwords. Ask a partner to unlock it in Settings → People.')
    expect(within(note).queryByRole('heading')).toBeNull()
  })

  it('shows and hides the password, and says when Caps Lock is on', async () => {
    installBridge({})
    renderWithApp(<SignInScreen status={signedOut} />)
    const input = screen.getByLabelText('Password') as HTMLInputElement
    expect(input.type).toBe('password')
    const toggle = screen.getByRole('button', { name: 'Show password' })
    await userEvent.setup().click(toggle)
    expect(input.type).toBe('text')
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(input, { key: 'A', modifierCapsLock: true })
    expect(screen.getByText('Caps Lock is on.')).toBeTruthy()
    fireEvent.keyUp(input, { key: 'a', modifierCapsLock: false })
    expect(screen.queryByText('Caps Lock is on.')).toBeNull()
  })

  it('says why after an idle sign-out, and offers the username used last', async () => {
    installBridge({})
    window.localStorage.setItem('aeterna.lastUsername', 'pat.partner')
    setSignOutNotice({ kind: 'idle', minutes: 30 })
    renderWithApp(<SignInScreen status={signedOut} />)
    expect(screen.getByText('You were signed out after 30 minutes without use. Sign in to carry on.')).toBeTruthy()
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('pat.partner')
    expect(document.activeElement).toBe(screen.getByLabelText('Password'))
  })

  it('asks for a password of their own after a temporary one, then signs in', async () => {
    const bridge = installBridge({
      'auth.signIn': () => ok({ ...signedOut, passwordChange: { username: 'sam.staff', name: 'Sam Staff' } }),
      'auth.completePasswordChange': () => ok({ ...signedOut, signedIn: true, actor: { id: 3, username: 'sam.staff', name: 'Sam Staff', role: 'staff' } }),
      'auth.status': () => ok(signedOut)
    })
    renderWithApp(<SignInScreen status={signedOut} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Username'), 'sam.staff')
    await user.type(screen.getByLabelText('Password'), 'temporary pass 1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Choose your own password' })).toBeTruthy()
    await user.type(screen.getByLabelText('New password'), 'my own new password')
    await user.type(screen.getByLabelText('New password again'), 'my own new passwor')
    await user.click(screen.getByRole('button', { name: 'Save my password' }))
    expect(screen.getByText('The two passwords don’t match.')).toBeTruthy()
    await user.type(screen.getByLabelText('New password again'), 'd')
    await user.click(screen.getByRole('button', { name: 'Save my password' }))
    await waitFor(() => expect(callsTo(bridge, 'auth.completePasswordChange')).toEqual([{ username: 'sam.staff', currentPassword: 'temporary pass 1', newPassword: 'my own new password' }]))
    await waitFor(() => expect(window.localStorage.getItem('aeterna.lastUsername')).toBe('sam.staff'))
  })

  it('lets an invited person join with their code', async () => {
    const bridge = installBridge({
      'auth.checkInvite': () =>
        ok({ name: 'Jane Smith', email: null, role: 'manager', firmName: 'Alder & Birch LLP', invitedBy: 'Pat Partner', expiresAt: '2026-10-27T09:00:00.000Z', suggestedUsername: 'jane.smith' }),
      'auth.acceptInvite': () => ok({ ...signedOut, signedIn: true }),
      'auth.status': () => ok(signedOut)
    })
    renderWithApp(<SignInScreen status={signedOut} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'I have an invitation code' }))
    await user.type(screen.getByLabelText('Invitation code'), 'abcd')
    await user.click(screen.getByRole('button', { name: 'Check the code' }))
    expect(screen.getByText(/12 letters and numbers, like ABCD-EFGH-JKMN/)).toBeTruthy()
    await user.type(screen.getByLabelText('Invitation code'), '-efgh-jkmn')
    await user.click(screen.getByRole('button', { name: 'Check the code' }))
    expect(await screen.findByRole('heading', { name: 'Welcome, Jane' })).toBeTruthy()
    expect(screen.getByText('Pat Partner invited you to join Alder & Birch LLP.')).toBeTruthy()
    expect(screen.getByText('You see every client and the practice’s work, and assign clients.')).toBeTruthy()
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('jane.smith')
    await user.type(screen.getByLabelText('Password'), 'a long password here')
    await user.type(screen.getByLabelText('Password again'), 'a long password here')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Create my account' }))
    })
    await waitFor(() =>
      expect(callsTo(bridge, 'auth.acceptInvite')).toEqual([{ code: 'ABCD-EFGH-JKMN', name: 'Jane Smith', username: 'jane.smith', password: 'a long password here' }])
    )
  })
})
