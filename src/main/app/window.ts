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
import { plainPageHtml } from '../startup/error-window'
import { isAllowedExternalUrl } from './external-links'
import type { Logger } from './logger'
import { dataPaths } from './paths'

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
  /** Called when the page's process stops unexpectedly (for the PC's crash reports). */
  onPageCrashed?: (reason: string) => void
}

let mainWindow: BrowserWindow | null = null

/** The app's own page: the built index.html, or (run from source) the dev server's origin. */
export type AppPage = { kind: 'file'; href: string } | { kind: 'origin'; origin: string }

let appPage: AppPage | null = null

export function appPageFor(o: { devServerUrl: string | null; rendererFile: string }): AppPage {
  return o.devServerUrl ? { kind: 'origin', origin: new URL(o.devServerUrl).origin } : { kind: 'file', href: pathToFileURL(o.rendererFile).href }
}

/**
 * True when `url` is the app's own page: exactly the built index.html with
 * any #route or ?query (never a sibling file, nor a longer path that merely
 * starts the same), or any page on the dev server's own origin.
 */
export function isUrlOfAppPage(url: string, page: AppPage | null): boolean {
  if (!page) return false
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (page.kind === 'origin') return u.origin === page.origin
  u.hash = ''
  u.search = ''
  return u.protocol === 'file:' && u.href === page.href
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

/** True for a URL inside the app's own page (any route, since routes are #hashes). */
export function isAppUrl(url: string): boolean {
  return isUrlOfAppPage(url, appPage)
}

/** The page reloads after a crash; more than this many crashes in a minute and it stops trying. */
const MAX_CRASHES_PER_MINUTE = 3

/** Crash times within the last minute, newest last; true when the page may be reloaded once more. */
export function mayReloadAfterCrash(crashes: number[], now: number): boolean {
  while (crashes.length && now - crashes[0] > 60_000) crashes.shift()
  crashes.push(now)
  return crashes.length <= MAX_CRASHES_PER_MINUTE
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
  appPage = appPageFor(o)
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
  const crashes: number[] = []
  wc.on('render-process-gone', (_event, details) => {
    o.onPageCrashed?.(details.reason)
    if (win.isDestroyed()) return
    if (mayReloadAfterCrash(crashes, Date.now())) {
      o.log.error(`The page stopped (${details.reason}); reloading it.`)
      void loadPage(win, o)
      return
    }
    o.log.error(`The page stopped (${details.reason}) again; it has stopped ${crashes.length} times in a minute, so it isn’t reloaded.`)
    let logPath: string | null = null
    try {
      logPath = dataPaths().appLog
    } catch {
      // Start-up always sets the data folder before the window exists.
    }
    const html = plainPageHtml({
      title: `${PRODUCT_NAME} stopped`,
      message: `${PRODUCT_NAME}’s window stopped working several times in a minute, so it hasn’t been reopened. Everything saved before then is safe. Close this window and start ${PRODUCT_NAME} again.`,
      logPath
    })
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => undefined)
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
