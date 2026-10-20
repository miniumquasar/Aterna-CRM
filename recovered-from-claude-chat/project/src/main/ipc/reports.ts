/**
 * reports.ts — the practice report, on screen and as a PDF. The figures come
 * from ../records/practice-report.ts (staff: their own clients). Exporting is
 * a read, so it keeps working when the app is read-only.
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PracticeReport } from '@shared/types'
import { writeAudit } from '../access/audit'
import { getDb } from '../db/schema'
import { getLicence } from '../licence'
import { practiceReport, practiceReportHtml, reportFooter } from '../records/practice-report'
import { actor, replyAsync, rows } from './session'

/** The practice's name for a report's title: the firm's details, else the licensed firm. */
function practiceName(licensedTo: string | null): string {
  const firm = (getDb().prepare('SELECT name FROM firm_data ORDER BY id LIMIT 1').get() as { name: string } | undefined)?.name?.trim()
  return firm || licensedTo || 'Your practice'
}

export function registerReportHandlers(): void {
  ipcMain.handle('reports:practice', (): PracticeReport | null => rows('reports', null, () => practiceReport(getDb(), actor())))

  ipcMain.handle('reports:export-pdf', (event) =>
    replyAsync('reports', async () => {
      const me = actor()
      const report = practiceReport(getDb(), me)
      const licensedTo = getLicence().status().licensedTo
      const practice = practiceName(licensedTo)
      const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined
      // A file name Windows and macOS accept: no reserved or control characters.
      const safe = Array.from(practice, (ch) => (ch.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(ch) ? '_' : ch)).join('').slice(0, 80)
      const options = {
        title: 'Save the practice report',
        defaultPath: join(app.getPath('documents'), `${safe} practice report ${report.today}.pdf`),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      }
      const target = await (owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options))
      if (target.canceled || !target.filePath) return { saved: false as const }
      // A hidden page with no scripts and no network, used once and closed.
      const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } })
      try {
        const html = practiceReportHtml(report, { practice, licensedTo, preparedFor: me.name ?? 'you' })
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        const pdf = await win.webContents.printToPDF({
          pageSize: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
          footerTemplate: reportFooter(licensedTo, report.today), margins: { top: 0.6, bottom: 0.75, left: 0.6, right: 0.6 }
        })
        writeFileSync(target.filePath, pdf)
      } finally {
        win.destroy()
      }
      writeAudit(getDb(), me, 'Exported the practice report', null, null, null, { scope: report.scope, file: target.filePath.split(/[\\/]/).pop() })
      return { saved: true as const, path: target.filePath }
    })
  )
}

