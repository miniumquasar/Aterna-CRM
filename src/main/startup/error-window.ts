/**
 * The window shown when start-up can't finish: what went wrong in plain
 * words, and where the start-up log is. It has no script and no bridge.
 */
import { BrowserWindow, app, dialog } from 'electron'
import { PRODUCT_NAME, SUPPORT_EMAIL, SUPPORT_PHONE } from '@shared/product'

const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

export interface PlainPage {
  /** The heading and the window title. */
  title: string
  message: string
  /** The log that says more, or null when it couldn't be written. */
  logPath: string | null
}

/** A page with no script: a heading, a plain message and where the log is. */
export function plainPageHtml({ title, message, logPath }: PlainPage): string {
  const where = logPath
    ? `<p>What happened is written in the log:</p><p class="path">${escape(logPath)}</p>`
    : '<p>The log couldn’t be written, so the details are only in this message.</p>'
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escape(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 15px/1.55 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; background: #1a0610; color: #f6eef2; }
  main { padding: 32px 36px; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 12px; }
  p { margin: 0 0 12px; color: #e6d6de; }
  .path { font: 13px/1.4 Consolas, "Cascadia Mono", monospace; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); border-radius: 8px; padding: 10px 12px; user-select: all; word-break: break-all; }
  .help { color: #cdb8c2; font-size: 13px; margin-top: 20px; }
</style></head>
<body><main>
  <h1>${escape(title)}</h1>
  <p>${escape(message)}</p>
  ${where}
  <p class="help">Close this window to quit. If you need help, contact ${escape(SUPPORT_EMAIL)} or ${escape(SUPPORT_PHONE)}.</p>
</main></body></html>`
}

export function startupErrorHtml(message: string, logPath: string | null): string {
  return plainPageHtml({ title: `${PRODUCT_NAME} couldn’t start`, message, logPath })
}

export async function showStartupError(message: string, logPath: string | null): Promise<void> {
  try {
    await app.whenReady()
    const win = new BrowserWindow({
      width: 680,
      height: 440,
      resizable: true,
      title: `${PRODUCT_NAME} couldn’t start`,
      backgroundColor: '#1a0610',
      autoHideMenuBar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false }
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    win.on('closed', () => app.quit())
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(startupErrorHtml(message, logPath))}`)
  } catch {
    dialog.showErrorBox(`${PRODUCT_NAME} couldn’t start`, `${message}${logPath ? `\n\nStart-up log: ${logPath}` : ''}`)
    app.quit()
  }
}
