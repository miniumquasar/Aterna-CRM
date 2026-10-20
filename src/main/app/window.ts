/**
 * The main window, locked down:
 *
 *  - contextIsolation, sandbox, no Node in the page, webSecurity on, no
 *    webviews; developer tools only when run from source;
 *  - navigation away from the app's own page and every new window refused;
 *    a link opens in the OS only when it is on the allow-list
 *    (external-links.ts);
 *  - backgroundColor from the saved theme, so there is no white flash.
 *
 * Title bar: the window has no native title bar ('hidden'); the renderer
 * draws its own (components/layout/TitleBar.tsx) and marks it as the drag
 * region. On Windows and Linux the native minimise, maximise and close
 * buttons are kept through Electron's titleBarOverlay, drawn over the top
 * right corner in the theme's colours (applyWindowTheme keeps them in step),
 * so snap layouts and keyboard behaviour stay Windows' own. On macOS the
 * traffic lights stay, inset ('hiddenInset'). The page reads the space the
 * controls take from the CSS env(titlebar-area-*) values.
 */
import { BrowserWindow, shell } from 'electron'
import { pathToFileURL } from 'node:url'
import { PRODUCT_NAME } from '@shared/product'
import type { WindowColours } from '../preferences/appearance'
import { isAllowedExternalUrl } from './external-links'
import type { Logger } from './logger'

export const TITLE_BAR_HEIGHT = 40

export interface MainWindowOptions {
  preloadPath: string
  /** electron-vite's dev server, or null to load the built page. */
  devServerUrl: string | null
  /** The built page: out/renderer/index.html. */
  rendererFile: string
  colours: WindowColours
  isPackaged: boolean
  log: Logger
  /** Called with the webContents id once the page has gone (its session ends). */
  onPageGone?: (webContentsId: number) => void
}

let mainWindow: BrowserWindow | null = null
let appUrlPrefix: string | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

/** True for a URL inside the app's own page (any route, since routes are #hashes). */
export function isAppUrl(url: string): boolean {
  return appUrlPrefix !== null && url.startsWith(appUrlPrefix)
}

function overlayFor(colours: WindowColours): Electron.TitleBarOverlayOptions {
  return { color: '#00000000', symbolColor: colours.symbol, height: TITLE_BAR_HEIGHT }
}

export function openExternalIfAllowed(url: string, log: Logger): void {
  if (isAllowedExternalUrl(url)) {
    void shell.openExternal(url).catch((err: unknown) => log.warn(`Couldn’t open ${url} outside the app.`, err))
  } else {
    log.warn(`Refused to open ${url}: it isn’t on the list of places the app may open.`)
  }
}

export function createMainWindow(o: MainWindowOptions): BrowserWindow {
  appUrlPrefix = o.devServerUrl ? `${new URL(o.devServerUrl).origin}/` : pathToFileURL(o.rendererFile).href
  const mac = process.platform === 'darwin'

  const win = new BrowserWindow({
    title: PRODUCT_NAME,
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: o.colours.background,
    autoHideMenuBar: true,
    ...(mac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 12 } }
      : { titleBarStyle: 'hidden' as const, titleBarOverlay: overlayFor(o.colours) }),
    webPreferences: {
      preload: o.preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: true,
      devTools: !o.isPackaged
    }
  })
  mainWindow = win
  const wc = win.webContents
  const id = wc.id

  wc.setWindowOpenHandler(({ url }) => {
    openExternalIfAllowed(url, o.log)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    openExternalIfAllowed(url, o.log)
  })
  wc.on('will-redirect', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  wc.on('will-attach-webview', (event) => event.preventDefault())
  wc.on('render-process-gone', (_event, details) => {
    o.log.error(`The page stopped (${details.reason}); reloading it.`)
    if (!win.isDestroyed()) void loadPage(win, o)
  })
  wc.on('destroyed', () => o.onPageGone?.(id))
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  win.once('ready-to-show', () => win.show())

  void loadPage(win, o)
  return win
}

function loadPage(win: BrowserWindow, o: MainWindowOptions): Promise<void> {
  return o.devServerUrl ? win.loadURL(o.devServerUrl) : win.loadFile(o.rendererFile)
}

/** Recolours the window behind the page and its window controls (after an appearance change). */
export function applyWindowTheme(colours: WindowColours): void {
  const win = getMainWindow()
  if (!win) return
  try {
    win.setBackgroundColor(colours.background)
    if (process.platform !== 'darwin') win.setTitleBarOverlay(overlayFor(colours))
  } catch {
    // Older window managers without overlay support: the page still recolours.
  }
}
