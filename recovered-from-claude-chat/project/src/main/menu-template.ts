/**
 * The app's menu, as a template (plain data, so it can be tested without
 * Electron). Electron's own menu — with Reload and Toggle Developer Tools —
 * never ships: a packaged build has editing, zoom, full screen and help; a
 * development build adds reload and the developer tools.
 *
 * Items that belong to the screens (About and help, Settings, Go to…) are sent
 * to them as a MenuAction. Go to… shows Ctrl K beside it but leaves the key to
 * the screens, which already answer it.
 */
import type { MenuItemConstructorOptions } from 'electron'
import type { MenuAction } from '../shared/types'
import { DOWNLOAD_PAGE, PRODUCT_NAME, SUPPORT_EMAIL } from '../shared/product'

export interface MenuHooks {
  /** Tells the screens to do something. */
  send: (action: MenuAction) => void
  /** Opens a link in the browser or mail app. */
  openExternal: (url: string) => void
}

export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${PRODUCT_NAME} support`)}`

export function menuTemplate(platform: NodeJS.Platform, packaged: boolean, hooks: MenuHooks): MenuItemConstructorOptions[] {
  const mac = platform === 'darwin'
  const sep: MenuItemConstructorOptions = { type: 'separator' }

  const appMenu: MenuItemConstructorOptions = {
    label: PRODUCT_NAME,
    submenu: [
      { label: `About ${PRODUCT_NAME}`, click: () => hooks.send('about') },
      sep,
      { label: 'Settings…', accelerator: 'Cmd+,', click: () => hooks.send('settings') },
      sep,
      { role: 'services' },
      sep,
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      sep,
      { role: 'quit' }
    ]
  }

  const file: MenuItemConstructorOptions = {
    label: '&File',
    submenu: [{ label: 'Settings', accelerator: 'Ctrl+,', click: () => hooks.send('settings') }, sep, { role: 'quit', label: 'E&xit' }]
  }

  const edit: MenuItemConstructorOptions = {
    label: mac ? 'Edit' : '&Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      sep,
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(mac ? ([{ role: 'pasteAndMatchStyle' }] as MenuItemConstructorOptions[]) : []),
      { role: 'delete' },
      sep,
      { role: 'selectAll' }
    ]
  }

  const view: MenuItemConstructorOptions = {
    label: mac ? 'View' : '&View',
    submenu: [
      { label: 'Go to…', accelerator: 'CmdOrCtrl+K', registerAccelerator: false, click: () => hooks.send('goto') },
      sep,
      { role: 'resetZoom', label: 'Actual size' },
      { role: 'zoomIn', label: 'Zoom in' },
      { role: 'zoomOut', label: 'Zoom out' },
      sep,
      { role: 'togglefullscreen', label: 'Full screen' },
      ...(packaged ? [] : ([sep, { role: 'reload' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[]))
    ]
  }

  const windowMenu: MenuItemConstructorOptions = {
    role: 'windowMenu'
  }

  const help: MenuItemConstructorOptions = {
    role: 'help',
    label: mac ? 'Help' : '&Help',
    submenu: [
      { label: 'Guides and help', click: () => hooks.send('about') },
      { label: 'Contact support…', click: () => hooks.openExternal(SUPPORT_MAILTO) },
      { label: 'Download page', click: () => hooks.openExternal(DOWNLOAD_PAGE) },
      ...(mac ? [] : ([sep, { label: `About ${PRODUCT_NAME}`, click: () => hooks.send('about') }] as MenuItemConstructorOptions[]))
    ]
  }

  return mac ? [appMenu, edit, view, windowMenu, help] : [file, edit, view, help]
}
