/**
 * email.ts — sending email, and its settings. The rules are in ../email/.
 *
 *   everyone signed in      send (staff: to their own clients), and see how
 *                           "Send" will behave
 *   partners and managers   the email settings, a test email, and signing in
 *                           to Microsoft 365
 */
import { clipboard, ipcMain, net, shell } from 'electron'
import { getDb } from '../db/schema'
import { fieldCipher, fieldCipherReady } from '../services/encryption'
import { EmailError, EmailService } from '../email/service'
import type { FetchLike } from '../email/microsoft'
import { requireManager, UserFacingError, type Actor } from '../access/policy'
import { actor } from './session'

let service: EmailService | null = null

/** Chromium's network stack, so the PC's proxy settings apply. */
const electronFetch: FetchLike = (url, init) => net.fetch(url, init) as unknown as ReturnType<FetchLike>

export function emailService(): EmailService {
  if (!service) {
    service = new EmailService({
      db: () => getDb(),
      secrets: () => (fieldCipherReady() ? fieldCipher() : null),
      fetch: electronFetch,
      openExternal: async (url) => {
        if (!/^mailto:/i.test(url)) throw new Error('Only mailto: links open in the mail app.')
        await shell.openExternal(url)
      },
      openBrowser: async (url) => {
        if (!/^https:\/\/login\.microsoftonline\.com\//i.test(url)) throw new Error('Only the Microsoft sign-in page opens from here.')
        await shell.openExternal(url)
      },
      copyToClipboard: (text) => clipboard.writeText(text),
      firmName: () => {
        try {
          return (getDb().prepare('SELECT name FROM firm_data ORDER BY id ASC LIMIT 1').get() as { name: string } | undefined)?.name || 'The practice'
        } catch {
          return 'The practice'
        }
      }
    })
  }
  return service
}

type Reply<T> = ({ success: true } & T) | { success: false; error: string }

async function attempt<T extends object>(scope: string, fn: () => Promise<T> | T): Promise<Reply<T>> {
  try {
    return { success: true, ...(await fn()) }
  } catch (err) {
    if (err instanceof EmailError || err instanceof UserFacingError) return { success: false, error: err.message }
    console.error(`[${scope}]`, err)
    return { success: false, error: 'That couldn’t be done. Nothing was changed.' }
  }
}

const manager = (what: string): Pick<Actor, 'id' | 'name'> => {
  const me = actor()
  requireManager(me, what)
  return { id: me.id, name: me.name }
}

export function registerEmailHandlers(): void {
  ipcMain.handle('email:status', () => {
    actor()
    return emailService().status()
  })

  // The person signed in sends, whatever the screen says; staff only to their own clients.
  ipcMain.handle('email:send', async (_e, input: unknown) => {
    try {
      return await emailService().send(actor(), input)
    } catch (err) {
      if (err instanceof EmailError || err instanceof UserFacingError) return { success: false, error: err.message }
      console.error('[email]', err)
      return { success: false, error: 'The email couldn’t be sent. Nothing was recorded.' }
    }
  })

  ipcMain.handle('settings:get-email', () =>
    attempt('email', () => {
      manager('see the email settings')
      return { settings: emailService().settings() }
    })
  )

  ipcMain.handle('settings:save-email', (_e, input: unknown) =>
    attempt('email', () => ({ settings: emailService().saveSettings(input, manager('change the email settings')) }))
  )

  ipcMain.handle('settings:test-email', (_e, to: unknown) =>
    attempt('email', async () => emailService().sendTest(manager('send a test email'), to))
  )

  ipcMain.handle('settings:m365-sign-in', () =>
    attempt('email', async () => emailService().microsoftSignIn(manager('sign in to Microsoft 365 for the practice')))
  )

  ipcMain.handle('settings:m365-sign-out', () =>
    attempt('email', () => {
      emailService().microsoftSignOut(manager('sign out of Microsoft 365 for the practice'))
      return {}
    })
  )
}
