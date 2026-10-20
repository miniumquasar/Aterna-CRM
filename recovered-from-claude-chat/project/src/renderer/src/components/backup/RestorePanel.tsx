import { useState } from 'react'
import type { BackupFileSummary } from '@shared/types'

const input =
  'w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white/90 placeholder:text-white/30 focus:border-aether/50 focus:outline-none'

const when = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'an unknown date'

export const sizeText = (bytes: number | null | undefined): string => {
  const b = bytes ?? 0
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/**
 * Restoring from a backup file anywhere — a USB drive, another folder, a new
 * PC. `setup`: on a new installation, before any account exists (no password).
 * `partner`: from Settings, with the partner's password typed again.
 */
export function RestorePanel({ mode, onCancel }: { mode: 'setup' | 'partner'; onCancel: () => void }): JSX.Element {
  const [token, setToken] = useState<string | null>(null)
  const [summary, setSummary] = useState<BackupFileSummary | null>(null)
  const [recoveryKey, setRecoveryKey] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'choosing' | 'restoring' | null>(null)
  const [restarting, setRestarting] = useState(false)

  const choose = async (): Promise<void> => {
    setError(null)
    setBusy('choosing')
    try {
      const r = await window.api.backups.chooseFile()
      if (!r.success) setError(r.error)
      else if (r.token && r.summary) {
        setToken(r.token)
        setSummary(r.summary)
        setRecoveryKey('')
      }
    } finally {
      setBusy(null)
    }
  }

  const restore = async (): Promise<void> => {
    if (!token) return
    setError(null)
    setBusy('restoring')
    try {
      const r = await window.api.backups.restoreFile(token, { password: mode === 'partner' ? password : undefined, recoveryKey: recoveryKey || undefined })
      if (!r.success) setError(r.error)
      else setRestarting(true)
    } finally {
      setBusy(null)
    }
  }

  if (restarting) {
    return (
      <div role="status" className="space-y-2">
        <p className="text-base text-white/90">Restoring — the app restarts in a moment.</p>
        <p className="text-sm text-white/55">When it opens again, sign in with your usual username and password.</p>
      </div>
    )
  }

  const short = summary?.documents && summary.documentsInFolder < summary.documents.stored
  // An older backup names no key: this PC's is tried, and the sheet's is asked for if that fails.
  const askKey = !!summary && (summary.needsKey || (summary.format === 1 && !!error && /key/i.test(error)))
  const canRestore = !!summary && !summary.newerThanApp && (!askKey || recoveryKey.trim().length > 0) && (mode === 'setup' || password.length > 0)

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-white/60">
        <li>Choose the backup file. Keep the backup folder together: the documents are in the “documents” folder beside it.</li>
        <li>Type the key from the recovery sheet, if this computer doesn’t have it.</li>
        <li>The app restarts with the backup’s records, then you sign in as usual.</li>
      </ol>

      <button
        type="button"
        onClick={() => void choose()}
        disabled={busy !== null}
        className="w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/85 hover:bg-white/[0.06] disabled:opacity-50"
      >
        {busy === 'choosing' ? 'Opening…' : summary ? 'Choose a different backup file…' : 'Choose the backup file…'}
      </button>

      {summary && (
        <div className="space-y-1.5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm" data-testid="restore-summary">
          <p className="font-medium text-white/90">{summary.filename}</p>
          <p className="text-white/60">Made {when(summary.createdAt)}{summary.appVersion ? ` by AETERNA CRM ${summary.appVersion}` : ''}.</p>
          {summary.counts && (
            <p className="text-white/60">
              {summary.counts.clients.toLocaleString('en-GB')} clients, {summary.counts.users} people with accounts
              {summary.documents ? `, ${summary.documents.stored.toLocaleString('en-GB')} documents (${sizeText(summary.documents.bytes)})` : ''}.
            </p>
          )}
          {summary.format === 1 && <p className="text-amber-200/80">An older backup: it holds the database only, not documents.</p>}
          {summary.keyFingerprint && <p className="text-white/60">Needs the key with fingerprint <span className="font-mono text-white/85">{summary.keyFingerprint}</span>.</p>}
          {short && (
            <p className="text-amber-200/80">
              The documents folder beside this backup holds fewer documents than the backup lists. If you copied the backup on its own, copy the whole backup folder and choose it again — or restore now, and documents not found are listed.
            </p>
          )}
          {summary.newerThanApp && (
            <p role="alert" className="text-rose-200">
              This backup was made by a newer version of AETERNA CRM ({summary.appVersion}). Install that version or later, then restore it.
            </p>
          )}
        </div>
      )}

      {summary && askKey && !summary.newerThanApp && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-white/60">The key from the recovery sheet</span>
          <textarea
            value={recoveryKey}
            onChange={(e) => setRecoveryKey(e.target.value)}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            placeholder="13 groups of 5 characters — spaces don’t matter"
            className={`${input} font-mono uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal`}
            data-testid="restore-recovery-key"
          />
          <span className="text-xs text-white/35">A typing mistake is pointed out by group. Check the fingerprint printed under the key matches the one above.</span>
        </label>
      )}

      {summary && mode === 'partner' && !summary.newerThanApp && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-white/60">Your password, to confirm it’s you</span>
          <input type="password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
      )}

      {summary && !summary.newerThanApp && (
        <p className="text-xs text-white/45">
          {mode === 'partner'
            ? 'Everything entered since the backup is replaced by its records. The database as it is now is kept as a safety copy, and documents that changed since are kept aside, never overwritten.'
            : 'This computer’s empty database is replaced by the backup’s records.'}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void restore()}
          disabled={!canRestore || busy !== null}
          className="flex-1 rounded-xl bg-aether/90 px-4 py-2.5 text-sm font-medium text-black hover:bg-aether disabled:opacity-40"
          data-testid="restore-go"
        >
          {busy === 'restoring' ? 'Checking and preparing…' : 'Restore'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy === 'restoring'} className="rounded-xl px-4 py-2.5 text-sm text-white/60 hover:text-white">
          Cancel
        </button>
      </div>
    </div>
  )
}

/** When the database's key file is lost or damaged: the key from the recovery sheet opens it again. */
export function UnlockPanel(): JSX.Element {
  const [recoveryKey, setRecoveryKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [restarting, setRestarting] = useState(false)

  const unlock = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      const r = await window.api.backups.unlock(recoveryKey)
      if (!r.success) setError(r.error)
      else setRestarting(true)
    } finally {
      setBusy(false)
    }
  }

  if (restarting) return <p role="status" className="text-sm text-white/80">Unlocked — the app restarts in a moment.</p>
  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-white/60">The key from the recovery sheet</span>
        <textarea
          value={recoveryKey}
          onChange={(e) => setRecoveryKey(e.target.value)}
          rows={3}
          spellCheck={false}
          autoComplete="off"
          placeholder="13 groups of 5 characters — spaces don’t matter"
          className={`${input} font-mono uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal`}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      )}
      <button type="button" onClick={() => void unlock()} disabled={busy || !recoveryKey.trim()} className="w-full rounded-xl bg-aether/90 px-4 py-2.5 text-sm font-medium text-black hover:bg-aether disabled:opacity-40">
        {busy ? 'Checking…' : 'Unlock the database'}
      </button>
    </div>
  )
}
