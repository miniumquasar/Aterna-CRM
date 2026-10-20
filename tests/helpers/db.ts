/**
 * A fresh in-memory practice database for a test: every migration applied,
 * and three people seeded — a partner, a manager and a member of staff —
 * with TEST_PASSWORD (hashed cheaply, for speed). Field sealing is ready
 * with a fixed test key.
 *
 *   const { db } = createTestDb()
 *   const actor = actorFor('staff')
 */
import type { Actor, Role } from '@shared/domain/roles'
import { hashPassword, setCostForNewHashes, type ScryptCost } from '@main/auth/passwords'
import { openMemoryDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { MIGRATIONS } from '@main/db/migrations'
import { initFieldCrypto } from '@main/security/field-crypto'

export const TEST_PASSWORD = 'correct horse battery'
export const TEST_DB_KEY = '0123456789abcdef'.repeat(4)
/** Far cheaper than the real cost; only for tests. */
export const TEST_SCRYPT_COST: ScryptCost = { N: 2 ** 10, r: 8, p: 1 }

const SEEDED: Record<Role, Actor> = {
  partner: { id: 1, username: 'pat.partner', name: 'Pat Partner', role: 'partner' },
  manager: { id: 2, username: 'morgan.manager', name: 'Morgan Manager', role: 'manager' },
  staff: { id: 3, username: 'sam.staff', name: 'Sam Staff', role: 'staff' }
}

let cachedHash: string | null = null

export interface TestDb {
  db: Db
  users: Record<Role, Actor>
}

export function createTestDb(options: { seedUsers?: boolean; firmName?: string | null } = {}): TestDb {
  const db = openMemoryDatabase()
  migrate(db, MIGRATIONS)
  initFieldCrypto(TEST_DB_KEY)
  // People created through the handlers (first partner, invites, resets) hash cheaply too.
  setCostForNewHashes(TEST_SCRYPT_COST)
  if (options.seedUsers !== false) {
    cachedHash ??= hashPassword(TEST_PASSWORD, TEST_SCRYPT_COST)
    const insert = db.prepare('INSERT INTO users (id, username, name, role, password_hash) VALUES (?, ?, ?, ?, ?)')
    for (const u of Object.values(SEEDED)) insert.run(u.id, u.username, u.name, u.role, cachedHash)
  }
  const firm = options.firmName === undefined ? 'Test Practice LLP' : options.firmName
  if (firm !== null) db.prepare('INSERT INTO firm (id, name) VALUES (1, ?)').run(firm)
  return { db, users: { ...SEEDED } }
}

/** The seeded person with that role, as handlers see them. */
export function actorFor(role: Role): Actor {
  return { ...SEEDED[role] }
}

let nextCode = 1

/** Adds a client (for tests that need one) and returns its id. */
export function addClient(db: Db, values: { name?: string; assignedTo?: number | null; code?: string; type?: string; status?: string } = {}): number {
  const code = values.code ?? `TC${String(nextCode++).padStart(4, '0')}`
  const r = db
    .prepare('INSERT INTO clients (code, name, type, status, assigned_to) VALUES (?, ?, ?, ?, ?)')
    .run(code, values.name ?? `Client ${code}`, values.type ?? 'company', values.status ?? 'active', values.assignedTo ?? null)
  return Number(r.lastInsertRowid)
}
