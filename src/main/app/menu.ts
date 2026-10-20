/**
 * The application menu. Owned by the release domain. Installed builds have
 * no Reload or developer tools; macOS keeps the menus its keyboard shortcuts
 * (copy, paste, quit) need. Run from source, Electron's default menu stays
 * for Reload and developer tools.
 */
import { Menu, type MenuItemConstructorOptions } from 'electron'

export function installAppMenu(isPackaged: boolean): void {
  if (process.platform === 'darwin') {
    const template: MenuItemConstructorOptions[] = [{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]
    if (!isPackaged) template.push({ role: 'viewMenu' })
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
    return
  }
  if (isPackaged) Menu.setApplicationMenu(null)
}
