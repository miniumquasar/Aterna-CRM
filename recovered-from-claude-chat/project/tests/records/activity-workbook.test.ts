/**
 * Activity, notifications and Risk on the real master workbook (skipped unless
 * CRM_TEST_WORKBOOK points at it): every live client is ranked, the first
 * check of a partner's notifications comes as summaries rather than hundreds
 * of notices, and nothing is announced twice.
 */
import { describe, expect, it } from 'vitest'
import { commitPreviewed, describeFile, previewImport } from '../../src/main/import/pipeline'
import { companyNumber, watchedCompanies } from '../../src/main/records/ch-watch'
import { localDate } from '../../src/main/records/common'
import { listNotifications, refreshNotifications } from '../../src/main/records/notifications'
import { pulseDay } from '../../src/main/records/pulse'
import { riskReport } from '../../src/main/records/risk'
import { freshDb } from '../import/helpers'
import { partner } from './helpers'

const WORKBOOK = process.env.CRM_TEST_WORKBOOK

describe.skipIf(!WORKBOOK)('activity on the real master workbook', () => {
  it('ranks every live client, and announces many deadlines as one summary', async () => {
    const db = freshDb()
    db.prepare("INSERT INTO users (id, username, name, role, active, password_hash) VALUES (1, 'partner', 'Partner P', 'partner', 1, 'x')").run()
    const file = await describeFile(WORKBOOK!)
    const p = await previewImport(db, file, { today: localDate() })
    await commitPreviewed(db, file, p.report.fingerprint, 'Partner P', { today: localDate() })

    const started = Date.now()
    const report = riskReport(db, partner)
    const riskMs = Date.now() - started
    const live = (db.prepare("SELECT COUNT(*) AS n FROM clients c WHERE COALESCE(c.status, 'Active') NOT IN ('Former client', 'Dissolved') AND COALESCE(c.company_status, '') <> 'dissolved'").get() as { n: number }).n
    expect(report.rows).toHaveLength(live)
    expect(Object.values(report.counts).reduce((a, b) => a + b, 0)).toBe(live)
    expect(report.rows.every((r, i) => i === 0 || report.rows[i - 1].score >= r.score)).toBe(true)
    expect(riskMs).toBeLessThan(15_000)
    // Paperwork missing for everyone doesn't put everyone at the top: overdue filings and red flags do.
    expect(report.counts.high).toBeLessThan(live / 2)

    const first = refreshNotifications(db, partner)
    const deadlineNotices = first.created.filter((n) => n.kind === 'deadline')
    // Hundreds of open deadlines arrive as one summary, not one notice each.
    expect(deadlineNotices.length).toBeLessThanOrEqual(5)
    expect(refreshNotifications(db, partner).created).toEqual([])
    expect(listNotifications(db, partner).length).toBe(first.open)

    const regNos = (db.prepare("SELECT reg_no FROM clients WHERE reg_no IS NOT NULL AND trim(reg_no) <> ''").all() as Array<{ reg_no: string }>).map((r) => r.reg_no)
    const unreadable = regNos.filter((r) => !companyNumber(r)).length
    const today = pulseDay(db, partner)
    expect(today.items.length).toBeGreaterThan(0) // the import itself is today's change
    console.log('[real workbook activity]', JSON.stringify({
      clients: live, riskMs, bands: report.counts, practiceGaps: report.practiceGaps, topFactors: Object.entries(report.factorCounts).sort((a, b) => b[1] - a[1]).slice(0, 6),
      firstNotifications: first.created.map((n) => n.title), watchedCompanies: watchedCompanies(db).size, companyNumbersUnreadable: unreadable, todaysChanges: today.counts
    }))
  }, 240_000)
})
