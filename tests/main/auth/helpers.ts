/**
 * The auth domain's test kit: a practice database with the seeded partner,
 * manager and member of staff, the IPC through the real registry with a
 * clock the test moves, and cheap password hashes.
 */
import { afterEach, beforeAll } from 'vitest'
import type { Role } from '@shared/domain/roles'
import { setCostForNewHashes } from '@main/auth/passwords'
import { resetPersonLinkChecks } from '@main/auth/person-links'
import { clearAllReauth } from '@main/auth/reauth'
import { clearSetupProbes } from '@main/auth/setup-state'
import { clearInviteAttempts } from '@main/auth/invites'
import { setRuntimeInfo } from '@main/app/runtime'
import { TEST_PASSWORD, TEST_SCRYPT_COST, createTestDb, type TestDb } from '../../helpers/db'
import { createTestIpc, type TestIpc } from '../../helpers/ipc'

export { TEST_PASSWORD }

export const START = new Date('2026-10-20T09:00:00.000Z')

export interface Clock {
  now: Date
  /** Moves the clock on. */
  advance(ms: number): void
}

export const minutes = (n: number): number => n * 60_000

export function useCheapHashes(): void {
  beforeAll(() => setCostForNewHashes(TEST_SCRYPT_COST))
  afterEach(() => {
    resetPersonLinkChecks()
    clearSetupProbes()
    clearAllReauth()
    clearInviteAttempts()
    setRuntimeInfo({ packaged: false })
  })
}

export interface Practice extends TestDb {
  ipc: TestIpc
  clock: Clock
  /** Another window on the same database (same handlers, its own session). */
  window(): TestIpc
  /** Signs in through auth.signIn as the seeded person with that role. */
  signIn(role: Role, ipc?: TestIpc): Promise<void>
  count(sql: string, ...params: unknown[]): number
}

export function practice(options: Parameters<typeof createTestDb>[0] = {}): Practice {
  const test = createTestDb(options)
  const clock: Clock = {
    now: new Date(START),
    advance(ms) {
      this.now = new Date(this.now.getTime() + ms)
    }
  }
  const ipc = createTestIpc(test.db, { now: () => clock.now })
  const p: Practice = {
    ...test,
    ipc,
    clock,
    window: () => createTestIpc(test.db, { now: () => clock.now, register: false }),
    async signIn(role, on = ipc) {
      await on.ok('auth.signIn', { username: test.users[role].username, password: TEST_PASSWORD })
    },
    count(sql, ...params) {
      return (test.db.prepare(sql).get(...params) as { n: number }).n
    }
  }
  return p
}
