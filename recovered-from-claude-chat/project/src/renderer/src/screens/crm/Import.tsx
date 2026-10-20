import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react'
import type { ImportBatch, ImportCommitResult, ImportFileToken, ImportPreview, ImportReport, ImportTableStats } from '@shared/types'
import { OBLIGATION_LABELS } from '@shared/types'
import { tableSpec } from '@shared/data-model'
import { GlassButton } from '@aether/primitives/GlassButton'
import { useAuthStore } from '@renderer/stores/crm/auth'
import { useDataStore } from '@renderer/stores/crm/data'
import { call, Notice, Section, smallButton } from './references/ui'

const n = (v: number): string => v.toLocaleString('en-GB')
const sizeText = (bytes: number): string => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)
const when = (iso: string): string =>
  new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso.replace(' ', 'T')}Z`).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const tableName = (t: string): string => tableSpec(t)?.label ?? t.replace(/_/g, ' ')

function Stat({ label, value, tone = 'normal' }: { label: string; value: number; tone?: 'normal' | 'good' | 'warn' | 'quiet' }): JSX.Element {
  const colour = tone === 'good' ? 'text-aether' : tone === 'warn' ? 'text-amber-200' : tone === 'quiet' ? 'text-white/45' : 'text-white/90'
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <dt className="text-xs text-white/50">{label}</dt>
      <dd className={`mt-1 text-2xl font-light tabular-nums ${colour}`}>{n(value)}</dd>
    </div>
  )
}

function Details({ summary, children, open = false }: { summary: string; children: ReactNode; open?: boolean }): JSX.Element {
  return (
    <details open={open} className="group rounded-xl border border-white/10 bg-white/[0.02]">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm text-white/80 hover:text-white">{summary}</summary>
      <div className="border-t border-white/5 px-4 py-3">{children}</div>
    </details>
  )
}

/** The preview report, in the order someone checking it needs it. */
export function ImportReportView({ report }: { report: ImportReport }): JSX.Element {
  const t = report.totals
  const tables = Object.entries(report.tables).filter(([, s]) => s.insert + s.update + s.unchanged + s.link + s.conflicts > 0)
  const m = report.clientMatching
  const issues = report.issues
  return (
    <div className="space-y-4" data-testid="import-report">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="New records" value={t.insert} tone={t.insert ? 'good' : 'quiet'} />
        <Stat label="Changed" value={t.update} tone={t.update ? 'normal' : 'quiet'} />
        <Stat label="Already the same" value={t.unchanged} tone="quiet" />
        <Stat label="Linked" value={t.link} tone="quiet" />
        <Stat label="Kept as they are" value={t.conflicts} tone={t.conflicts ? 'warn' : 'quiet'} />
        <Stat label="Data issues" value={t.issues} tone={t.issues ? 'warn' : 'quiet'} />
      </dl>
      <p className="text-sm text-white/55">
        Clients: {n(m.new)} new; {n(m.externalId + m.crn + m.utr + m.name)} matched to clients already here
        {m.externalId + m.crn + m.utr + m.name > 0 && ` (${[m.externalId && `${n(m.externalId)} from an earlier import`, m.crn && `${n(m.crn)} by company number`, m.utr && `${n(m.utr)} by UTR`, m.name && `${n(m.name)} by exact name`].filter(Boolean).join(', ')})`}.
        {t.conflicts > 0 && ' Where a value here differs from the workbook, the value here is kept, and listed below.'}
      </p>

      {report.warnings.length > 0 && (
        <Notice tone="warn">
          {report.warnings.map((w, i) => (
            <span key={i} className="block">{w}</span>
          ))}
        </Notice>
      )}

      <Details summary={`What would change, table by table (${tables.length})`}>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-white/45">
            <tr>
              <th className="py-1.5 font-normal">Register</th>
              {(['New', 'Changed', 'Same', 'Linked', 'Kept'] as const).map((h) => (
                <th key={h} className="py-1.5 text-right font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {tables.map(([table, s]: [string, ImportTableStats]) => (
              <tr key={table}>
                <td className="py-1.5 text-white/80">{tableName(table)}</td>
                {[s.insert, s.update, s.unchanged, s.link, s.conflicts].map((v, i) => (
                  <td key={i} className={`py-1.5 text-right tabular-nums ${v ? 'text-white/80' : 'text-white/25'}`}>{n(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Details>

      {report.insights.length > 0 && (
        <Details summary="Worth knowing">
          <ul className="space-y-2 text-sm">
            {report.insights.map((x, i) => (
              <li key={i}>
                <span className="text-white/85">{x.title}</span> <span className="text-white/45">({n(x.count)})</span>
                <span className="block text-xs text-white/50">{x.detail}</span>
              </li>
            ))}
          </ul>
        </Details>
      )}

      {t.issues > 0 && (
        <Details summary={`Data issues: ${n(issues.bySeverity.high)} high, ${n(issues.bySeverity.medium)} medium, ${n(issues.bySeverity.low)} low`}>
          <p className="mb-2 text-xs text-white/45">These are recorded under Data issues after the import, to be worked through. They don’t stop it.</p>
          <ul className="space-y-2 text-sm">
            {issues.byType.map((x) => (
              <li key={`${x.type}-${x.severity}`}>
                <span className={x.severity === 'high' ? 'text-rose-200' : x.severity === 'medium' ? 'text-amber-200/90' : 'text-white/70'}>{x.type.replace(/_/g, ' ')}</span>
                <span className="text-white/45"> — {n(x.count)}</span>
                {x.examples.length > 0 && <span className="block truncate text-xs text-white/40">For example: {x.examples.slice(0, 3).join('; ')}</span>}
              </li>
            ))}
          </ul>
        </Details>
      )}

      {report.conflicts.length > 0 && (
        <Details summary={`Values kept as they are here (${n(t.conflicts)})`}>
          <table className="w-full text-left text-xs">
            <thead className="text-white/45">
              <tr>
                <th className="py-1 font-normal">Register</th>
                <th className="py-1 font-normal">Record</th>
                <th className="py-1 font-normal">Field</th>
                <th className="py-1 font-normal">Here</th>
                <th className="py-1 font-normal">Workbook</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/70">
              {report.conflicts.slice(0, 50).map((c, i) => (
                <tr key={i}>
                  <td className="py-1">{tableName(c.table)}</td>
                  <td className="py-1">{c.key}</td>
                  <td className="py-1">{c.column.replace(/_/g, ' ')}</td>
                  <td className="py-1">{c.crm ?? '—'}</td>
                  <td className="py-1">{c.source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.conflicts.length > 50 && <p className="mt-2 text-xs text-white/40">The first 50 are shown; the saved report lists them all.</p>}
        </Details>
      )}

      {report.dueDates.length > 0 && (
        <Details summary="Due dates">
          <p className="mb-2 text-xs text-white/45">Due dates are worked out from the statutory rules. Where the workbook gives a different date, both are kept and the difference is listed under Data issues.</p>
          <ul className="space-y-1 text-sm text-white/70">
            {report.dueDates.map((d) => (
              <li key={d.obligation}>
                {OBLIGATION_LABELS[d.obligation] ?? d.obligation}: {n(d.rule)} from the rules
                {d.sourceDiffersFromRule > 0 && <span className="text-amber-200/90">, {n(d.sourceDiffersFromRule)} where the workbook differs</span>}
              </li>
            ))}
          </ul>
        </Details>
      )}

      {report.excluded.length > 0 && (
        <Details summary="Not imported">
          <ul className="space-y-1 text-sm text-white/70">
            {report.excluded.map((x, i) => (
              <li key={i}>
                {x.what} ({n(x.count)}) — <span className="text-white/45">{x.reason}</span>
              </li>
            ))}
          </ul>
        </Details>
      )}
    </div>
  )
}

/**
 * Import: bring clients and their registers in from the practice's master
 * workbook. The file is read and a report shown first; nothing changes until
 * a partner presses Import. The most recent import can be undone.
 *
 * `compact` is the setup wizard's version: no history, and `onImported`
 * tells the wizard when it is done.
 */
export function ImportScreen({ compact = false, onImported }: { compact?: boolean; onImported?: (result: ImportCommitResult) => void }): JSX.Element {
  const role = useAuthStore((s) => s.user?.role)
  const invalidateClients = useDataStore((s) => s.invalidateClients)
  const [file, setFile] = useState<ImportFileToken | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [includeSensitive, setIncludeSensitive] = useState(true)
  const [encrypted, setEncrypted] = useState(true)
  const [busy, setBusy] = useState<'choose' | 'preview' | 'import' | 'undo' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<ImportCommitResult | null>(null)
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const canPreview = role === 'partner' || role === 'manager'
  const canImport = role === 'partner'

  const loadBatches = useCallback(async () => {
    if (compact || !canPreview) return
    const list = await call(window.api.import.listBatches(), () => undefined)
    if (list) setBatches(list)
  }, [compact, canPreview])

  useEffect(() => {
    void loadBatches()
    void window.api.getSystemStatus().then((r) => r.ok && setEncrypted(r.data.mode === 'encrypted')).catch(() => undefined)
  }, [loadBatches])

  if (!canPreview) {
    return <Notice>Only partners and managers can import. A partner imports the master workbook; a manager can check its report first.</Notice>
  }

  const choose = async (): Promise<void> => {
    setError(null)
    setBusy('choose')
    const picked = await call(window.api.import.chooseFile(), setError)
    setBusy(null)
    if (!picked) return
    setFile(picked)
    setPreview(null)
    setDone(null)
    if (picked.adapterId) await check(picked)
  }

  const check = async (f: ImportFileToken = file!, sensitive = includeSensitive): Promise<void> => {
    setError(null)
    setBusy('preview')
    const p = await call(window.api.import.preview(f.token, { includeSensitive: sensitive }), setError)
    setBusy(null)
    if (p) setPreview(p)
  }

  const commit = async (): Promise<void> => {
    if (!file || !preview) return
    setError(null)
    setBusy('import')
    const r = await call(window.api.import.commit(file.token, preview.fingerprint), setError)
    setBusy(null)
    if (!r) return
    setDone(r)
    setPreview(null)
    setFile(null)
    invalidateClients()
    await loadBatches()
    onImported?.(r)
  }

  const undo = async (batch: ImportBatch): Promise<void> => {
    if (!window.confirm(`Undo the import of ${batch.file_name} from ${when(batch.committed_at)}? Every record it added is removed and every value it changed is put back.`)) return
    setError(null)
    setBusy('undo')
    const r = await call(window.api.import.rollback(batch.id), setError)
    setBusy(null)
    if (r) {
      invalidateClients()
      await loadBatches()
    }
  }

  const saveReport = (): void => {
    if (!preview) return
    const blob = new Blob([preview.markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `import-report-${preview.report.today}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const latestCommitted = batches.find((b) => b.status === 'committed')?.id ?? null

  return (
    <div className={compact ? 'space-y-5' : 'mx-auto max-w-[96rem] space-y-6'}>
      {!compact && (
        <header>
          <h1 className="text-2xl font-light text-white/90">Import</h1>
          <p className="mt-1 max-w-prose text-sm text-white/50">
            Bring clients and their registers in from the practice’s master workbook. The file is read and checked first; nothing changes until you have looked at the report and pressed Import.
          </p>
        </header>
      )}

      <Section
        title={file ? file.fileName : 'Choose the workbook'}
        description={file ? `${sizeText(file.size)}${file.adapterId ? '' : ' — not a workbook this app can read'}` : 'The master client workbook (.xlsx). It stays where it is; the app only reads it.'}
        actions={
          <GlassButton variant={file ? 'secondary' : 'primary'} size="sm" loading={busy === 'choose'} onClick={() => void choose()} data-testid="import-choose">
            <FileSpreadsheet size={14} aria-hidden /> {file ? 'Choose another file' : 'Choose the file…'}
          </GlassButton>
        }
      >
        {file && !file.adapterId && (
          <Notice tone="warn">This file isn’t laid out like the master workbook, so it can’t be imported. Choose the workbook itself, not a copy saved in another format.</Notice>
        )}
        {file?.adapterId && (
          <label className="flex items-start gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              className="mt-1"
              checked={includeSensitive && encrypted}
              disabled={!encrypted || busy !== null}
              onChange={(e) => {
                setIncludeSensitive(e.target.checked)
                if (preview) void check(file, e.target.checked)
              }}
            />
            <span>
              Include authentication codes, Companies House personal codes and login IDs
              <span className="block text-xs text-white/40">
                {encrypted ? 'They are stored encrypted, like the rest of the database.' : 'Not available: this database isn’t encrypted with its own key, so they are left out.'}
              </span>
            </span>
          </label>
        )}
        {busy === 'preview' && <p className="mt-3 text-sm text-white/50" role="status">Reading and checking the workbook… a large one takes a minute.</p>}
      </Section>

      {error && <Notice tone="error">{error}</Notice>}

      {preview && (
        <Section
          title="Check the report"
          description="What the import would do. Nothing has changed yet."
          actions={
            <button type="button" className={smallButton} onClick={saveReport}>
              Save the report…
            </button>
          }
        >
          <ImportReportView report={preview.report} />
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/5 pt-5">
            {canImport ? (
              <GlassButton variant="primary" loading={busy === 'import'} disabled={busy !== null} onClick={() => void commit()} data-testid="import-commit">
                <Upload size={14} aria-hidden /> Import
              </GlassButton>
            ) : (
              <Notice>A partner presses Import. The report can be saved and passed on.</Notice>
            )}
            {canImport && <p className="text-xs text-white/45">The import is one step: it all goes in, or none of it does. It can be undone afterwards.</p>}
          </div>
        </Section>
      )}

      {done && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-aether/25 bg-aether/[0.05] p-5" data-testid="import-done">
          <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-aether" aria-hidden />
          <div className="text-sm text-white/80">
            <p className="font-medium text-white/90">Imported.</p>
            <p className="mt-0.5 text-white/60">
              {n(done.totals.insert)} new records, {n(done.totals.update)} changed, {n(done.totals.unchanged)} already the same.
              {done.totals.conflicts > 0 && ` ${n(done.totals.conflicts)} values here were kept as they are.`}
            </p>
          </div>
        </div>
      )}

      {!compact && (
        <Section title="Earlier imports" description="Only the most recent import can be undone; undo later ones first.">
          {batches.length === 0 ? (
            <p className="text-sm text-white/40">No imports yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {batches.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate text-white/80" title={b.file_name}>{b.file_name}</span>
                  <span className="text-xs text-white/45">{when(b.committed_at)}{b.committed_by ? ` by ${b.committed_by}` : ''}</span>
                  <span className={`text-xs ${b.status === 'committed' ? 'text-aether/80' : b.status === 'rolled_back' ? 'text-white/40' : 'text-rose-300'}`}>
                    {b.status === 'committed' ? 'Imported' : b.status === 'rolled_back' ? `Undone${b.rolled_back_by ? ` by ${b.rolled_back_by}` : ''}` : 'Failed'}
                  </span>
                  {canImport && b.id === latestCommitted && (
                    <button type="button" className={smallButton} disabled={busy !== null} onClick={() => void undo(b)}>
                      <RotateCcw size={11} className="mr-1 inline" aria-hidden />
                      Undo
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  )
}
