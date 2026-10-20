/**
 * The database key as backups see it: its fingerprint (as printed on the
 * recovery sheet) and the key typed back from that sheet.
 */
import { createHash } from 'node:crypto'
import { keyFingerprint, parseRecoveryKey } from '../security/recovery-sheet'

const HEX_KEY = /^[0-9a-f]{64}$/i

/** "ABCD-1234": the recovery sheet's fingerprint, or for a key no sheet can hold, the same of its text. */
export function fingerprintOf(databaseKey: string): string {
  if (HEX_KEY.test(databaseKey)) return keyFingerprint(databaseKey.toLowerCase())
  const h = createHash('sha256').update(databaseKey, 'utf8').digest('hex').slice(0, 8).toUpperCase()
  return `${h.slice(0, 4)}-${h.slice(4)}`
}

/** A key typed from a recovery sheet, checked against the fingerprint a backup needs. */
export function keyFromSheet(typed: string, needed: string | null): { ok: true; key: string } | { ok: false; error: string } {
  const parsed = parseRecoveryKey(typed)
  if (!parsed.ok) return parsed
  if (needed && parsed.fingerprint !== needed) {
    return {
      ok: false,
      error: `This key’s fingerprint is ${parsed.fingerprint}, but the backup needs the key with fingerprint ${needed}. Check you have the right recovery sheet — the fingerprint is printed under the key.`
    }
  }
  return { ok: true, key: parsed.hexKey }
}
