import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { describeSchedule, isDue, nextDue, scheduledToRemove, type ScheduleSettings } from '../../src/main/backup/schedule'
import { BackupService } from '../../src/main/backup/service'
import { fingerprintOf } from '../../src/main/backup/keys'
import { storeFolderIn } from '../../src/main/backup/store'
import { APP_MIGRATION, KEY, practice } from './helpers'

const local = (y: number, m: number, d: number, h = 0, min = 0): Date => new Date(y, m - 1, d, h, min)

describe('the backup schedule', () => {
  it('is due at the set time each day, or at the next start when the PC was off', () => {
    const daily: ScheduleSettings = { schedule: 'daily', time: '12:30', weekday: 5 }
    expect(isDue(daily, null, local(2026, 10, 12, 9))).toBe(true) // never backed up: now
    expect(isDue(daily, local(2026, 10, 12, 9, 1), local(2026, 10, 12, 12, 29))).toBe(false)
    expect(isDue(daily, local(2026, 10, 12, 9, 1), local(2026, 10, 12, 12, 30))).toBe(true)
    expect(isDue(daily, local(2026, 10, 12, 12, 30), local(2026, 10, 13, 9))).toBe(false)
    // Off at 12:30 yesterday and the day before: the next start makes it.
    expect(isDue(daily, local(2026, 10, 10, 12, 31), local(2026, 10, 12, 9))).toBe(true)
    expect(nextDue(daily, local(2026, 10, 12, 12, 30), local(2026, 10, 12, 15))).toEqual(local(2026, 10, 13, 12, 30))
  })

  it('handles weekly, every few hours and off', () => {
    const weekly: ScheduleSettings = { schedule: 'weekly', time: '17:00', weekday: 5 } // Fridays
    expect(nextDue(weekly, local(2026, 10, 9, 17, 5), local(2026, 10, 12, 9))).toEqual(local(2026, 10, 16, 17))
    expect(isDue(weekly, local(2026, 10, 2, 17), local(2026, 10, 12, 9))).toBe(true)
    expect(nextDue({ schedule: 'every-4-hours', time: '12:30', weekday: 0 }, local(2026, 10, 12, 9), local(2026, 10, 12, 10))).toEqual(local(2026, 10, 12, 13))
    expect(nextDue({ schedule: 'off', time: '12:30', weekday: 0 }, null, local(2026, 10, 12))).toBeNull()
    expect(describeSchedule(weekly)).toBe('Every Friday at 17:00')
  })

  it('keeps every backup from 2 days, then one a day for 2 weeks, a week for 8 weeks, a month for a year', () => {
    const now = local(2026, 10, 12, 13)
    const backups = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, createdAt: new Date(now.getTime() - i * 24 * 3_600_000 - 30 * 60_000) }))
    // Hourly ones today too.
    for (let h = 1; h <= 10; h++) backups.push({ id: 1000 + h, createdAt: new Date(now.getTime() - h * 3_600_000) })
    const removed = new Set(scheduledToRemove(backups, now))
    const kept = backups.filter((b) => !removed.has(b.id))
    const age = (b: { createdAt: Date }): number => (now.getTime() - b.createdAt.getTime()) / 86_400_000
    expect(kept.filter((b) => age(b) < 2)).toHaveLength(backups.filter((b) => age(b) < 2).length)
    expect(kept.filter((b) => age(b) >= 2 && age(b) < 14).length).toBe(12)
    expect(kept.every((b) => age(b) < 366)).toBe(true)
    expect(kept.length).toBeLessThan(50)
    expect(kept.length).toBeGreaterThan(30)
    // The newest is always kept, even when it is old.
    expect(scheduledToRemove([{ id: 1, createdAt: local(2024, 1, 1) }, { id: 2, createdAt: local(2023, 1, 1) }], now)).toEqual([2])
  })
})

describe('the backup service', () => {
  function service(p = practice()) {
    const activity: string[] = []
    const svc = new BackupService({
      db: () => p.db, dbPath: () => p.dbPath, dataDir: p.dir, docsDir: p.docsDir, databaseKey: () => KEY, appVersion: '5.0.0', appMigration: APP_MIGRATION,
      now: p.now, onActivity: (a) => activity.push(a ? `${a.activity}:${a.stage}` : 'idle')
    })
    return { p, svc, activity }
  }

  it('saves the schedule and folder with an audit entry, refusing a folder it can’t write to', () => {
    const { p, svc } = service()
    expect(svc.settings()).toEqual({ schedule: 'daily', time: '12:30', weekday: 5, folder: null })
    const drive = mkdtempSync(join(tmpdir(), 'usb-'))
    svc.saveSettings({ schedule: 'weekly', time: '17:00', weekday: 4, folder: drive }, { id: 1, name: 'Pat Partner' })
    expect(svc.settings()).toEqual({ schedule: 'weekly', time: '17:00', weekday: 4, folder: drive })
    expect(p.db.prepare("SELECT user_name, action FROM audit_log WHERE action = 'Changed the backup settings'").get()).toEqual({ user_name: 'Pat Partner', action: 'Changed the backup settings' })
    expect(() => svc.saveSettings({ time: '25:00' }, null)).toThrow(/hours and minutes/)
    expect(() => svc.saveSettings({ schedule: 'sometimes' }, null)).toThrow(/Unknown/)
    expect(() => svc.saveSettings({ folder: join(drive, 'not-there') }, null)).toThrow(/can’t be written/)
    expect(svc.currentStore().store).toBe(storeFolderIn(drive, fingerprintOf(KEY)))
    // The drive unplugged: backups go to the app's own folder, and say so.
    rmSync(drive, { recursive: true })
    expect(svc.currentStore(true)).toMatchObject({ store: svc.defaultStore(), chosen: drive })
    expect(svc.currentStore().problem).toMatch(/isn’t available/)
    // A folder inside the app's own data folder isn't a backup off this computer.
    expect(() => svc.saveSettings({ folder: join(p.dir, 'backups') }, null)).toThrow(/outside the app’s own data folder/)
  })

  it('makes the scheduled backup when due, one job at a time, and waits after a failure', async () => {
    const { p, svc, activity } = service()
    p.addDocument('CL0001', 'a.pdf', 'aaa')
    const first = await svc.runScheduledIfDue()
    expect(first.ran).toBe(true)
    expect(activity).toContain('backup:documents')
    expect(activity.at(-1)).toBe('idle')
    expect(await svc.runScheduledIfDue()).toEqual({ ran: false })
    expect(svc.status()).toMatchObject({ count: 1, keyFingerprint: fingerprintOf(KEY), lastBackup: { kind: 'scheduled' }, running: null })

    const one = svc.backUp('manual', null, null)
    await expect(svc.backUp('manual', null, null)).rejects.toThrow(/being made right now/)
    await one

    // The next day the scheduled backup fails (the folder can't be written): recorded, and not retried for an hour.
    p.setNow('2026-10-13T13:00:00Z')
    const store = svc.defaultStore()
    rmSync(store, { recursive: true })
    writeFileSync(store, 'a file where the folder should be')
    const failed = await svc.runScheduledIfDue()
    expect(failed).toMatchObject({ ran: true })
    expect('error' in failed && failed.error).toBeTruthy()
    expect(svc.status().lastError?.message).toBeTruthy()
    expect(await svc.runScheduledIfDue()).toEqual({ ran: false })
    rmSync(store)
    p.setNow('2026-10-13T14:01:00Z')
    expect((await svc.runScheduledIfDue()).ran).toBe(true)
    expect(svc.status().lastError).toBeNull()
  })

  it('tests a backup and records the result; deletes a backup with its file', async () => {
    const { p, svc } = service()
    p.addDocument('CL0001', 'a.pdf', 'aaa')
    const made = await svc.backUp('manual', { id: 1, name: 'Pat Partner' }, 'by hand')
    const result = await svc.test(made.id, { id: 1, name: 'Pat Partner' })
    expect(result.ok).toBe(true)
    expect(svc.list()[0]).toMatchObject({ id: made.id, exists: true, tested_at: expect.any(String) })
    expect(svc.status().lastTest).toMatchObject({ ok: true, filename: made.filename })
    await svc.remove(made.id, { id: 1, name: 'Pat Partner' })
    expect(existsSync(made.path)).toBe(false)
    expect(svc.list()).toEqual([])
    expect(p.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('Tested a backup', 'Deleted a backup')").get()).toEqual({ n: 2 })
  })

  it('tidies scheduled backups past keeping, never ones made by hand', async () => {
    const { p, svc } = service()
    const manual = await svc.backUp('manual', null, null)
    for (let d = 1; d <= 20; d++) {
      p.setNow(`2026-10-${String(d).padStart(2, '0')}T13:00:00Z`)
      await svc.backUp('scheduled', null, null)
    }
    const left = svc.list()
    expect(left.some((b) => b.id === manual.id)).toBe(true)
    // 20 daily backups: the last 2 days, plus one a day for 2 weeks — 15 or so kept.
    expect(left.filter((b) => b.kind === 'scheduled').length).toBeLessThanOrEqual(16)
    expect(left.filter((b) => b.kind === 'scheduled').length).toBeGreaterThanOrEqual(14)
    expect(left.every((b) => b.exists)).toBe(true)
    expect(p.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'Removed old scheduled backups'").get()).toMatchObject({ n: expect.any(Number) })
  })
})
