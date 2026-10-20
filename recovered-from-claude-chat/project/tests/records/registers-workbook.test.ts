/**
 * Level 4F on the real master workbook (skipped unless CRM_TEST_WORKBOOK points
 * at it): Reports, the client file and the deadline list count the same open
 * deadlines; every other name the workbook brings in finds its client the way
 * Go to… does, quickly; and the register panels read every client's rows.
 */
import { describe, expect, it } from 'vitest'
import { commitPreviewed, describeFile, previewImport } from '../../src/main/import/pipeline'
import { localDate } from '../../src/main/records/common'
import { openDeadlines } from '../../src/main/records/deadlines'
import { practiceReport } from '../../src/main/records/practice-report'
import { clientFile } from '../../src/main/data/registers'
import { listClients } from '../../src/main/records/clients'
import { listAliases, listPayrollSchemes, listPensionSchemes, listRelationships, saRegistration } from '../../src/main/records/registers'
import { rankClients } from '../../src/renderer/src/navigation/search'
import { freshDb } from '../import/helpers'
import { partner } from './helpers'

const WORKBOOK = process.env.CRM_TEST_WORKBOOK

describe.skipIf(!WORKBOOK)('the client file’s registers on the real master workbook', () => {
  it('counts deadlines the same everywhere, and finds clients by their other names', async () => {
    const db = freshDb()
    db.prepare("INSERT INTO users (id, username, name, role, active, password_hash) VALUES (1, 'partner', 'Partner P', 'partner', 1, 'x')").run()
    const file = await describeFile(WORKBOOK!)
    const today = localDate()
    const p = await previewImport(db, file, { today })
    await commitPreviewed(db, file, p.report.fingerprint, 'Partner P', { today })

    // Reports and the deadline list agree.
    const report = practiceReport(db, partner, today)
    const list = openDeadlines(db, partner, { withinDays: 90 }, today)
    expect(report.deadlines.overdue).toBe(list.filter((d) => d.days < 0).length)
    expect(report.deadlines.within90).toBe(list.filter((d) => d.days >= 0).length)
    expect(report.deadlines.within30).toBe(list.filter((d) => d.days >= 0 && d.days <= 30).length)

    // Every client's file agrees with the list, and its registers read.
    const clients = listClients(db, partner)
    const coded = clients.filter((c) => c.ref)
    let registersRead = 0
    const t0 = performance.now()
    for (const c of coded) {
      const ref = c.ref as string
      const theirs = openDeadlines(db, partner, { clientRef: ref, withinDays: 3650 }, today)
      const overview = clientFile(db, partner, ref, today).overview
      expect([ref, overview.openDeadlines, overview.overdueDeadlines]).toEqual([ref, theirs.length, theirs.filter((d) => d.days < 0).length])
      listPayrollSchemes(db, partner, ref)
      listPensionSchemes(db, partner, ref)
      saRegistration(db, partner, ref)
      listRelationships(db, partner, ref)
      listAliases(db, partner, ref)
      registersRead += 1
    }
    const perClient = (performance.now() - t0) / Math.max(1, registersRead)
    expect(perClient).toBeLessThan(250)

    // Every other name finds its client, as Go to… ranks them.
    const options = clients.map((c) => ({ id: c.id, ref: c.ref, client_name: c.client_name, business_name: c.business_name, reg_no: c.reg_no, other_names: c.other_names ?? null }))
    const aliases = db.prepare('SELECT client_ref, alias FROM client_aliases').all() as Array<{ client_ref: string; alias: string }>
    const t1 = performance.now()
    let found = 0
    for (const a of aliases) {
      const hits = rankClients(options, a.alias, 8)
      if (hits.some((h) => h.ref === a.client_ref)) found += 1
    }
    const perSearch = (performance.now() - t1) / Math.max(1, aliases.length)
    expect(found).toBe(aliases.length)
    expect(perSearch).toBeLessThan(25)
    console.log(
      `[4F workbook] ${coded.length} clients with a code; ${aliases.length} other names, all found; ` +
        `${list.filter((d) => d.days < 0).length} overdue and ${list.filter((d) => d.days >= 0).length} due within 90 days on both Reports and the list; ` +
        `registers ${perClient.toFixed(1)} ms a client; a search ${perSearch.toFixed(2)} ms`
    )
  })
})
