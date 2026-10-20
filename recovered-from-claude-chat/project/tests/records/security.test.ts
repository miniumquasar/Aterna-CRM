/**
 * The security centre's records (records/security.ts): sign-in history read
 * from the audit log, scoped to the person for staff; the sign-in figures;
 * who can sign in; the stored-login flags (never the same password twice — that
 * is normal); and the audit log a page at a time, narrowed, exported in
 * batches and laid out as CSV. Made-up people and data only.
 */
import { describe, expect, it } from 'vitest'
import { writeAudit } from '../../src/main/access/audit'
import { AuthService } from '../../src/main/auth/service'
import {
  auditCsvRows,
  auditPage,
  changedFields,
  exportAuditEntries,
  loginFlagCounts,
  peopleSummary,
  readAuditExportQuery,
  signInHistory,
  signInSummary
} from '../../src/main/records/security'
import { csvText } from '../../src/shared/csv'
import type { AuditEntry } from '../../src/shared/types'
import { freshDb } from '../import/helpers'
import { partner, practice, staffA } from './helpers'

const FAST = { N: 2 ** 10, r: 8, p: 1 }
const PW = 'correct horse battery'

/** A practice whose sign-ins are written to its audit log, as the app does it. */
function signingIn() {
  const db = freshDb()
  const auth = new AuthService(db, {
    kdf: FAST,
    audit: (userId, userName, action, recordId, detail, table) =>
      db
        .prepare('INSERT INTO audit_log (user_id, user_name, action, table_name, record_id, old_value, new_value) VALUES (?, ?, ?, ?, ?, NULL, ?)')
        .run(userId, userName, action, table ?? 'users', recordId === null ? null : String(recordId), detail === undefined ? null : JSON.stringify(detail))
  })
  const boss = auth.createFirstPartner({ name: 'Partner P', username: 'partner.p', password: PW })
  const join = (name: string, username: string, role: 'manager' | 'staff') => {
    const { inviteKey } = auth.generateInvite('', role)
    auth.logout()
    const who = auth.acceptInvite(inviteKey, { name, username, password: 'another long phrase' })
    auth.logout()
    auth.login('partner.p', PW)
    return who
  }
  const sam = join('Sam Staff', 'sam.s', 'staff')
  const mia = join('Mia Manager', 'mia.m', 'manager')
  auth.logout()
  expect(() => auth.login('mia.m', 'wrong one')).toThrow()
  expect(() => auth.login('mia.m', 'wrong two')).toThrow()
  expect(() => auth.login('nobody.here', 'x')).toThrow()
  auth.login('partner.p', PW)
  auth.resetPassword(sam.id)
  expect(auth.confirmPassword('not it')).toBe(false)
  auth.logout({ afterSeconds: 1800, at: new Date().toISOString() } as never)
  return { db, auth, boss: { id: boss.id, name: boss.name, role: 'partner' as const }, sam: { id: sam.id, name: sam.name, role: 'staff' as const }, mia }
}

describe('sign-in history', () => {
  it('reads every kind of sign-in event, newest first, in words', () => {
    const { db, boss } = signingIn()
    const events = signInHistory(db, boss)
    expect(events.map((e) => e.kind)).toEqual([
      'idle_sign_out', 'password_check_failed', 'password_reset', 'signed_in', 'refused', 'failed', 'failed', 'signed_out',
      'signed_in', 'signed_out', 'joined', 'signed_out', 'signed_in', 'signed_out', 'joined', 'signed_out', 'first_partner'
    ])
    const text = (kind: string): string[] => events.filter((e) => e.kind === kind).map((e) => e.text)
    expect(text('failed')).toEqual(['Wrong password (2 in a row)', 'Wrong password'])
    expect(text('refused')).toEqual(['Sign-in refused: no one who can sign in has that username (“nobody.here”)'])
    expect(text('password_reset')).toEqual(['Password reset by Partner P'])
    expect(text('idle_sign_out')).toEqual(['Signed out after 30 minutes without use'])
    expect(events.find((e) => e.kind === 'refused')).toMatchObject({ person: null, attempted: 'nobody.here' })
    expect(events.find((e) => e.kind === 'failed')?.person).toBe('Mia Manager')
    expect(events.find((e) => e.kind === 'password_reset')).toMatchObject({ person: 'Sam Staff', by: 'Partner P' })
  })

  it('narrows to failed attempts, or to one person, and keeps to the limit', () => {
    const { db, boss } = signingIn()
    expect(signInHistory(db, boss, { failedOnly: true }).map((e) => e.kind)).toEqual(['password_check_failed', 'refused', 'failed', 'failed'])
    expect(new Set(signInHistory(db, boss, { person: 'mia manager' }).map((e) => e.person))).toEqual(new Set(['Mia Manager']))
    expect(signInHistory(db, boss, { person: 'Somebody Else' })).toEqual([])
    expect(signInHistory(db, boss, { limit: 3 })).toHaveLength(3)
    expect(() => signInHistory(db, boss, { days: 0 })).toThrow('Choose how many days of sign-ins to show: 1 to 400.')
    expect(() => signInHistory(db, boss, { days: 401 })).toThrow('Choose how many days of sign-ins to show: 1 to 400.')
    expect(() => signInHistory(db, boss, { limit: 1001 })).toThrow('Show 1 to 1000 sign-ins.')
  })

  it('shows staff their own account’s events only', () => {
    const { db, sam } = signingIn()
    const mine = signInHistory(db, sam)
    expect(mine.length).toBeGreaterThan(0)
    expect(new Set(mine.map((e) => e.person))).toEqual(new Set(['Sam Staff']))
    // Asking for someone else's changes nothing.
    expect(signInHistory(db, sam, { person: 'Mia Manager' })).toEqual(mine)
  })

  it('counts the last 30 days, and your own last sign-in and failed attempts', () => {
    const { db, boss, mia } = signingIn()
    const all = signInSummary(db, boss)
    expect(all.signIns).toMatchObject({ last30Days: 3, failed30Days: 3 })
    expect(all.signIns.lastFailedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    // The partner signed in three times: the latest is this one, so the one before it is the last time.
    expect(all.you.lastSignIn).not.toBeNull()
    expect(all.you.failed30Days).toBe(0)
    const theirs = signInSummary(db, { id: mia.id, name: mia.name, role: 'manager' })
    expect(theirs.you.failed30Days).toBe(2)
    const staff = signInSummary(db, { id: 999, name: 'New Person', role: 'staff' })
    expect(staff).toEqual({ signIns: { last30Days: 0, failed30Days: 0, lastFailedAt: null }, you: { lastSignIn: null, failed30Days: 0 } })
  })
})

describe('people and stored logins', () => {
  it('counts who can sign in by role, and the accounts that need a look', () => {
    const { auth } = signingIn()
    auth.login('partner.p', PW)
    const now = Date.now()
    const people = auth.listPeople().map((p) => (p.name === 'Mia Manager' ? { ...p, lockedUntil: new Date(now + 60_000).toISOString() } : p))
    const invites = [
      { id: 1, email: '', role: 'staff' as const, createdBy: 'Partner P', createdAt: '', expiresAt: '', expired: false },
      { id: 2, email: '', role: 'staff' as const, createdBy: 'Partner P', createdAt: '', expiresAt: '', expired: true }
    ]
    expect(peopleSummary([...people, { ...people[0], id: 99, name: 'Gone', active: false }], invites, now)).toEqual({
      total: 3, partners: 1, managers: 1, staff: 1, accessOff: 1, locked: 1, temporaryPasswords: 1, noPassword: 0, invites: 1
    })
  })

  it('flags logins with no user ID or no password — never the same password used twice', () => {
    const db = practice()
    db.prepare("INSERT INTO vault_keys (version, kdf, salt, n, r, p, verifier, created_by) VALUES (1, 'scrypt', 's', 1024, 8, 1, 'v', 'Partner P')").run()
    const login = db.prepare("INSERT INTO credential_vault (owner, client_ref, kind, platform, login_id) VALUES ('client', 'C1', 'other', ?, ?)")
    const secret = db.prepare("INSERT INTO credential_secrets (credential_id, field, label, secret_ct, secret_iv, secret_tag, key_version) VALUES (?, ?, '', 'ct', 'iv', 'tag', 1)")
    secret.run(login.run('Bank one', 'user-1').lastInsertRowid, 'password')
    secret.run(login.run('Bank two', 'user-2').lastInsertRowid, 'password') // the same password as Bank one is never a flag
    login.run('Portal', '') // no user ID, no password
    secret.run(login.run('Payroll', null).lastInsertRowid, 'password') // no user ID
    secret.run(login.run('Pension', 'user-5').lastInsertRowid, 'recovery_word') // no password
    expect(loginFlagCounts(db)).toEqual({ logins: 5, noUserId: 2, noPassword: 2 })
  })
})

describe('the audit log', () => {
  function logged(): ReturnType<typeof practice> {
    const db = practice()
    writeAudit(db, partner, 'Changed a client', 'clients', 1, { status: 'Active', remarks: 'x' }, { status: 'Former client', remarks: 'x' })
    writeAudit(db, partner, 'Added a task', 'tasks', 7, undefined, { client_ref: 'C2', description: 'Call' })
    const invoice = db.prepare("INSERT INTO payments (client_ref, invoice_no, amount_pence, status) VALUES ('C3', 'INV-9', 100, 'pending')").run().lastInsertRowid
    writeAudit(db, staffA, 'Recorded an invoice', 'payments', Number(invoice), undefined, { amount_pence: 100 })
    writeAudit(db, null, 'Imported a workbook', 'import_batches', 3, undefined, { rows: 12 })
    writeAudit(db, null, 'Sealed something odd', 'something_else', null, undefined, { note: '50% done_now' })
    writeAudit(db, partner, 'Changed the settings', 'app_settings', 'x', undefined, { big: 'z'.repeat(30_000) })
    return db
  }

  it('lists entries newest first, with the client each was about and what changed', () => {
    const db = logged()
    const page = auditPage(db, partner)
    expect(page.entries.map((e) => e.action)).toEqual(['Changed the settings', 'Sealed something odd', 'Imported a workbook', 'Recorded an invoice', 'Added a task', 'Changed a client'])
    const byAction = Object.fromEntries(page.entries.map((e) => [e.action, e]))
    expect(byAction['Changed a client']).toMatchObject({ who: 'Partner P', kind: 'clients', clientRef: 'C1', clientName: 'Alpha Ltd', changed: ['status'] })
    expect(byAction['Added a task']).toMatchObject({ kind: 'tasks', clientRef: 'C2', clientName: 'Beta Ltd', changed: ['client_ref', 'description'] })
    expect(byAction['Recorded an invoice']).toMatchObject({ who: 'Staff A', kind: 'billing', clientRef: 'C3', clientName: 'Gamma Ltd' })
    expect(byAction['Imported a workbook']).toMatchObject({ who: 'system', kind: 'imports', clientRef: null })
    expect(byAction['Changed the settings'].after?.length).toBe(20_001)
    expect(byAction['Changed the settings'].after?.endsWith('…')).toBe(true)
    expect(page.people).toEqual(['Partner P', 'Staff A'])
    expect(page.nextBeforeId).toBeNull()
  })

  it('pages through the log, and narrows by person, kind, words and dates', () => {
    const db = logged()
    const first = auditPage(db, partner, { limit: 4 })
    expect(first.entries).toHaveLength(4)
    expect(first.nextBeforeId).toBe(first.entries[3].id)
    const second = auditPage(db, partner, { limit: 4, beforeId: first.nextBeforeId })
    expect(second.entries.map((e) => e.action)).toEqual(['Added a task', 'Changed a client'])
    expect(second.nextBeforeId).toBeNull()

    expect(auditPage(db, partner, { who: 'system' }).entries.map((e) => e.action)).toEqual(['Sealed something odd', 'Imported a workbook'])
    expect(auditPage(db, partner, { who: 'staff a' }).entries.map((e) => e.action)).toEqual(['Recorded an invoice'])
    expect(auditPage(db, partner, { kind: 'billing' }).entries.map((e) => e.action)).toEqual(['Recorded an invoice'])
    expect(auditPage(db, partner, { kind: 'imports' }).entries.map((e) => e.action)).toEqual(['Imported a workbook'])
    expect(auditPage(db, partner, { kind: 'other' }).entries.map((e) => e.action)).toEqual(['Sealed something odd'])
    expect(auditPage(db, partner, { find: 'former' }).entries.map((e) => e.action)).toEqual(['Changed a client'])
    // % and _ are looked for as they are, not as wildcards.
    expect(auditPage(db, partner, { find: '50% done_' }).entries.map((e) => e.action)).toEqual(['Sealed something odd'])
    expect(auditPage(db, partner, { find: '%' }).entries.map((e) => e.action)).toEqual(['Sealed something odd'])

    const day = (offset: number): string => {
      const d = new Date()
      d.setDate(d.getDate() + offset)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    expect(auditPage(db, partner, { from: day(0), to: day(0) }).entries).toHaveLength(6)
    expect(auditPage(db, partner, { to: day(-1) }).entries).toHaveLength(0)
    expect(auditPage(db, partner, { from: day(1) }).entries).toHaveLength(0)
  })

  it('checks every choice, and is for partners and managers only', () => {
    const db = logged()
    expect(() => auditPage(db, staffA)).toThrow('Only partners and managers can see the audit log.')
    expect(() => auditPage(db, partner, { from: '2026-10-21', to: '2026-10-20' })).toThrow('The first day is after the last day.')
    expect(() => auditPage(db, partner, { from: '20/10/2026' })).toThrow('The first day isn’t a date.')
    expect(() => auditPage(db, partner, { kind: 'secrets' })).toThrow('Choose a kind of action from the list.')
    expect(() => auditPage(db, partner, { limit: 501 })).toThrow('Show 1 to 500 entries.')
    expect(() => auditPage(db, partner, { beforeId: -1 })).toThrow('That isn’t a place in the audit log.')
    expect(() => auditPage(db, partner, { find: 'x'.repeat(101) })).toThrow('Look for 100 characters at most.')
  })

  it('names the fields that changed, and only those', () => {
    expect(changedFields('{"a":1,"b":2}', '{"a":1,"b":3,"c":4}')).toEqual(['b', 'c'])
    expect(changedFields(null, '{"x":null}')).toEqual([])
    expect(changedFields('not json', '{"y":1}')).toEqual(['y'])
    expect(changedFields('[1,2]', '[1,3]')).toEqual([])
  })

  it('exports every matching entry a batch at a time, newest first', () => {
    const db = logged()
    const batches: AuditEntry[][] = []
    expect(exportAuditEntries(db, partner, {}, (b) => batches.push(b), 4)).toBe(6)
    expect(batches.map((b) => b.length)).toEqual([4, 2])
    const ids = batches.flat().map((e) => e.id)
    expect(ids).toEqual([...ids].sort((a, b) => b - a))
    const system: AuditEntry[] = []
    expect(exportAuditEntries(db, partner, { who: 'system', limit: 1, beforeId: 1 }, (b) => system.push(...b))).toBe(2)
    expect(() => exportAuditEntries(db, staffA, {}, () => undefined)).toThrow('Only partners and managers can export the audit log.')
    expect(() => readAuditExportQuery({ kind: 'nope' })).toThrow('Choose a kind of action from the list.')
    expect(readAuditExportQuery({ who: ' Partner P ', find: '', kind: 'clients', limit: 5 })).toEqual({ from: undefined, to: undefined, who: 'Partner P', kind: 'clients', find: undefined })
  })

  it('lays the entries out for a spreadsheet, the app and attempts before sign-in said in words', () => {
    const entry = (who: string | null, action: string): AuditEntry => ({
      id: 5, at: '2026-10-20 09:30:00', who, action, table: 'clients', kind: 'clients', recordId: '1', clientRef: 'C1', clientName: 'Alpha Ltd', changed: ['status'], before: '{"status":"Active"}', after: '{"status":"=HYPERLINK()"}'
    })
    const { header, rows } = auditCsvRows([entry('system', 'Imported'), entry(null, 'Sign-in failed'), entry('Partner P', 'Changed a client')])
    expect(header).toEqual(['Entry', 'When (UTC)', 'When (this computer)', 'Who', 'Action', 'Register', 'Record', 'Client code', 'Client', 'Fields changed', 'Before', 'After'])
    expect(rows.map((r) => r[3])).toEqual(['The app', 'Nobody signed in', 'Partner P'])
    expect(rows[0][2]).toMatch(/^20\/10\/2026, \d{2}:\d{2}:\d{2}$/)
    // A value that would run as a formula in Excel stays text.
    expect(csvText(header, rows)).toContain('"{""status"":""=HYPERLINK()""}"')
    expect(csvText(['a'], [['=SUM(1)']])).toBe("a\r\n'=SUM(1)")
  })
})
