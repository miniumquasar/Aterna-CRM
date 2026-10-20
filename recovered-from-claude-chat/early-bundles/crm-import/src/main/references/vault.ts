/**
 * Credential vault for portal logins that may be kept (pension providers,
 * bookkeeping and payroll software, banks' business portals — never HMRC or
 * GOV.UK sign-in, which is refused outright).
 *
 *   key        scrypt(passphrase, salt). The passphrase is typed by a partner or
 *              manager to unlock and is never written anywhere; only a verifier
 *              (HMAC of a fixed label under the key) is stored, in vault_keys.
 *   secrets    AES-256-GCM, fresh 12-byte IV each time, authenticated against
 *              "aeterna-vault:<row id>" so a ciphertext copied onto another row
 *              fails to open. The row id never changes when a client is renamed.
 *   unlocked   the key is held in main-process memory only, and wiped after 15
 *              minutes without use or on lock. Five wrong passphrases in a row
 *              lock unlocking for 30 seconds.
 *   audit      setting up, unlocking, saving, revealing and removing are each
 *              written to audit_log. Secret values never are.
 *
 * Losing the passphrase means the stored secrets can't be opened again. That
 * is the point: a copy of the database and its key file is not enough.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { VaultEntry, VaultEntryInput, VaultStatus } from '../../shared/types'
import { GOVERNMENT_SIGN_IN_REFUSAL, isGovernmentSignIn } from '../../shared/references'
import { canManage, clientForActor, UserFacingError, type Actor, type AuditFn } from './service'

export interface KdfParams {
  N: number
  r: number
  p: number
}

export interface VaultOptions {
  now?: () => number
  idleMinutes?: number
  kdf?: KdfParams
}

export const DEFAULT_KDF: KdfParams = { N: 2 ** 17, r: 8, p: 1 }
export const MIN_PASSPHRASE_LENGTH = 12
const MAX_SECRET_LENGTH = 1000
const VERIFIER_LABEL = 'aeterna-vault-verifier-v1'
const MAX_FAILURES = 5
const LOCKOUT_MS = 30_000

interface KeyRow {
  version: number
  salt: string
  n: number
  r: number
  p: number
  verifier: string
}

interface EntryRow {
  id: number
  owner: 'client' | 'practice'
  client_ref: string | null
  platform: string
  login_id: string | null
  url: string | null
  notes: string | null
  secret_ct: string | null
  secret_iv: string | null
  secret_tag: string | null
  key_version: number | null
  reveal_count: number
  last_revealed_at: string | null
  last_revealed_by: string | null
  updated_at: string
}

const toEntry = (r: EntryRow): VaultEntry => ({
  id: r.id,
  owner: r.owner,
  clientRef: r.client_ref,
  platform: r.platform,
  loginId: r.login_id,
  url: r.url,
  notes: r.notes,
  hasSecret: r.secret_ct !== null,
  revealCount: r.reveal_count,
  lastRevealedAt: r.last_revealed_at,
  lastRevealedBy: r.last_revealed_by,
  updatedAt: r.updated_at
})

/** What the audit log records about an entry: never the secret. */
const auditView = (r: EntryRow | undefined): Record<string, unknown> | null =>
  r ? { owner: r.owner, client_ref: r.client_ref, platform: r.platform, login_id: r.login_id, url: r.url, has_secret: r.secret_ct !== null } : null

const deriveKey = (passphrase: string, salt: Buffer, kdf: KdfParams): Buffer =>
  scryptSync(passphrase.normalize('NFKC'), salt, 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * 1024 * 1024 })

const verifierFor = (key: Buffer): Buffer => createHmac('sha256', key).update(VERIFIER_LABEL).digest()

const aadFor = (id: number): Buffer => Buffer.from(`aeterna-vault:${id}`, 'utf8')

const cleanText = (value: string | null | undefined, max: number, label: string): string | null => {
  const t = (value ?? '').trim()
  if (!t) return null
  if (t.length > max) throw new UserFacingError(`${label} is longer than ${max} characters.`)
  return t
}

export class CredentialVault {
  private key: Buffer | null = null
  private keyVersion = 0
  private lastUse = 0
  private failures = 0
  private lockedOutUntil = 0

  constructor(
    private readonly db: Database,
    private readonly opts: VaultOptions = {}
  ) {}

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now()
  }

  private get idleMs(): number {
    return (this.opts.idleMinutes ?? 15) * 60_000
  }

  private keyRow(): KeyRow | undefined {
    return this.db.prepare('SELECT version, salt, n, r, p, verifier FROM vault_keys ORDER BY version DESC LIMIT 1').get() as KeyRow | undefined
  }

  private expireIfIdle(): void {
    if (this.key && this.now() - this.lastUse > this.idleMs) this.lock()
  }

  private requireKey(): Buffer {
    this.expireIfIdle()
    if (!this.key) throw new UserFacingError('The vault is locked. Unlock it with the vault passphrase first.')
    this.lastUse = this.now()
    return this.key
  }

  status(actor?: Actor): VaultStatus {
    this.expireIfIdle()
    const setUp = this.keyRow() !== undefined
    return {
      setUp,
      unlocked: this.key !== null,
      locksAt: this.key ? new Date(this.lastUse + this.idleMs).toISOString() : null,
      canManage: actor ? canManage(actor) : false,
      canSetUp: actor ? actor.role === 'partner' && !setUp : false
    }
  }

  setUp(passphrase: string, actor: Actor, audit: AuditFn): VaultStatus {
    if (actor.role !== 'partner') throw new UserFacingError('Only a partner can set up the vault.')
    if (this.keyRow()) throw new UserFacingError('The vault is already set up.')
    if (typeof passphrase !== 'string' || passphrase.normalize('NFKC').length < MIN_PASSPHRASE_LENGTH) {
      throw new UserFacingError(`Use a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters.`)
    }
    const kdf = this.opts.kdf ?? DEFAULT_KDF
    const salt = randomBytes(16)
    const key = deriveKey(passphrase, salt, kdf)
    this.db
      .prepare('INSERT INTO vault_keys (version, kdf, salt, n, r, p, verifier, created_by) VALUES (1, ?, ?, ?, ?, ?, ?, ?)')
      .run('scrypt', salt.toString('base64'), kdf.N, kdf.r, kdf.p, verifierFor(key).toString('base64'), actor.name)
    this.key = key
    this.keyVersion = 1
    this.lastUse = this.now()
    audit('Vault set up', 'vault_keys', 1)
    return this.status(actor)
  }

  unlock(passphrase: string, actor: Actor, audit: AuditFn): VaultStatus {
    if (!canManage(actor)) throw new UserFacingError('Only partners and managers can unlock the vault.')
    const row = this.keyRow()
    if (!row) throw new UserFacingError('The vault hasn’t been set up yet.')
    const now = this.now()
    if (now < this.lockedOutUntil) {
      throw new UserFacingError(`Too many wrong passphrases. Try again in ${Math.ceil((this.lockedOutUntil - now) / 1000)} seconds.`)
    }
    const key = deriveKey(String(passphrase ?? ''), Buffer.from(row.salt, 'base64'), { N: row.n, r: row.r, p: row.p })
    const expected = Buffer.from(row.verifier, 'base64')
    const actual = verifierFor(key)
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      key.fill(0)
      this.failures += 1
      if (this.failures >= MAX_FAILURES) {
        this.failures = 0
        this.lockedOutUntil = now + LOCKOUT_MS
      }
      audit('Vault unlock failed', 'vault_keys', row.version)
      throw new UserFacingError('That passphrase isn’t right.')
    }
    this.failures = 0
    this.lock()
    this.key = key
    this.keyVersion = row.version
    this.lastUse = now
    audit('Vault unlocked', 'vault_keys', row.version)
    return this.status(actor)
  }

  lock(): void {
    if (this.key) this.key.fill(0)
    this.key = null
  }

  list(scope: { clientRef?: string; practice?: boolean }, actor: Actor): VaultEntry[] {
    if (scope.practice) {
      if (!canManage(actor)) return []
      return (this.db.prepare("SELECT * FROM credential_vault WHERE owner = 'practice' ORDER BY platform, login_id").all() as EntryRow[]).map(toEntry)
    }
    if (!scope.clientRef) return []
    const client = clientForActor(this.db, scope.clientRef, actor)
    return (this.db
      .prepare("SELECT * FROM credential_vault WHERE owner = 'client' AND client_ref = ? ORDER BY platform, login_id")
      .all(client.ref) as EntryRow[]).map(toEntry)
  }

  save(input: VaultEntryInput, actor: Actor, audit: AuditFn): VaultEntry {
    if (!canManage(actor)) throw new UserFacingError('Only partners and managers can change stored logins.')
    const platform = cleanText(input.platform, 120, 'Platform')
    if (!platform) throw new UserFacingError('Say which platform the login is for.')
    if (isGovernmentSignIn(platform) || isGovernmentSignIn(input.url ?? '')) throw new UserFacingError(GOVERNMENT_SIGN_IN_REFUSAL)
    const loginId = cleanText(input.loginId, 200, 'Login ID')
    const url = cleanText(input.url, 500, 'Web address')
    const notes = cleanText(input.notes, 2000, 'Notes')
    if (url && !/^https:\/\//i.test(url)) throw new UserFacingError('Use the portal’s https:// address.')

    let clientRef: string | null = null
    if (input.owner === 'client') {
      if (!input.clientRef) throw new UserFacingError('Choose the client this login belongs to.')
      clientRef = clientForActor(this.db, input.clientRef, actor).ref
    } else if (input.owner !== 'practice') {
      throw new UserFacingError('Unknown owner.')
    }

    const newSecret = typeof input.secret === 'string' && input.secret.length > 0 ? input.secret : null
    if (newSecret !== null && newSecret.length > MAX_SECRET_LENGTH) throw new UserFacingError('That secret is too long.')
    const key = newSecret !== null ? this.requireKey() : null

    const write = this.db.transaction((): EntryRow => {
      let before: EntryRow | undefined
      let id: number
      if (input.id) {
        before = this.db.prepare('SELECT * FROM credential_vault WHERE id = ?').get(input.id) as EntryRow | undefined
        if (!before) throw new UserFacingError('That login no longer exists.')
        if (before.owner !== input.owner || before.client_ref !== clientRef) throw new UserFacingError('A login can’t be moved to another owner.')
        this.db
          .prepare("UPDATE credential_vault SET platform = ?, login_id = ?, url = ?, notes = ?, updated_at = datetime('now') WHERE id = ?")
          .run(platform, loginId, url, notes, input.id)
        id = input.id
        if (input.clearSecret && newSecret === null) {
          this.db.prepare('UPDATE credential_vault SET secret_ct = NULL, secret_iv = NULL, secret_tag = NULL, key_version = NULL WHERE id = ?').run(id)
        }
      } else {
        const res = this.db
          .prepare('INSERT INTO credential_vault (owner, client_ref, platform, login_id, url, notes) VALUES (?, ?, ?, ?, ?, ?)')
          .run(input.owner, clientRef, platform, loginId, url, notes)
        id = Number(res.lastInsertRowid)
      }
      if (key && newSecret !== null) {
        const iv = randomBytes(12)
        const cipher = createCipheriv('aes-256-gcm', key, iv)
        cipher.setAAD(aadFor(id))
        const ct = Buffer.concat([cipher.update(newSecret, 'utf8'), cipher.final()])
        this.db
          .prepare('UPDATE credential_vault SET secret_ct = ?, secret_iv = ?, secret_tag = ?, key_version = ? WHERE id = ?')
          .run(ct.toString('base64'), iv.toString('base64'), cipher.getAuthTag().toString('base64'), this.keyVersion, id)
      }
      const after = this.db.prepare('SELECT * FROM credential_vault WHERE id = ?').get(id) as EntryRow
      audit(before ? 'Updated stored login' : 'Added stored login', 'credential_vault', id, auditView(before), {
        ...auditView(after),
        secret_changed: newSecret !== null || Boolean(input.clearSecret && before?.secret_ct)
      })
      return after
    })
    return toEntry(write())
  }

  reveal(id: number, actor: Actor, audit: AuditFn): string {
    if (!canManage(actor)) throw new UserFacingError('Only partners and managers can see stored passwords.')
    const key = this.requireKey()
    const row = this.db.prepare('SELECT * FROM credential_vault WHERE id = ?').get(id) as EntryRow | undefined
    if (!row) throw new UserFacingError('That login no longer exists.')
    if (row.owner === 'client' && row.client_ref) clientForActor(this.db, row.client_ref, actor)
    if (!row.secret_ct || !row.secret_iv || !row.secret_tag) throw new UserFacingError('No password is stored for this login.')
    if (row.key_version !== this.keyVersion) throw new UserFacingError('This password was stored under a different vault key.')

    let secret: string
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(row.secret_iv, 'base64'))
      decipher.setAAD(aadFor(row.id))
      decipher.setAuthTag(Buffer.from(row.secret_tag, 'base64'))
      secret = Buffer.concat([decipher.update(Buffer.from(row.secret_ct, 'base64')), decipher.final()]).toString('utf8')
    } catch {
      audit('Stored login failed to open', 'credential_vault', id, null, auditView(row))
      throw new UserFacingError('This password can’t be opened: the stored copy has been changed or damaged.')
    }
    this.db
      .prepare("UPDATE credential_vault SET reveal_count = reveal_count + 1, last_revealed_at = datetime('now'), last_revealed_by = ? WHERE id = ?")
      .run(actor.name, id)
    audit('Revealed stored login', 'credential_vault', id, null, auditView(row))
    return secret
  }

  remove(id: number, actor: Actor, audit: AuditFn): void {
    if (!canManage(actor)) throw new UserFacingError('Only partners and managers can change stored logins.')
    const row = this.db.prepare('SELECT * FROM credential_vault WHERE id = ?').get(id) as EntryRow | undefined
    if (!row) throw new UserFacingError('That login no longer exists.')
    if (row.owner === 'client' && row.client_ref) clientForActor(this.db, row.client_ref, actor)
    this.db.prepare('DELETE FROM credential_vault WHERE id = ?').run(id)
    audit('Removed stored login', 'credential_vault', id, auditView(row), null)
  }
}
