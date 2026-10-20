// @vitest-environment jsdom
/**
 * The idle warning (a minute before the sign-out, Stay signed in, then the
 * sign-out with its reason) and the password re-entry question before a
 * protected action.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IdleWarning } from '@renderer/components/session/IdleWarning'
import { ReauthHost } from '@renderer/components/session/ReauthDialog'
import { ReauthCancelled, withReauth } from '@renderer/components/session/reauth'
import { call } from '@renderer/lib/api'
import { setSignOutNotice, useSignOutNotice } from '@renderer/stores/session'
import { callsTo, installBridge, ok, refuse, renderWithApp } from './kit'

const session = { signedInAt: '2026-10-20T09:00:00.000Z', lastActiveAt: '2026-10-20T09:00:00.000Z', idleMinutes: 5, reauthUntil: null }

afterEach(() => {
  cleanup()
  delete window.aeterna
  setSignOutNotice(null)
  vi.useRealTimers()
})

describe('the idle warning', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  const advance = async (ms: number): Promise<void> => {
    await act(async () => {
      vi.advanceTimersByTime(ms)
    })
  }

  it('warns a minute before, keeps the person signed in when asked, then signs them out after their idle time', async () => {
    const bridge = installBridge({
      'auth.session': () => ok(session),
      'auth.activity': () => ok(session),
      'auth.signOut': () => ok({ setupNeeded: false, setupComplete: true, signedIn: false, actor: null, firmName: null })
    })
    renderWithApp(<IdleWarning />)
    await waitFor(() => expect(callsTo(bridge, 'auth.session')).toHaveLength(1))
    await advance(3 * 60_000 + 58_000)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await advance(3_000)
    const dialog = await screen.findByRole('alertdialog', { name: 'Are you still there?' })
    expect(dialog.textContent).toMatch(/after 5 minutes without use/)
    // While it asks, moving the mouse isn't an answer.
    fireEvent.pointerMove(window)
    await advance(1_000)
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(callsTo(bridge, 'auth.activity')).toHaveLength(1))

    await advance(5 * 60_000 + 1_000)
    await waitFor(() => expect(callsTo(bridge, 'auth.signOut')).toEqual([{ reason: 'idle' }]))
    expect(useSignOutNotice.getState().notice).toEqual({ kind: 'idle', minutes: 5 })
  })

  it('counts input as using the app, reporting it at most every 30 seconds', async () => {
    const bridge = installBridge({ 'auth.session': () => ok(session), 'auth.activity': () => ok(session) })
    renderWithApp(<IdleWarning />)
    await waitFor(() => expect(callsTo(bridge, 'auth.session')).toHaveLength(1))
    await advance(31_000)
    fireEvent.keyDown(window, { key: 'a' })
    fireEvent.keyDown(window, { key: 'b' })
    await waitFor(() => expect(callsTo(bridge, 'auth.activity')).toHaveLength(1))
    await advance(10_000)
    fireEvent.pointerDown(window)
    expect(callsTo(bridge, 'auth.activity')).toHaveLength(1)
    // Four and a half minutes after the last key, no warning yet: input kept the clock back.
    await advance(4 * 60_000 - 20_000)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('says why when the main process ends the session itself', async () => {
    const bridge = installBridge({ 'auth.session': () => ok(session) })
    renderWithApp(<IdleWarning />)
    await act(async () => bridge.fire('session.ended', { reason: 'locked' }))
    expect(useSignOutNotice.getState().notice).toEqual({ kind: 'locked' })
  })
})

describe('password re-entry', () => {
  it('asks only when a protected channel refuses, then tries again', async () => {
    let confirmed = false
    const bridge = installBridge({
      'people.unlock': () => (confirmed ? ok({ id: 3 }) : refuse('forbidden', 'For your security, enter your password again to do that.', 'reauth')),
      'auth.reauth': (req) => {
        if ((req as { password: string }).password !== 'right password') return refuse('invalid', 'That password isn’t right. Check it and try again.', 'password')
        confirmed = true
        return ok({ until: '2026-10-20T09:05:00.000Z' })
      }
    })
    renderWithApp(<ReauthHost />)
    const user = userEvent.setup()
    const result = withReauth(() => call('people.unlock', { id: 3 }), { action: 'unlock Sam' })
    const dialog = await screen.findByRole('dialog', { name: 'Enter your password again' })
    expect(dialog.textContent).toMatch(/To unlock Sam, confirm it’s you\./)
    await user.type(screen.getByLabelText('Your password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('That password isn’t right. Check it and try again.')).toBeTruthy()
    await user.type(screen.getByLabelText('Your password'), 'right password')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await expect(result).resolves.toEqual({ id: 3 })
    expect(callsTo(bridge, 'people.unlock')).toHaveLength(2)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('gives up cleanly when the person cancels', async () => {
    installBridge({ 'people.unlock': () => refuse('forbidden', 'For your security, enter your password again to do that.', 'reauth') })
    renderWithApp(<ReauthHost />)
    const result = withReauth(() => call('people.unlock', { id: 3 })).catch((err: unknown) => err)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(await result).toBeInstanceOf(ReauthCancelled)
  })
})
