/**
 * Security → Audit log (partners and managers): every recorded action, newest
 * first, a page at a time — who did what, to which record and client, and
 * what changed — narrowed by dates, person, kind and words, and saved as CSV
 * for an inspection. The log can only be added to; its seals are checked on
 * the overview tab.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FileDown } from 'lucide-react'
import type { AuditEntry, AuditPage, AuditQuery, PulseKind } from '@shared/types'
import { auditWho } from '@shared/audit-words'
import { columnLabel, tableSpec } from '@shared/data-model'
import { whenText } from '@renderer/lib/dates'
import { openClient } from '@renderer/lib/open-client'
import { KIND_WORDS } from './Pulse'
import { call, inputClass, Notice, smallButton } from './references/ui'

const PAGE = 100

/** A recorded value as it is easiest to read: JSON laid out, anything else as it is. */
export function prettyValue(value: string | null): string {
  if (value === null || value === '') return ''
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

/** The register an entry is about, in words. */
export const registerName = (table: string | null): string => (table ? (tableSpec(table)?.label ?? table.replace(/_/g, ' ')) : '')

/**
 * A changed field in words, for the list: "secrets_resealed" → "secrets
 * resealed", "amount_pence" → "amount", "vat_no" → "VAT number". The values
 * before and after keep the record's own names, exactly as stored.
 */
export function fieldWords(table: string | null, field: string): string {
  const label = columnLabel(table ?? '', field)
  // Lower case to sit in a list, unless the first word is an abbreviation (VAT, UTR, AML).
  return /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label
}

/** The query for the choices on screen: empty choices are left out. */
export function auditQuery(f: { from: string; to: string; who: string; kind: PulseKind | ''; find: string }): AuditQuery {
  return {
    ...(f.from ? { from: f.from } : {}),
    ...(f.to ? { to: f.to } : {}),
    ...(f.who ? { who: f.who } : {}),
    ...(f.kind ? { kind: f.kind } : {}),
    ...(f.find.trim() ? { find: f.find.trim() } : {})
  }
}

function EntryRow({ e, open, onToggle }: { e: AuditEntry; open: boolean; onToggle: () => void }): JSX.Element {
  const before = prettyValue(e.before)
  const after = prettyValue(e.after)
  const hasDetail = !!(before || after || e.recordId)
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1 text-sm">
        <button
          type="button"
          className="mt-0.5 text-white/40 hover:text-white/80 disabled:invisible"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? 'Hide the detail' : 'Show the detail'}
          disabled={!hasDetail}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="w-40 shrink-0 tabular-nums text-white/55">{whenText(e.at)}</span>
        <span className="w-36 shrink-0 truncate text-white/75" title={auditWho(e.who)}>{auditWho(e.who)}</span>
        <span className="min-w-[14rem] flex-1 text-white/85">
          {e.action}
          {e.changed.length > 0 && (
            <span className="text-white/45">
              {' '}
              ({e.changed.slice(0, 4).map((f) => fieldWords(e.table, f)).join(', ')}
              {e.changed.length > 4 ? ', …' : ''})
            </span>
          )}
        </span>
        <span className="w-56 shrink-0 truncate text-white/60">
          {e.clientName ? (
            <button type="button" className="truncate text-left hover:text-aether hover:underline" onClick={() => e.clientRef && openClient({ id: 0, ref: e.clientRef })} title={`${e.clientName} (${e.clientRef})`}>
              {e.clientName}
            </button>
          ) : (
            <span className="text-white/30">{registerName(e.table)}</span>
          )}
        </span>
      </div>
      {open && hasDetail && (
        <div className="mt-2 space-y-2 pl-8 text-xs">
          <p className="text-white/45">
            Entry {e.id}
            {e.table ? `, ${registerName(e.table)}` : ''}
            {e.recordId ? `, record ${e.recordId}` : ''}
            {e.clientRef ? `, client ${e.clientRef}` : ''}.
          </p>
          {(before || after) && (
            <div className="grid gap-3 lg:grid-cols-2">
              {[
                ['Before', before],
                ['After', after]
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="mb-1 text-white/50">{label}</p>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 p-2.5 font-mono text-[11px] text-white/70">{value || '—'}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export function AuditLog(): JSX.Element {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [who, setWho] = useState('')
  const [kind, setKind] = useState<PulseKind | ''>('')
  const [find, setFind] = useState('')
  const [findApplied, setFindApplied] = useState('')
  const [page, setPage] = useState<AuditPage | null>(null)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opened, setOpened] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const ticket = useRef(0)

  // Typing in Find waits for a pause before asking again.
  useEffect(() => {
    const t = window.setTimeout(() => setFindApplied(find), 300)
    return () => window.clearTimeout(t)
  }, [find])

  const query = auditQuery({ from, to, who, kind, find: findApplied })
  const key = JSON.stringify(query)

  const load = useCallback(async (more: boolean, beforeId: number | null) => {
    const mine = ++ticket.current
    setLoading(true)
    const r = await call(window.api.security.audit({ ...(JSON.parse(key) as AuditQuery), limit: PAGE, ...(more && beforeId ? { beforeId } : {}) }), (m) => {
      if (mine === ticket.current) setError(m)
    })
    if (mine !== ticket.current) return
    setLoading(false)
    if (!r) return
    setError(null)
    setPage(r)
    setEntries((list) => (more ? [...list, ...r.entries] : r.entries))
  }, [key])

  useEffect(() => {
    setOpened(new Set())
    void load(false, null)
  }, [load])

  const saveCsv = async (): Promise<void> => {
    setSaving(true)
    setSaved(null)
    const r = await call(window.api.security.exportAudit(query), setError)
    setSaving(false)
    if (r?.saved) setSaved(`Saved ${r.entries.toLocaleString('en-GB')} ${r.entries === 1 ? 'entry' : 'entries'} to ${r.path}.`)
  }

  const toggle = (id: number): void =>
    setOpened((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const filtered = Object.keys(query).length > 0
  return (
    <div className="max-w-[96rem] space-y-5" data-testid="audit-screen">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-white/50">
          Every change made in the app, and every time a secret was shown, newest first. Entries can only be added: nothing here can be changed or removed, and the log is sealed every hour so a change made outside the app shows.
        </p>
        <button type="button" className={`${smallButton} flex items-center gap-1.5`} onClick={() => void saveCsv()} disabled={saving || entries.length === 0} data-testid="audit-save-csv">
          <FileDown size={12} aria-hidden />
          {saving ? 'Saving…' : filtered ? 'Save these as CSV…' : 'Save as CSV…'}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-40 flex-col gap-1">
          <span className="text-xs text-white/55">From</span>
          <input type="date" className={inputClass} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} data-testid="audit-from" />
        </label>
        <label className="flex w-40 flex-col gap-1">
          <span className="text-xs text-white/55">To</span>
          <input type="date" className={inputClass} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="flex w-48 flex-col gap-1">
          <span className="text-xs text-white/55">Who</span>
          <select className={inputClass} value={who} onChange={(e) => setWho(e.target.value)} data-testid="audit-who">
            <option value="">Anyone</option>
            <option value="system">The app</option>
            {(page?.people ?? []).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-52 flex-col gap-1">
          <span className="text-xs text-white/55">Kind</span>
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as PulseKind | '')}>
            <option value="">Every kind</option>
            {(Object.keys(KIND_WORDS) as PulseKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_WORDS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-64 flex-col gap-1">
          <span className="text-xs text-white/55">Find</span>
          <input className={inputClass} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Words, a name or a record number" data-testid="audit-find" />
        </label>
        {filtered && (
          <button
            type="button"
            className={`${smallButton} mb-1`}
            onClick={() => {
              setFrom('')
              setTo('')
              setWho('')
              setKind('')
              setFind('')
              setFindApplied('')
            }}
          >
            Clear the choices
          </button>
        )}
      </div>

      {saved && <Notice>{saved}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {page === null ? (
        <p className="text-sm text-white/50" aria-busy="true">Reading the audit log…</p>
      ) : entries.length === 0 ? (
        <Notice>{filtered ? 'No entries match these choices.' : 'Nothing has been recorded yet.'}</Notice>
      ) : (
        <div className={`rounded-2xl border border-white/10 bg-white/[0.02] px-5 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <div className="hidden gap-4 border-b border-white/5 py-2 pl-8 text-xs text-white/45 md:flex">
            <span className="w-40">When</span>
            <span className="w-36">Who</span>
            <span className="flex-1">What</span>
            <span className="w-56">Client or register</span>
          </div>
          <ul className="divide-y divide-white/5" data-testid="audit-entries">
            {entries.map((e) => (
              <EntryRow key={e.id} e={e} open={opened.has(e.id)} onToggle={() => toggle(e.id)} />
            ))}
          </ul>
          {page.nextBeforeId !== null && (
            <div className="py-3">
              <button type="button" className={smallButton} onClick={() => void load(true, page.nextBeforeId)} disabled={loading} data-testid="audit-more">
                {loading ? 'Reading…' : `Show the next ${PAGE}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
