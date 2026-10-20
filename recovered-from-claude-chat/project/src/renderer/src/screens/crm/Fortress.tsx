/**
 * Security (Fortress), the overview: the database, the licence, backups, the
 * encryption key's recovery sheet, the vault and the audit log at a glance,
 * with what needs attention said first; your own account and who can sign in;
 * and the sign-in history. The audit log itself is the next tab (AuditLog.tsx).
 *
 * Staff see the database, the licence, their own account and their own
 * sign-ins. The recovery sheet is saved or printed by a partner, the vault
 * passphrase changed by a partner.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Database, FileKey2, HardDrive, KeyRound, LockKeyhole, ScrollText, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { AuditCheck, HealthTone, RecoveryStatus, SecurityOverview, SignInEvent } from '@shared/types'
import { Modal } from '@renderer/components/ui/Modal'
import { ChangePasswordDialog } from '@renderer/components/session/ChangePasswordDialog'
import { primaryButton, quietButton } from '@renderer/components/forms/FormDialog'
import { whenText } from '@renderer/lib/dates'
import { useAuthStore } from '@renderer/stores/crm/auth'
import { useUiStore } from '@renderer/stores/ui'
import { nextBackupText } from './Pulse'
import { call, inputClass, Notice, smallButton } from './references/ui'

const TONE_DOT: Record<HealthTone, string> = {
  ok: 'bg-emerald-400',
  attention: 'bg-amber-300',
  problem: 'bg-rose-400',
  off: 'bg-white/25'
}
const TONE_WORDS: Record<HealthTone, string> = { ok: 'In order', attention: 'Needs a look', problem: 'Needs attention now', off: 'Not in use' }

const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

/** The recovery sheet in words, and how it stands. */
export function recoveryTile(r: RecoveryStatus): { tone: HealthTone; text: string } {
  if (!r.available) return { tone: 'off', text: r.reason ?? 'This installation isn’t using its own encryption key yet.' }
  if (r.done && r.last) {
    return { tone: 'ok', text: `${r.last.how === 'pdf' ? 'Saved as a PDF' : 'Printed'} for this key by ${r.last.savedBy} on ${whenText(r.last.savedAt)}. Keep it sealed and locked away.` }
  }
  return {
    tone: 'problem',
    text: r.last ? 'The sheet on file is for an earlier key. Save or print it again: without it, a backup can’t be restored on another computer.' : 'Not saved or printed yet. Without it, a backup can’t be restored on another computer.'
  }
}

/** The vault in words: whether it is set up and open, and the logins to follow up. Several logins with one password is normal and never flagged. */
export function vaultTile(v: NonNullable<SecurityOverview['vault']>): { tone: HealthTone; text: string } {
  if (!v.setUp) return { tone: 'off', text: 'Not set up. A partner sets it up in Practice details, to keep logins and authorisation codes encrypted with its own passphrase.' }
  const open = v.unlocked && v.locksAt ? `Unlocked until ${new Date(v.locksAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.` : 'Locked.'
  const flags = [v.noUserId ? `${plural(v.noUserId, 'login')} with no user ID` : '', v.noPassword ? `${plural(v.noPassword, 'login')} with no password stored` : ''].filter(Boolean)
  return {
    tone: flags.length ? 'attention' : 'ok',
    text: `${open} ${plural(v.logins, 'login')} stored.${flags.length ? ` To follow up: ${flags.join(' and ')}.` : ''}`
  }
}

/** The audit log's seals in words. */
export function auditTile(a: AuditCheck): { tone: HealthTone; text: string } {
  if (a.state === 'changed' && a.problem) {
    const p = a.problem
    return {
      tone: 'problem',
      text: `Changed outside the app: entries ${p.fromId.toLocaleString('en-GB')} to ${p.toId.toLocaleString('en-GB')}, sealed ${whenText(p.sealedAt)}, no longer match their seal${p.missing ? `, and ${plural(p.missing, 'entry', 'entries')} ${p.missing === 1 ? 'is' : 'are'} missing` : ''}. Keep a copy of the database and speak to whoever looks after this computer.`
    }
  }
  if (a.state === 'unsealed') return { tone: 'attention', text: `${plural(a.entries, 'entry', 'entries')}, not sealed yet. The app seals the log a minute after it starts, then every hour.` }
  return {
    tone: 'ok',
    text: `Intact: all ${plural(a.entries - a.unsealed, 'sealed entry', 'sealed entries')} match their seals.${a.unsealed ? ` ${plural(a.unsealed, 'newer entry', 'newer entries')} will be sealed within the hour.` : ''}`
  }
}

/**
 * The sentence at the top, in the tiles' own words: what needs attention now
 * first, then what needs a look, each by name.
 */
export function needsALook(tiles: ReadonlyArray<{ name: string; tone: HealthTone }>): string {
  const now = tiles.filter((t) => t.tone === 'problem').map((t) => t.name)
  const look = tiles.filter((t) => t.tone === 'attention').map((t) => t.name)
  if (!now.length && !look.length) return 'Everything here is in order.'
  const and = (xs: readonly string[]): string => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
  const count = (n: number, first: boolean): string => (n === 1 ? (first ? 'One thing needs' : 'One more needs') : `${n} ${first ? 'things' : 'more'} need`)
  const parts: string[] = []
  if (now.length) parts.push(`${count(now.length, true)} attention now: ${and(now)}.`)
  if (look.length) parts.push(`${count(look.length, !now.length)} a look: ${and(look)}.`)
  return parts.join(' ')
}

function Tile({ icon, title, tone, text, children, testid }: { icon: ReactNode; title: string; tone: HealthTone; text: string; children?: ReactNode; testid?: string }): JSX.Element {
  return (
    <div className="flex min-h-[9rem] flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-4" data-testid={testid}>
      <div className="flex items-center gap-2 text-xs text-white/50">
        <span className="text-white/35" aria-hidden>{icon}</span>
        {title}
        <span className="ml-auto flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
          <span className="text-[11px] text-white/40">{TONE_WORDS[tone]}</span>
        </span>
      </div>
      <p className="mt-2 flex-1 text-sm text-white/80">{text}</p>
      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

/** A partner changes the vault passphrase; everything stored is sealed again under the new one. Then the new passphrase sheet can be printed. */
function ChangePassphraseDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }): JSX.Element {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ resealed: number } | null>(null)
  const [printed, setPrinted] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCurrent('')
    setNext('')
    setAgain('')
    setError(null)
    setDone(null)
    setPrinted(null)
  }, [open])

  const close = (): void => {
    // The passphrase is held only while this dialog is open.
    setCurrent('')
    setNext('')
    setAgain('')
    onClose()
  }

  const submit = async (): Promise<void> => {
    setError(null)
    if (next !== again) {
      setError('The two new passphrases don’t match.')
      return
    }
    setBusy(true)
    const r = await call(window.api.vault.changePassphrase(current, next), setError)
    setBusy(false)
    if (r) {
      setDone({ resealed: r.resealed })
      setCurrent('')
      onChanged()
    }
  }

  const print = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const r = await call(window.api.setup.printVaultSheet(next), setError)
    setBusy(false)
    if (r) setPrinted('Sent to the printer. Seal the sheet in an envelope and keep it in the safe, apart from the recovery sheet.')
  }

  return (
    <Modal open={open} onClose={busy ? undefined : close} labelledBy="change-passphrase-title" width="max-w-lg">
      <h2 id="change-passphrase-title" className="text-lg font-light text-white/95">
        Change the vault passphrase
      </h2>
      {done ? (
        <div className="mt-3 space-y-4">
          <p role="status" className="text-sm text-white/75" data-testid="passphrase-changed">
            The passphrase is changed. {done.resealed ? `${plural(done.resealed, 'stored item')} ${done.resealed === 1 ? 'was' : 'were'} sealed again under it.` : 'Nothing was stored yet.'} The old passphrase no longer opens the vault. The vault stays unlocked until it locks itself.
          </p>
          <p className="text-sm text-white/60">If a passphrase sheet for the old passphrase is in the safe, replace it: print the new one now.</p>
          {printed && <Notice>{printed}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <button type="button" className={quietButton} onClick={() => void print()} disabled={busy}>
              {busy ? 'Printing…' : 'Print the new passphrase sheet…'}
            </button>
            <button type="button" className={primaryButton} onClick={close} disabled={busy}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy) void submit()
          }}
        >
          <p className="text-sm text-white/55">Every stored login, password and authorisation code is opened with the current passphrase and sealed again under the new one, all at once: if anything can’t be opened, nothing changes.</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-white/60">Current passphrase</span>
            <input type="password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="off" required data-testid="passphrase-current" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-white/60">New passphrase</span>
            <input type="password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="off" required data-testid="passphrase-next" />
            <span className="text-xs text-white/35">At least 12 characters. Four or five unrelated words are easier to remember than a jumble.</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-white/60">Type the new passphrase again</span>
            <input type="password" className={inputClass} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="off" required data-testid="passphrase-again" />
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <button type="button" className={quietButton} onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={primaryButton} disabled={busy} data-testid="passphrase-save">
              {busy ? 'Sealing everything again…' : 'Change the passphrase'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/** A partner prints the vault passphrase sheet again: the passphrase is checked, printed and not kept. */
function PrintSheetDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [printed, setPrinted] = useState(false)
  useEffect(() => {
    if (!open) return
    setPassphrase('')
    setError(null)
    setPrinted(false)
  }, [open])
  const close = (): void => {
    setPassphrase('')
    onClose()
  }
  const print = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const r = await call(window.api.setup.printVaultSheet(passphrase), setError)
    setBusy(false)
    if (r) {
      setPrinted(true)
      setPassphrase('')
    }
  }
  return (
    <Modal open={open} onClose={busy ? undefined : close} labelledBy="print-sheet-title">
      <h2 id="print-sheet-title" className="text-lg font-light text-white/95">
        Print the vault passphrase sheet
      </h2>
      {printed ? (
        <div className="mt-3 space-y-4">
          <p role="status" className="text-sm text-white/75">Sent to the printer. Seal it in an envelope and keep it in the safe, apart from the recovery sheet.</p>
          <div className="flex justify-end">
            <button type="button" className={primaryButton} onClick={close}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy) void print()
          }}
        >
          <p className="text-sm text-white/55">Type the vault passphrase. It is checked first, so a mistyped one is never put on paper, then printed and not kept.</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-white/60">Vault passphrase</span>
            <input type="password" className={inputClass} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="off" required />
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <button type="button" className={quietButton} onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={primaryButton} disabled={busy || !passphrase}>
              {busy ? 'Printing…' : 'Print…'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

const FAILED: ReadonlySet<SignInEvent['kind']> = new Set(['failed', 'refused', 'password_check_failed'])

/** Sign-ins, newest first: everyone's for partners and managers, your own for staff. */
function SignIns({ canManage, people }: { canManage: boolean; people: string[] }): JSX.Element {
  const [days, setDays] = useState(30)
  const [failedOnly, setFailedOnly] = useState(false)
  const [person, setPerson] = useState('')
  const [rows, setRows] = useState<SignInEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void call(window.api.security.signIns({ days, failedOnly, person: person || undefined, limit: 300 }), (m) => live && setError(m)).then((r) => {
      if (!live || !r) return
      setRows(r)
      setError(null)
    })
    return () => {
      live = false
    }
  }, [days, failedOnly, person])

  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-label="Sign-in history" data-testid="fortress-sign-ins">
      <div>
        <h2 className="text-sm font-medium text-white/85">Sign-in history</h2>
        <p className="mt-1 text-xs text-white/50">{canManage ? 'Everyone’s sign-ins, sign-outs and wrong passwords, newest first.' : 'Your own sign-ins, sign-outs and wrong passwords, newest first.'}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-44 flex-col gap-1">
          <span className="text-xs text-white/55">How far back</span>
          <select className={inputClass} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>The last 7 days</option>
            <option value={30}>The last 30 days</option>
            <option value={90}>The last 90 days</option>
            <option value={365}>The last year</option>
          </select>
        </label>
        {canManage && (
          <label className="flex w-52 flex-col gap-1">
            <span className="text-xs text-white/55">Whose</span>
            <select className={inputClass} value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 pb-2 text-xs text-white/60">
          <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} className="accent-[#00f5e8]" />
          Only failed attempts
        </label>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {rows === null ? (
        <p className="text-sm text-white/45" aria-busy="true">Reading the sign-ins…</p>
      ) : rows.length === 0 ? (
        <Notice>{failedOnly ? 'No failed attempts in this time.' : 'No sign-ins in this time.'}</Notice>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0a0710] text-xs text-white/50">
              <tr>
                <th scope="col" className="py-1.5 pr-4 text-left font-medium">When</th>
                {canManage && <th scope="col" className="py-1.5 pr-4 text-left font-medium">Who</th>}
                <th scope="col" className="py-1.5 text-left font-medium">What happened</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5 align-top">
                  <td className="whitespace-nowrap py-1.5 pr-4 tabular-nums text-white/60">{whenText(r.at)}</td>
                  {canManage && <td className="py-1.5 pr-4 text-white/80">{r.person ?? (r.attempted ? `“${r.attempted}”` : 'Unknown')}</td>}
                  <td className={`py-1.5 ${FAILED.has(r.kind) ? 'text-rose-200' : 'text-white/75'}`}>
                    <span className="inline-flex items-start gap-1.5">
                      {FAILED.has(r.kind) && <AlertTriangle size={12} className="mt-1 shrink-0" aria-hidden />}
                      {r.text}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function Fortress(): JSX.Element {
  const me = useAuthStore((s) => s.user)
  const navigateTo = useUiStore((s) => s.navigateTo)
  const [o, setO] = useState<SecurityOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'passphrase' | 'sheet' | 'password' | null>(null)
  const [people, setPeople] = useState<string[]>([])

  const load = useCallback(async () => {
    const r = await call(window.api.security.overview(), setError)
    if (r) {
      setO(r)
      setError(null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const canManage = me?.role === 'partner' || me?.role === 'manager'
  const isPartner = me?.role === 'partner'

  useEffect(() => {
    if (!canManage) return
    void window.api.people
      .overview()
      .then((r) => {
        if (r.ok) setPeople(r.data.people.map((p) => p.name).sort((a, b) => a.localeCompare(b, 'en-GB')))
      })
      .catch(() => undefined)
  }, [canManage])

  const checkAudit = async (): Promise<void> => {
    setBusy('audit')
    setNote(null)
    const r = await call(window.api.security.checkAudit(), setError)
    setBusy(null)
    if (r && o) setO({ ...o, audit: r })
  }

  const lockVault = async (): Promise<void> => {
    setBusy('lock')
    await window.api.vault.lock().catch(() => undefined)
    setBusy(null)
    setNote('The vault is locked.')
    void load()
  }

  if (error && !o) {
    return (
      <div className="space-y-3">
        <Notice tone="error">{error}</Notice>
        <button type="button" className={smallButton} onClick={() => void load()}>
          Try again
        </button>
      </div>
    )
  }
  if (!o) return <p className="text-sm text-white/50" aria-busy="true">Checking…</p>

  const recovery = o.recovery ? recoveryTile(o.recovery) : null
  const vault = o.vault ? vaultTile(o.vault) : null
  const audit = o.audit ? auditTile(o.audit) : null
  const tiles: Array<{ name: string; tone: HealthTone }> = [
    { name: 'the database', tone: o.database.tone },
    { name: 'the licence', tone: o.licence.tone },
    ...(o.backups ? [{ name: 'backups', tone: o.backups.tone }] : []),
    ...(recovery ? [{ name: 'the recovery sheet', tone: recovery.tone }] : []),
    ...(vault ? [{ name: 'the vault', tone: vault.tone }] : []),
    ...(audit ? [{ name: 'the audit log', tone: audit.tone }] : [])
  ]
  const idle = o.idleMinutes === 0 ? 'never signs you out by itself' : `signs you out after ${o.idleMinutes >= 60 && o.idleMinutes % 60 === 0 ? plural(o.idleMinutes / 60, 'hour') : plural(o.idleMinutes, 'minute')} without use`

  return (
    <div className="max-w-[96rem] space-y-6" data-testid="fortress-screen">
      <p className="flex max-w-4xl items-start gap-2 text-sm text-white/70" data-testid="fortress-summary">
        {/* The icon follows the worst tile, so a sign never says "all clear" beside something that needs attention. */}
        {tiles.some((t) => t.tone === 'problem') ? (
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-300" aria-hidden />
        ) : tiles.some((t) => t.tone === 'attention') ? (
          <ShieldAlert size={15} className="mt-0.5 shrink-0 text-amber-200" aria-hidden />
        ) : (
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-300/80" aria-hidden />
        )}
        {needsALook(tiles)}
      </p>

      {note && <Notice>{note}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Tile testid="fortress-database" icon={<Database size={14} />} title="Database" tone={o.database.tone} text={o.database.text} />
        <Tile testid="fortress-licence" icon={<KeyRound size={14} />} title="Licence" tone={o.licence.tone} text={o.licence.text}>
          <button type="button" className={smallButton} onClick={() => navigateTo('licence')}>
            Licence
          </button>
        </Tile>
        {o.backups && (
          <Tile testid="fortress-backups" icon={<HardDrive size={14} />} title="Backups" tone={o.backups.tone} text={`${o.backups.text}${nextBackupText(o.backups.nextDue)}`}>
            <button type="button" className={smallButton} onClick={() => navigateTo('settings')}>
              Backups in Settings
            </button>
          </Tile>
        )}
        {recovery && o.recovery && (
          <Tile testid="fortress-recovery" icon={<FileKey2 size={14} />} title="Recovery sheet" tone={recovery.tone} text={recovery.text}>
            {o.recovery.available &&
              (isPartner ? (
                <button type="button" className={smallButton} onClick={() => useUiStore.getState().setRecoverySheetOpen(true)}>
                  {o.recovery.done ? 'Save or print it again…' : 'Save or print it…'}
                </button>
              ) : (
                <span className="text-xs text-white/40">A partner saves or prints it.</span>
              ))}
          </Tile>
        )}
        {vault && o.vault && (
          <Tile testid="fortress-vault" icon={<LockKeyhole size={14} />} title="Vault" tone={vault.tone} text={vault.text}>
            {o.vault.setUp ? (
              <>
                {o.vault.unlocked && (
                  <button type="button" className={smallButton} onClick={() => void lockVault()} disabled={busy === 'lock'}>
                    Lock it now
                  </button>
                )}
                {isPartner && (
                  <>
                    <button type="button" className={smallButton} onClick={() => setDialog('passphrase')} data-testid="fortress-change-passphrase">
                      Change the passphrase…
                    </button>
                    <button type="button" className={smallButton} onClick={() => setDialog('sheet')}>
                      Print the passphrase sheet…
                    </button>
                  </>
                )}
                {(o.vault.noUserId > 0 || o.vault.noPassword > 0) && (
                  <button type="button" className={smallButton} onClick={() => navigateTo('practice')}>
                    Logins
                  </button>
                )}
              </>
            ) : (
              <button type="button" className={smallButton} onClick={() => navigateTo('practice')}>
                Practice details
              </button>
            )}
          </Tile>
        )}
        {audit && o.audit && (
          <Tile testid="fortress-audit" icon={<ScrollText size={14} />} title="Audit log" tone={audit.tone} text={audit.text}>
            <button type="button" className={smallButton} onClick={() => void checkAudit()} disabled={busy === 'audit'} data-testid="fortress-check-audit">
              {busy === 'audit' ? 'Checking…' : 'Check now'}
            </button>
            <button type="button" className={smallButton} onClick={() => navigateTo('audit')}>
              Open the audit log
            </button>
          </Tile>
        )}
      </div>

      {o.audit?.fingerprint && (
        <p className="max-w-3xl text-xs text-white/45" data-testid="fortress-fingerprint">
          The latest seal’s fingerprint is <span className="select-all font-mono text-white/70">{o.audit.fingerprint}</span>, checked {whenText(o.audit.checkedAt)}. Write it down somewhere away from this computer now and then: if the log were ever rewritten with new seals, the fingerprint you kept would no longer appear.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-label="Your account" data-testid="fortress-you">
          <h2 className="text-sm font-medium text-white/85">Your account</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-white/55">Your last sign-in before this one</dt>
              <dd className="text-white/85">{o.you.lastSignIn ? whenText(o.you.lastSignIn) : 'This is your first'}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-white/55">Wrong passwords on your account, last 30 days</dt>
              <dd className={o.you.failed30Days ? 'text-rose-200' : 'text-white/85'}>{o.you.failed30Days}</dd>
            </div>
          </dl>
          <p className="text-xs text-white/50">The app {idle}{isPartner ? ' (a partner changes this in People)' : ''}. If a sign-in above wasn’t you, change your password and tell a partner.</p>
          <button type="button" className={smallButton} onClick={() => setDialog('password')}>
            Change your password…
          </button>
        </section>

        {o.people && (
          <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-label="Who can sign in" data-testid="fortress-people">
            <h2 className="text-sm font-medium text-white/85">Who can sign in</h2>
            <p className="text-sm text-white/75">
              {plural(o.people.total, 'person', 'people')}: {plural(o.people.partners, 'partner')}, {plural(o.people.managers, 'manager')} and {plural(o.people.staff, 'member', 'members')} of staff.
            </p>
            <ul className="space-y-1 text-sm text-white/65">
              {o.people.locked > 0 && <li className="text-amber-100/90">{plural(o.people.locked, 'account')} paused after wrong passwords.</li>}
              {o.people.temporaryPasswords > 0 && <li>{plural(o.people.temporaryPasswords, 'person', 'people')} still to choose their own password.</li>}
              {o.people.noPassword > 0 && <li>{plural(o.people.noPassword, 'person', 'people')} with no password yet, who can’t sign in.</li>}
              {o.people.accessOff > 0 && <li>{plural(o.people.accessOff, 'account')} with access switched off.</li>}
              {o.people.invites > 0 && <li>{plural(o.people.invites, 'invite')} not used yet.</li>}
              <li>
                Sign-ins in the last 30 days: {o.signIns.last30Days.toLocaleString('en-GB')}; failed attempts: {o.signIns.failed30Days.toLocaleString('en-GB')}
                {o.signIns.lastFailedAt ? `, the last on ${whenText(o.signIns.lastFailedAt)}` : ''}.
              </li>
            </ul>
            <button type="button" className={smallButton} onClick={() => navigateTo('people')}>
              People
            </button>
          </section>
        )}
      </div>

      <SignIns canManage={canManage} people={people} />

      <ChangePassphraseDialog open={dialog === 'passphrase'} onClose={() => setDialog(null)} onChanged={() => void load()} />
      <PrintSheetDialog open={dialog === 'sheet'} onClose={() => setDialog(null)} />
      <ChangePasswordDialog open={dialog === 'password'} onClose={() => setDialog(null)} />
    </div>
  )
}
