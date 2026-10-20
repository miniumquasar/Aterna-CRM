import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Copy, Database, FolderOpen, HardDrive, RefreshCw, RotateCcw, ShieldCheck, Trash2, XCircle } from 'lucide-react'
import type { BackupActivity, BackupRecord, BackupScheduleName, BackupStatus, BackupTestResult, UserRole } from '@shared/types'
import { useUiStore } from '@renderer/stores/ui'
import { RestorePanel, sizeText } from '@renderer/components/backup/RestorePanel'
import { Modal } from '@renderer/components/ui/Modal'

const SCHEDULE_LABELS: Record<BackupScheduleName, string> = {
  off: 'Off',
  hourly: 'Every hour',
  'every-4-hours': 'Every 4 hours',
  daily: 'Every day',
  weekly: 'Every week'
}
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ACTIVITY: Record<BackupActivity['activity'], string> = {
  backup: 'Making a backup',
  test: 'Testing a backup',
  restore: 'Preparing a restore',
  copy: 'Copying a backup',
  tidy: 'Tidying old backups'
}
const STAGES: Record<string, string> = {
  starting: 'starting',
  database: 'the database',
  documents: 'documents',
  writing: 'writing the backup file',
  checking: 'reading it back to check it',
  tidying: 'tidying old backups',
  copying: 'copying'
}

const field = 'rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 focus:border-aether/50 focus:outline-none'
const button = 'inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/[0.06] disabled:opacity-40'

/** "YYYY-MM-DD HH:MM:SS" (UTC, as stored) or ISO, shown in this PC's time. */
const shown = (t: string | null | undefined): string => {
  if (!t) return ''
  const d = new Date(/T/.test(t) ? t : `${t.replace(' ', 'T')}Z`)
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ago(t: string | null | undefined): string {
  if (!t) return ''
  const d = new Date(/T/.test(t) ? t : `${t.replace(' ', 'T')}Z`)
  const mins = Math.round((Date.now() - d.getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return `${Math.round(hours / 24)} days ago`
}

function Need({ ok, title, children }: { ok: boolean | null; title: string; children: ReactNode }): JSX.Element {
  return (
    <li className="flex gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <span className="mt-0.5 shrink-0">
        {ok === null ? <ShieldCheck size={16} className="text-white/40" /> : ok ? <CheckCircle2 size={16} className="text-emerald-400" /> : <AlertTriangle size={16} className="text-amber-400" />}
      </span>
      <div className="space-y-1 text-sm">
        <p className="font-medium text-white/90">{title}</p>
        <div className="space-y-1 text-white/60">{children}</div>
      </div>
    </li>
  )
}

/**
 * Settings → Backups: where backups go and when, what's needed to restore
 * (a backup off this PC, the recovery sheet, the vault passphrase), and the
 * list with test, copy, restore and delete.
 */
export function BackupsSection({ role }: { role: UserRole | undefined }): JSX.Element | null {
  const isPartner = role === 'partner'
  const canManage = role === 'partner' || role === 'manager'
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [list, setList] = useState<BackupRecord[]>([])
  const [activity, setActivity] = useState<BackupActivity | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [draft, setDraft] = useState<{ schedule: BackupScheduleName; time: string; weekday: number } | null>(null)
  const [restoring, setRestoring] = useState<BackupRecord | null>(null)
  const [restoreFromFile, setRestoreFromFile] = useState(false)
  const [password, setPassword] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restartingNow, setRestartingNow] = useState(false)
  const [lastTest, setLastTest] = useState<{ id: number; result: BackupTestResult } | null>(null)

  const load = useCallback(async () => {
    if (!canManage) return
    const [s, l] = await Promise.all([window.api.backups.status(), window.api.backups.list()])
    if (s.success) {
      setStatus(s.status)
      setDraft((d) => d ?? { schedule: s.status.settings.schedule, time: s.status.settings.time, weekday: s.status.settings.weekday })
      setActivity(s.status.running)
    }
    setList(l)
  }, [canManage])

  useEffect(() => {
    void load()
    const offActivity = window.api.backups.onActivity((a) => {
      setActivity(a)
      if (!a) void load()
    })
    const offChanged = window.api.backups.onChanged(() => void load())
    // The recovery sheet can be saved from its own dialog; keep its tick current.
    const timer = setInterval(() => void load(), 15_000)
    return () => {
      offActivity()
      offChanged()
      clearInterval(timer)
    }
  }, [load])

  if (!canManage) return null
  const say = (ok: boolean, text: string): void => setMessage({ ok, text })

  const backUpNow = async (): Promise<void> => {
    setMessage(null)
    const r = await window.api.backups.create()
    if (!r.success) say(false, r.error)
    else {
      say(true, `Backed up${r.documents ? `, with ${r.documents} document${r.documents === 1 ? '' : 's'}` : ''}${r.newDocuments ? ` (${r.newDocuments} new)` : ''}.${r.fellBack ? ` ${r.fellBack}` : ''}`)
    }
    await load()
  }

  const saveSchedule = async (): Promise<void> => {
    if (!draft) return
    const r = await window.api.backups.saveSettings(draft)
    if (!r.success) say(false, r.error)
    else say(true, 'The backup schedule is saved.')
    await load()
  }

  const chooseFolder = async (): Promise<void> => {
    const picked = await window.api.backups.chooseFolder()
    if (!picked.success) return say(false, picked.error)
    if (!picked.folder) return
    const r = await window.api.backups.saveSettings({ folder: picked.folder })
    if (!r.success) say(false, r.error)
    else say(true, `Backups now go to ${picked.folder}. Make one now to start the folder off.`)
    await load()
  }

  const backToOwnFolder = async (): Promise<void> => {
    const r = await window.api.backups.saveSettings({ folder: null })
    if (!r.success) say(false, r.error)
    else say(true, 'Backups now go to the app’s own folder.')
    await load()
  }

  const test = async (b: BackupRecord): Promise<void> => {
    setMessage(null)
    const r = await window.api.backups.test(b.id)
    if (!r.success) say(false, r.error)
    else {
      setLastTest({ id: b.id, result: r.result })
      say(r.result.ok, r.result.summary)
    }
    await load()
  }

  const copy = async (b: BackupRecord): Promise<void> => {
    setMessage(null)
    const r = await window.api.backups.copy(b.id)
    if (!r.success) say(false, r.error)
    else if (r.copied) say(true, `Copied to ${r.copied.folder}: the backup file and ${r.copied.documentsCopied} document${r.copied.documentsCopied === 1 ? '' : 's'}${r.copied.documentsAlreadyThere ? ` (${r.copied.documentsAlreadyThere} were there already)` : ''}.`)
  }

  const remove = async (b: BackupRecord): Promise<void> => {
    if (!confirm(`Delete the backup made ${shown(b.created_at)}? Its file is deleted too.`)) return
    const r = await window.api.backups.remove(b.id)
    if (!r.success) say(false, r.error)
    await load()
  }

  const restore = async (): Promise<void> => {
    if (!restoring) return
    setRestoreError(null)
    const r = await window.api.backups.restore(restoring.id, password, recoveryKey || undefined)
    if (!r.success) setRestoreError(r.error)
    else setRestartingNow(true)
  }

  const needsKeyFor = (b: BackupRecord): boolean => !!b.key_fingerprint && !!status?.keyFingerprint && b.key_fingerprint !== status.keyFingerprint
  const external = !!status?.settings.folder && !status.folderProblem
  const newest = list.find((b) => b.exists)

  return (
    <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white" data-testid="backups-section">
      <div className="flex items-center gap-2">
        <HardDrive size={16} className="text-aether" />
        <h3 className="text-sm font-semibold">Backups</h3>
      </div>

      {/* Now */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1 text-sm">
          <p className="text-white/85">
            {status?.lastBackup ? (
              <>Last backup {ago(status.lastBackup.at)} <span className="text-white/45">({shown(status.lastBackup.at)})</span></>
            ) : (
              'No backups yet.'
            )}
          </p>
          <p className="text-white/55">
            {status?.scheduleText}
            {status?.nextDue && status.settings.schedule !== 'off' ? ` · next ${new Date(status.nextDue) <= new Date() ? 'shortly' : shown(status.nextDue)}` : ''}
          </p>
          <p className="break-all text-xs text-white/40">Saved in {status?.store}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={button} onClick={() => void window.api.backups.openFolder()}>
            <FolderOpen size={13} /> Open folder
          </button>
          <button type="button" onClick={() => void backUpNow()} disabled={!!activity} className="inline-flex items-center gap-1.5 rounded-lg bg-aether/90 px-3 py-1.5 text-xs font-medium text-black hover:bg-aether disabled:opacity-50" data-testid="backup-now">
            {activity?.activity === 'backup' ? <RefreshCw size={13} className="animate-spin" /> : <Database size={13} />}
            Back up now
          </button>
        </div>
      </div>

      {activity && (
        <div role="status" className="space-y-1.5">
          <p className="text-xs text-white/60">
            {ACTIVITY[activity.activity]} — {STAGES[activity.stage] ?? activity.stage}
            {activity.total > 1 ? ` (${activity.done.toLocaleString('en-GB')} of ${activity.total.toLocaleString('en-GB')})` : ''}…
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-aether transition-all" style={{ width: `${activity.total ? Math.round((activity.done / activity.total) * 100) : 10}%` }} />
          </div>
        </div>
      )}

      {status?.lastError && (
        <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          The scheduled backup on {shown(status.lastError.at)} didn’t work: {status.lastError.message}
        </p>
      )}
      {status?.folderProblem && <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-50">{status.folderProblem}</p>}
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`rounded-xl border px-3 py-2 text-sm ${message.ok ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-50' : 'border-rose-400/30 bg-rose-500/10 text-rose-100'}`} data-testid="backup-message">
          {message.text}
        </p>
      )}

      {/* What a restore needs */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-white/45">What you need to restore</h4>
        <ul className="space-y-2">
          <Need ok={!!status?.lastBackup && external} title="1. A recent backup, kept off this computer">
            <p>
              {external
                ? `Backups go to ${status?.settings.folder}. Keep that drive somewhere other than this PC.`
                : 'Backups are on this computer only, so a failed disk or a stolen PC takes them too. Choose a folder on another drive or a NAS below, or copy a backup to a USB drive regularly.'}
            </p>
            <p>Keep the backup folder together: the documents are in its “documents” folder.</p>
          </Need>
          <Need ok={status?.recoverySheet.available ? status.recoverySheet.done : null} title="2. The recovery sheet (the encryption key)">
            {status?.recoverySheet.available ? (
              <>
                <p>
                  {status.recoverySheet.done
                    ? `Saved or printed by ${status.recoverySheet.savedBy} on ${shown(status.recoverySheet.savedAt)}. Key fingerprint ${status.recoverySheet.fingerprint}.`
                    : `Not saved or printed for the current key (fingerprint ${status.recoverySheet.fingerprint}). Without it, no backup can be restored on another computer.`}
                </p>
                <p>Keep the paper sealed and locked away, apart from this computer and its backups.</p>
                {isPartner && (
                  <button type="button" className={button} onClick={() => useUiStore.getState().setRecoverySheetOpen(true)}>
                    <ShieldCheck size={13} /> {status.recoverySheet.done ? 'Save or print again…' : 'Save or print it now…'}
                  </button>
                )}
              </>
            ) : (
              <p>This installation isn’t using its own encryption key yet.</p>
            )}
          </Need>
          <Need ok={null} title="3. The vault passphrase (stored logins)">
            {status?.vaultSetUp ? (
              <>
                <p>Never stored in the app or in any backup. After a restore, stored logins open only with it; everything else restores without it.</p>
                <p>
                  Write it down and seal it in an envelope kept in the safe — apart from the recovery sheet — or keep it in the partners’ password manager. Make sure at least two partners can find it. If it changes, replace the written copy.
                </p>
              </>
            ) : (
              <p>The vault isn’t set up, so there is no passphrase to keep yet.</p>
            )}
          </Need>
        </ul>
      </div>

      {/* Schedule and folder */}
      {draft && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white/45">Schedule</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-white/60">
              Back up automatically
              <select className={field} value={draft.schedule} onChange={(e) => setDraft({ ...draft, schedule: e.target.value as BackupScheduleName })} data-testid="backup-schedule">
                {(Object.keys(SCHEDULE_LABELS) as BackupScheduleName[]).map((k) => (
                  <option key={k} value={k}>{SCHEDULE_LABELS[k]}</option>
                ))}
              </select>
            </label>
            {draft.schedule === 'weekly' && (
              <label className="flex flex-col gap-1 text-xs text-white/60">
                On
                <select className={field} value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}>
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </select>
              </label>
            )}
            {(draft.schedule === 'daily' || draft.schedule === 'weekly') && (
              <label className="flex flex-col gap-1 text-xs text-white/60">
                At
                <input type="time" className={field} value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
              </label>
            )}
            <button type="button" className={button} onClick={() => void saveSchedule()}>
              Save schedule
            </button>
          </div>
          <p className="text-xs text-white/45">
            A backup missed while the computer was off is made when the app next starts. Kept: every scheduled backup from the last 2 days, then one a day for 2 weeks, one a week for 8 weeks and one a month for a year. Backups made with “Back up now” are kept until deleted.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-white/60">Folder:</span>
            <span className="break-all text-white/85">{status?.settings.folder ?? 'the app’s own folder'}</span>
            <button type="button" className={button} onClick={() => void chooseFolder()}>
              <FolderOpen size={13} /> Choose a folder…
            </button>
            {status?.settings.folder && (
              <button type="button" className={button} onClick={() => void backToOwnFolder()}>
                Use the app’s folder
              </button>
            )}
          </div>
        </div>
      )}

      {/* The list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white/45">
            {status ? `${status.count} backup${status.count === 1 ? '' : 's'} · ${sizeText(status.bytes)}` : 'Backups'}
          </h4>
          {isPartner && (
            <button type="button" className={button} onClick={() => setRestoreFromFile(true)}>
              <RotateCcw size={13} /> Restore from a file…
            </button>
          )}
        </div>
        {list.length === 0 && <p className="py-4 text-center text-xs text-white/45">No backups yet.</p>}
        <ul className="space-y-2">
          {list.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5" data-testid="backup-row">
              <Database size={14} className="shrink-0 text-white/40" />
              <div className="min-w-0 flex-1 text-xs">
                <p className="font-medium text-white/85">
                  {shown(b.created_at)} <span className="font-normal text-white/45">· {b.kind === 'scheduled' ? 'scheduled' : `by ${b.created_by ?? 'hand'}`}</span>
                </p>
                <p className="text-white/50">
                  {[
                    b.clients !== null ? `${b.clients} clients` : null,
                    b.format === 2 ? `${b.documents ?? 0} documents` : 'database only',
                    b.file_size ? sizeText(b.file_size + (b.documents_bytes ?? 0)) : null,
                    b.notes
                  ].filter(Boolean).join(' · ')}
                </p>
                <p className="flex flex-wrap gap-x-3">
                  {!b.exists && <span className="text-rose-300">The file isn’t there (drive disconnected, or moved)</span>}
                  {b.documents_missing ? <span className="text-amber-300">{b.documents_missing} document file{b.documents_missing === 1 ? ' wasn’t' : 's weren’t'} found when it was made</span> : null}
                  {b.test && (
                    <span className={b.test.ok ? 'text-emerald-300' : 'text-amber-300'}>
                      {b.test.ok ? `Test restore passed ${shown(b.test.at)}` : `Test restore found problems ${shown(b.test.at)}`}
                    </span>
                  )}
                </p>
                {lastTest?.id === b.id && !lastTest.result.ok && <p className="mt-1 text-amber-200/90">{lastTest.result.problems.join(' ')}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <button type="button" className={button} disabled={!b.exists || !!activity} onClick={() => void test(b)} title="A full trial restore that changes nothing" data-testid="backup-test">
                  {activity?.activity === 'test' ? <RefreshCw size={12} className="animate-spin" /> : <ShieldCheck size={12} />} Test
                </button>
                <button type="button" className={button} disabled={!b.exists || !!activity} onClick={() => void copy(b)}>
                  <Copy size={12} /> Copy…
                </button>
                {isPartner && (
                  <>
                    <button type="button" className={button} disabled={!b.exists || !!activity} onClick={() => { setRestoring(b); setPassword(''); setRecoveryKey(''); setRestoreError(null) }}>
                      <RotateCcw size={12} /> Restore…
                    </button>
                    <button type="button" className={`${button} text-rose-300/80`} disabled={!!activity} onClick={() => void remove(b)} title="Delete this backup">
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        {newest && !external && (
          <p className="text-xs text-white/45">Tip: plug in a USB drive and use “Copy…” on the newest backup, or choose a backup folder on it above.</p>
        )}
      </div>

      {/* Restore one in the list */}
      {restoring && (
        <Modal open onClose={activity || restartingNow ? undefined : () => setRestoring(null)} labelledBy="restore-dialog-title" width="max-w-lg" className="max-h-[90vh] space-y-4 overflow-y-auto text-white">
            <h2 id="restore-dialog-title" className="text-xl font-light">Restore the backup made {shown(restoring.created_at)}?</h2>
            {restartingNow ? (
              <p role="status" className="text-sm text-white/80">Restoring — the app restarts in a moment. Everyone signs in again.</p>
            ) : (
              <>
                <p className="text-sm text-white/65">
                  Everything entered since is replaced by the backup’s records. The database as it is now is kept as a safety copy in the app’s folder, and any document that changed since is kept aside, never overwritten. The app restarts, and everyone signs in again.
                </p>
                {needsKeyFor(restoring) && (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-white/60">This backup was made with another key (fingerprint {restoring.key_fingerprint}). Type the key from its recovery sheet.</span>
                    <textarea rows={3} spellCheck={false} className={`${field} font-mono uppercase placeholder:normal-case`} value={recoveryKey} onChange={(e) => setRecoveryKey(e.target.value)} />
                  </label>
                )}
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-white/60">Your password, to confirm it’s you</span>
                  <input type="password" autoComplete="current-password" className={field} value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
                {restoreError && (
                  <p role="alert" className="flex gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                    <XCircle size={16} className="mt-0.5 shrink-0" /> {restoreError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button type="button" disabled={!password || !!activity} onClick={() => void restore()} className="rounded-xl bg-amber-300/90 px-4 py-2 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-50">
                    {activity?.activity === 'restore' ? 'Checking and preparing…' : 'Restore and restart'}
                  </button>
                  <button type="button" onClick={() => setRestoring(null)} disabled={!!activity} className="ml-auto rounded-xl px-4 py-2 text-sm text-white/60 hover:text-white disabled:opacity-50">
                    Cancel
                  </button>
                </div>
              </>
            )}
        </Modal>
      )}

      {/* Restore from a file anywhere */}
      <Modal open={restoreFromFile} onClose={() => setRestoreFromFile(false)} labelledBy="restore-file-title" width="max-w-lg" className="max-h-[90vh] space-y-4 overflow-y-auto text-white">
        <h2 id="restore-file-title" className="text-xl font-light">Restore from a backup file</h2>
        <RestorePanel mode="partner" onCancel={() => setRestoreFromFile(false)} />
      </Modal>
    </div>
  )
}
