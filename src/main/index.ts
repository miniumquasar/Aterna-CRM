/**
 * AETERNA CRM's main process. Start-up runs nine steps in this order, each
 * logged to logs/startup.log in the data folder; a step that fails shows a
 * plain-language error window with the log's path, and nothing after it runs.
 *
 *   1. Single-instance lock and the Windows app ID.
 *   2. Data folder (AETERNA_DATA_DIR for tests and smoke runs).
 *   3. Database: a staged restore swapped in, key (or the recovery sheet),
 *      open, integrity check, migrations.
 *   4. One-time conversion of values sealed under an older scheme.
 *   5. Licence.
 *   6. Every handler group.
 *   7. Wiring report: any contract channel without a handler.
 *   8. Main window.
 *   9. Background jobs.
 */
import { join } from 'node:path'
import { app, ipcMain, nativeTheme, session } from 'electron'
import { APP_ID } from '@shared/product'
import { createFileLogger, log, setAppLogger } from './app/logger'
import { addStartupNotice } from './app/notices'
import { isPlainError } from './app/plain-error'
import { dataPathsFor, ensureDataFolders, findLegacyData, resolveDataRoot, setDataPaths, type DataPaths } from './app/paths'
import { setRuntimeInfo } from './app/runtime'
import { installAppMenu } from './app/menu'
import { createMainWindow, getMainWindow, isAppUrl } from './app/window'
import { applyPendingRestore, recoverDatabaseKey } from './backup/startup'
import { closeDb, getDb, setDb } from './db/connection'
import { migrate } from './db/migrate'
import { MIGRATIONS } from './db/migrations'
import { emit, setEventTarget } from './events'
import { closeAbandonedSessions, endSessionForSender } from './ipc/context'
import { registerAllHandlers } from './ipc/register-all'
import { defaultRegistryDeps, installIpc, wiringReport } from './ipc/registry'
import { startJobs, stopJobs } from './jobs'
import { startLicence } from './licence/startup'
import { readAppearance, windowColours } from './preferences/appearance'
import { initFieldCrypto } from './security/field-crypto'
import { recordCrash, startCrashReports } from './system/crash-reports'
import { runConversions } from './startup/conversions'
import { openPracticeDatabase } from './startup/database'
import { showStartupError } from './startup/error-window'
import { StartupFailure, StartupRunner } from './startup/steps'

const runner = new StartupRunner(9)

// The product is UK-only: dates as dd/mm/yyyy and en-GB number and date
// defaults on any Windows locale (date boxes otherwise follow the system's).
// Switches must be set before the app is ready.
app.commandLine.appendSwitch('lang', 'en-GB')

// Tests and smoke runs (AETERNA_DATA_DIR) keep Chromium's own profile (page
// storage, caches and the single-instance lock) inside their data folder, so
// each run starts clean and runs from several checkouts don't collide.
if (process.env.AETERNA_DATA_DIR?.trim()) app.setPath('userData', join(resolveDataRoot(app.getPath('appData')), 'chromium-profile'))

async function start(): Promise<void> {
  // 1 ─ One copy at a time, with the right identity on Windows.
  const first = await runner.run(1, 'Single-instance lock and app ID', () => {
    if (!app.requestSingleInstanceLock()) return false
    app.setAppUserModelId(APP_ID)
    app.on('second-instance', () => {
      const win = getMainWindow()
      if (!win) return
      if (win.isMinimized()) win.restore()
      win.focus()
    })
    return true
  })
  if (!first) {
    runner.line('Another copy is already running; this one closes.')
    app.quit()
    return
  }
  await app.whenReady()

  // 2 ─ The data folder.
  const paths: DataPaths = await runner.run(2, 'Data folder', () => {
    const appData = app.getPath('appData')
    const p = dataPathsFor(resolveDataRoot(appData))
    ensureDataFolders(p)
    setDataPaths(p)
    runner.attachLog(p.startupLog)
    setAppLogger(createFileLogger(p.appLog, { echo: !app.isPackaged }))
    setRuntimeInfo({ version: app.getVersion(), packaged: app.isPackaged, dataFolder: p.root })
    runner.line(`data folder: ${p.root}`)
    startCrashReports({ paths: p, log: log().child('crash') })
    for (const legacy of findLegacyData(appData, p.root)) {
      // Earlier builds used another schema and cipher, so their data is not moved; the import domain reads it.
      addStartupNotice('info', `Data from an earlier version of the app was found at ${legacy}. It has been left where it is.`)
      runner.line(`data from an earlier build left in place: ${legacy}`)
    }
    return p
  })

  // 3 ─ The database: a staged restore, the key, open, integrity check, migrations.
  const windowFiles = {
    preloadPath: join(__dirname, '../preload/index.js'),
    rendererFile: join(__dirname, '../renderer/index.html'),
    devServerUrl: !app.isPackaged && process.env.ELECTRON_RENDERER_URL ? process.env.ELECTRON_RENDERER_URL : null
  }
  await runner.run(3, 'Database', async () => {
    const opened = await openPracticeDatabase(paths, {
      applyPendingRestore,
      recoverDatabaseKey,
      window: windowFiles,
      log: log(),
      now: () => new Date(),
      line: (message) => runner.line(message)
    })
    for (const notice of opened.notices) addStartupNotice('warning', notice)
    setDb(opened.db)
    initFieldCrypto(opened.key)
    const result = migrate(opened.db, MIGRATIONS, log().child('migrate'))
    runner.line(`migrations: ${result.applied.length} applied, ${result.total} in all`)
    const closed = closeAbandonedSessions(opened.db)
    if (closed) runner.line(`${closed} session(s) from the last run closed`)
  })

  // 4 ─ Values sealed under an older scheme, once.
  await runner.run(4, 'Conversion of older sealed values', () => {
    runConversions(getDb(), log().child('conversions'))
  })

  // 5 ─ The licence.
  await runner.run(5, 'Licence', () => startLicence({ db: getDb(), paths, log: log().child('licence'), now: new Date() }))

  // 6 ─ Every handler group, behind the one registry.
  await runner.run(6, 'Handlers', () => {
    registerAllHandlers()
    installIpc(ipcMain, defaultRegistryDeps(), {
      isTrustedSender: (event) => !!event.senderFrame && !event.senderFrame.parent && isAppUrl(event.senderFrame.url)
    })
  })

  // 7 ─ Any channel without a handler.
  await runner.run(7, 'Wiring report', () => {
    const report = wiringReport()
    if (report.missing.length) {
      log().warn(`Channels without a handler: ${report.missing.join(', ')}`)
      runner.line(`${report.missing.length} of ${report.total} channels have no handler: ${report.missing.join(', ')}`)
    } else {
      runner.line(`all ${report.total} channels have handlers`)
    }
  })

  // 8 ─ The main window.
  await runner.run(8, 'Main window', () => {
    installAppMenu(app.isPackaged)
    const deny = (_wc: unknown, permission: string): boolean => permission === 'clipboard-sanitized-write'
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(deny(wc, permission)))
    session.defaultSession.setPermissionCheckHandler((wc, permission) => deny(wc, permission))
    // UK English for the spelling checker (macOS uses its own, set in System Settings).
    if (process.platform !== 'darwin' && session.defaultSession.availableSpellCheckerLanguages.includes('en-GB')) {
      session.defaultSession.setSpellCheckerLanguages(['en-GB'])
    }
    mainWindowOpened = true
    const win = createMainWindow({
      ...windowFiles,
      colours: windowColours(readAppearance(getDb()), nativeTheme.shouldUseDarkColors),
      isPackaged: app.isPackaged,
      log: log().child('window'),
      onPageCrashed: (reason) => recordCrash('page', reason, log().child('crash')),
      onPageGone: (id) => {
        try {
          endSessionForSender(getDb(), id)
        } catch {
          // The database may already be closed at quit.
        }
      }
    })
    setEventTarget(() => (win.isDestroyed() ? null : win.webContents))
  })

  // 9 ─ Background jobs.
  await runner.run(9, 'Background jobs', () => {
    const started = startJobs({ db: getDb(), log: log().child('jobs'), now: () => new Date(), emit })
    runner.line(started.length ? `jobs started: ${started.join(', ')}` : 'no background jobs registered')
  })
  runner.line('start-up finished')
}

// Every page the app ever makes (the main window, the start-up error window,
// a hidden window that prints a PDF): no webviews, no pop-ups, and no
// navigation away. The main window then sets its own, narrower rules
// (in-app routes, allow-listed links opened in the OS).
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event) => {
    if (getMainWindow()?.webContents !== contents) event.preventDefault()
  })
})

// Quit when the main window closes. Before it exists, a start-up hook's own
// window (unlocking with the recovery sheet) may close without ending start-up.
let mainWindowOpened = false
app.on('window-all-closed', () => {
  if (mainWindowOpened) app.quit()
})

app.on('will-quit', () => {
  stopJobs()
  closeDb()
})

start().catch((err: unknown) => {
  const cause = err instanceof StartupFailure ? err.cause : err
  const step = err instanceof StartupFailure ? ` (step ${err.step}: ${err.stepName})` : ''
  const message = isPlainError(cause) ? cause.message : `Something unexpected stopped start-up${step}. The start-up log says what happened.`
  try {
    log().error('Start-up stopped.', err)
  } catch {
    // Logging is best effort here.
  }
  void showStartupError(message, runner.logFile)
})
