/**
 * Password hashing with scrypt (Node's own crypto: no native module to build
 * per platform). Stored as `scrypt$N$r$p$salt$hash`, so the cost can rise
 * later and old hashes still verify. Comparison is constant-time.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export interface ScryptCost {
  N: number
  r: number
  p: number
}

/** About 100 ms on a modest PC. */
export const DEFAULT_COST: ScryptCost = { N: 2 ** 15, r: 8, p: 1 }
const KEY_BYTES = 32
const SALT_BYTES = 16

export const MIN_PASSWORD_LENGTH = 10
export const MAX_PASSWORD_LENGTH = 200

function derive(password: string, salt: Buffer, cost: ScryptCost): Buffer {
  return scryptSync(password.normalize('NFKC'), salt, KEY_BYTES, { N: cost.N, r: cost.r, p: cost.p, maxmem: 256 * cost.N * cost.r + 1024 * 1024 })
}

export function hashPassword(password: string, cost: ScryptCost = DEFAULT_COST): string {
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

/** A plain sentence about what is wrong with a new password, or null when it is fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`
  if (password.length > MAX_PASSWORD_LENGTH) return `Use a password of at most ${MAX_PASSWORD_LENGTH} characters.`
  if (password.trim() !== password) return 'A password can’t start or end with a space.'
  return null
}
