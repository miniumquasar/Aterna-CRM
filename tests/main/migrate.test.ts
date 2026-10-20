import { describe, expect, it } from 'vitest'
import { openMemoryDatabase } from '@main/db/connection'
import { MigrationError, appliedMigrations, compareMigrationIds, migrate, validateMigrations, type Migration } from '@main/db/migrate'
import { MIGRATIONS, MIGRATION_GROUPS } from '@main/db/migrations'

const tables = (db: ReturnType<typeof openMemoryDatabase>): string[] =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name)

describe('migrations', () => {
  it('apply in order, once, and record what ran', () => {
    const db = openMemoryDatabase()
    const first = migrate(db, MIGRATIONS)
    expect(first.applied).toEqual(MIGRATIONS.map((m) => m.id))
    expect(appliedMigrations(db)).toEqual(MIGRATIONS.map((m) => m.id))
    const second = migrate(db, MIGRATIONS)
    expect(second.applied).toEqual([])
    expect(tables(db)).toEqual(
      expect.arrayContaining(['app_meta', 'firm', 'settings', 'users', 'sessions', 'invites', 'sign_in_events', 'clients', 'client_services', 'client_contacts', 'audit_log', 'data_issues', 'notifications', 'schema_migrations'])
    )
  })

  it('keep every domain inside its own number range, with core first', () => {
    for (const g of MIGRATION_GROUPS) {
      for (const m of g.migrations) {
        const n = Number(m.id.slice(0, 4))
        expect(n, `${m.id} is outside ${g.domain}’s range ${g.from}–${g.to}`).toBeGreaterThanOrEqual(g.from)
        expect(n).toBeLessThanOrEqual(g.to)
      }
    }
    const ranges = MIGRATION_GROUPS.map((g) => [g.from, g.to] as const)
    for (let i = 1; i < ranges.length; i++) expect(ranges[i][0]).toBeGreaterThan(ranges[i - 1][1])
    expect(MIGRATIONS[0].id).toBe('0001_core')
    expect(() => validateMigrations(MIGRATIONS)).not.toThrow()
  })

  it('roll back a migration that fails, leaving the database as it was', () => {
    const db = openMemoryDatabase()
    migrate(db, MIGRATIONS)
    const broken: Migration = {
      id: '0499_broken',
      up(d) {
        d.exec('CREATE TABLE half_done (id INTEGER PRIMARY KEY)')
        d.exec('INSERT INTO no_such_table VALUES (1)')
      }
    }
    expect(() => migrate(db, [...MIGRATIONS, broken])).toThrow(MigrationError)
    expect(tables(db)).not.toContain('half_done')
    expect(appliedMigrations(db)).not.toContain('0499_broken')
  })

  it('refuse a database that a newer version has migrated', () => {
    const db = openMemoryDatabase()
    migrate(db, MIGRATIONS)
    db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run('9999_from_the_future')
    expect(() => migrate(db, MIGRATIONS)).toThrow(/newer version of AETERNA CRM/)
  })

  it('refuse malformed and repeated ids, and two migrations with one number', () => {
    expect(() => validateMigrations([{ id: 'core', up() {} }])).toThrow()
    expect(() => validateMigrations([{ id: '0401_a', up() {} }, { id: '0401_a', up() {} }])).toThrow(/twice/)
    expect(() => validateMigrations([{ id: '0401_a', up() {} }, { id: '0401_b', up() {} }])).toThrow(/share the number 0401/)
  })

  it('apply by id, character by character, whatever order a folder lists them in', () => {
    const ran: string[] = []
    const m = (id: string): Migration => ({ id, up: () => void ran.push(id) })
    const db = openMemoryDatabase()
    migrate(db, ['0402_b_c', '0401_a_b', '1000_x', '0403_a'].map(m))
    expect(ran).toEqual(['0401_a_b', '0402_b_c', '0403_a', '1000_x'])
    expect(['0401_z', '0401_a', '0400_b'].sort(compareMigrationIds)).toEqual(['0400_b', '0401_a', '0401_z'])
  })

  it('are listed oldest first in each domain’s folder', () => {
    for (const g of MIGRATION_GROUPS) {
      const ids = g.migrations.map((x) => x.id)
      expect(ids, `${g.domain}’s migrations/index.ts lists them out of order`).toEqual([...ids].sort(compareMigrationIds))
    }
  })

  it('check foreign keys for a table rebuild before committing it', () => {
    const db = openMemoryDatabase()
    migrate(db, MIGRATIONS)
    db.prepare("INSERT INTO clients (code, name) VALUES ('CL0001', 'Alder Ltd')").run()
    db.prepare("INSERT INTO client_contacts (client_id, name) VALUES (1, 'Ann Alder')").run()
    const rebuild: Migration = {
      id: '0401_rebuild',
      foreignKeys: 'off',
      up(d) {
        d.exec('DELETE FROM clients') // would orphan the contact
      }
    }
    expect(() => migrate(db, [...MIGRATIONS, rebuild])).toThrow(MigrationError)
    expect((db.prepare('SELECT count(*) AS n FROM clients').get() as { n: number }).n).toBe(1)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })
})
