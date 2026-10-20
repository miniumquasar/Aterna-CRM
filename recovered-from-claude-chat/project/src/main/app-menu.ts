/**
 * Puts the app's own menu in place of Electron's (see menu-template.ts). On
 * Windows and Linux the menu bar stays out of sight until Alt is pressed — the
 * window has its own title bar — and its keys work either way.
 */
import { app, Menu, shell } from 'electron'
import type { MenuAction } from '../shared/types'
import { menuTemplate } from './menu-template'
import { sendToRenderer } from './window-events'

const isSafeLink = (url: string): boolean => /^(https:|mailto:)/i.test(url)

export function installAppMenu(): void {
  const template = menuTemplate(process.platform, app.isPackaged, {
    send: (action: MenuAction) => sendToRenderer('app:menu', action),
    openExternal: (url) => {
      if (isSafeLink(url)) void shell.openExternal(url)
    }
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
