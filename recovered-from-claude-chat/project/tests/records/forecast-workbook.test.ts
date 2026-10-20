/**
 * Forecast, the assistant's context and the audit seals on the real master
 * workbook (skipped unless CRM_TEST_WORKBOOK points at it): the forecast adds
 * up to the same deadlines as the deadline list, quickly; what the assistant
 * is given stays short and holds no tax reference, NI number or code; and the
 * log of the import seals and checks intact.
 */
import { describe, expect, it } from 'vitest'
import { commitPreviewed, describeFile, previewImport } from '../../src/main/import/pipeline'
import { clientContext, forecastContext } from '../../src/main/records/ai-context'
import { checkAuditLog, sealAuditLog } from '../../src/main/records/audit-seal'
import { localDate } from '../../src/main/records/common'
import { openDeadlines } from '../../src/main/records/deadlines'
import { forecast } from '../../src/main/records/forecast'
import { MAX_CONTEXT } from '../../src/main/system/local-ai'
import { freshDb } from '../import/helpers'
import { partner } from './helpers'

const WORKBOOK = process.env.CRM_TEST_WORKBOOK
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

describe.skipIf(!WORKBOOK)('forecast on the real master workbook', () => {
  it('adds up to the deadline list, quickly, and the assistant is given short, safe context', async () => {
    const db = freshDb()
    db.prepare("INSERT INTO users (id, username, name, role, active, password_hash) VALUES (1, 'partner', 'Partner P', 'partner', 1, 'x')").run()
    const file = await describeFile(WORKBOOK!)
    const today = localDate()
    const p = await previewImport(db, file, { today })
    await commitPreviewed(db, file, p.report.fingerprint, 'Partner P', { today })

    for (const months of [3, 6, 12]) {
      const t = performance.now()
      const f = forecast(db, partner, { months }, today)
      expect(performance.now() - t).toBeLessThan(2_000)
      const w = f.workload
      const last = f.months[f.months.length - 1].key
      const listed = openDeadlines(db, partner, { withinDays: 3650 }, today).filter((d) => d.days < 0 || d.due_date.slice(0, 7) <= last)
      expect(w.overdue + sum(w.byMonth)).toBe(listed.length)
      expect(sum(w.byObligation.map((o) => o.total))).toBe(listed.length)
      expect(sum(w.byPerson.map((x) => x.total))).toBe(listed.length)
      expect(f.fees.byMonth.every((n) => Number.isInteger(n) && n >= 0)).toBe(true)
      const text = forecastContext(f)
      expect(text.length).toBeLessThan(MAX_CONTEXT)
    }

    // The client with the most open deadlines: its file for the assistant holds no secret from the record.
    const busiest = db.prepare(
      "SELECT client_ref AS ref, COUNT(*) AS n FROM compliance_periods WHERE filed_date IS NULL AND archived = 0 GROUP BY client_ref ORDER BY n DESC LIMIT 1"
    ).get() as { ref: string } | undefined
    if (busiest) {
      const record = db.prepare('SELECT nino, auth_code, utr, ct_ref, paye_ref, vat_number FROM clients WHERE ref = ?').get(busiest.ref) as Record<string, string | null> | undefined
      const text = clientContext(db, partner, busiest.ref, today)
      expect(text.length).toBeLessThan(MAX_CONTEXT)
      for (const [column, value] of Object.entries(record ?? {})) {
        if (value && String(value).trim().length >= 5) expect([column, text.includes(String(value).trim())]).toEqual([column, false])
      }
    }

    expect(sealAuditLog(db).sealed).toBe(true)
    expect(checkAuditLog(db)).toMatchObject({ state: 'intact', unsealed: 0 })
  }, 120_000)
})

