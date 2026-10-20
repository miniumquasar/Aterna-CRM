/**
 * Password hashing with scrypt (Node's own crypto: no native module to build
 * per platform). Stored as `scrypt$N$r$p$salt$hash`, so the cost can rise
 * later and old hashes still verify. Comparison is constant-time.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem } from '@shared/contracts/auth'

export { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem }

export interface ScryptCost {
  N: number
  r: number
  p: number
}

/** About 100 ms on a modest PC. */
export const DEFAULT_COST: ScryptCost = { N: 2 ** 15, r: 8, p: 1 }
const KEY_BYTES = 32
const SALT_BYTES = 16

function derive(password: string, salt: Buffer, cost: ScryptCost): Buffer {
  return scryptSync(password.normalize('NFKC'), salt, KEY_BYTES, { N: cost.N, r: cost.r, p: cost.p, maxmem: 256 * cost.N * cost.r + 1024 * 1024 })
}

let costForNewHashes: ScryptCost = DEFAULT_COST

/**
 * Tests only: a cheaper cost for hashes made from now on. Verifying always
 * reads the cost stored in each hash, so nothing else changes.
 */
export function setCostForNewHashes(cost: ScryptCost): void {
  costForNewHashes = cost
}

export function hashPassword(password: string, cost: ScryptCost = costForNewHashes): string {
  const salt = randomBytes(SALT_BYTES)
  const hash = derive(password, salt, cost)
  return ['scrypt', cost.N, cost.r, cost.p, salt.toString('base64'), hash.toString('base64')].join('$')
}

/** True when `password` matches `stored`. A malformed stored value never matches. */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  const parts = (stored ?? '').split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [N, r, p] = parts.slice(1, 4).map(Number)
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return false
  const salt = Buffer.from(parts[4], 'base64')
  const expected = Buffer.from(parts[5], 'base64')
  if (expected.length !== KEY_BYTES) return false
  const actual = derive(password, salt, { N, r, p })
  return timingSafeEqual(actual, expected)
}

/** A hash to verify against when the username is unknown, so the time taken doesn't tell. */
let decoy: string | null = null
export function decoyHash(): string {
  decoy ??= hashPassword(randomBytes(12).toString('hex'))
  return decoy
}
