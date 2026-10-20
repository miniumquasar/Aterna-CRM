import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { GlassCard } from '@aether/primitives/GlassCard'
import { GlassButton } from '@aether/primitives/GlassButton'
import type { OnboardingWorklist, OnboardingWorklistRow } from '@shared/types'
import { useUiStore } from '@renderer/stores/ui'

const CATEGORY: Record<string, string> = {
  company: 'Company', llp: 'LLP', limited_partnership: 'Limited partnership', partnership: 'Partnership',
  individual: 'Individual', sole_trader: 'Sole trader', trust: 'Trust', estate: 'Estate', charity: 'Charity'
}
const PAGE = 100
type Sort = 'name' | 'most' | 'ref'

const inputClass =
  'rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/85 placeholder:text-white/30 focus:border-aether/40 focus:outline-none'
const smallButton =
  'rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/75 hover:bg-white/[0.06] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs ${selected ? 'border-aether/50 bg-aether/10 text-aether' : 'border-white/10 text-white/65 hover:bg-white/[0.05]'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
    >
      {children}
    </button>
  )
}

const when = (sqliteTime: string): string =>
  new Date(`${sqliteTime.replace(' ', 'T')}Z`).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const cell = (v: string): string => v.replace(/[\t\r\n]+/g, ' ')

/** Every live client still missing something, so the team can work through the gaps in one place. */
export function OnboardingGaps(): JSX.Element {
  const openClientDetail = useUiStore((s) => s.openClientDetail)
  const [data, setData] = useState<OnboardingWorklist | null>(null)
  const [rows, setRows] = useState<OnboardingWorklistRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [requirement, setRequirement] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [assignee, setAssignee] = useState('')
  const [sort, setSort] = useState<Sort>('name')
  const [shown, setShown] = useState(PAGE)
  const [active, setActive] = useState<{ obs: number; waive: boolean } | null>(null)
  const [note, setNote] = useState('')

  const load = useCallback(async (): Promise<OnboardingWorklist | null> => {
    try {
      const w = await window.api.getOnboardingWorklist()
      setData(w)
      setRows(w.rows)
      return w
    } catch {
      setError('The gaps list could not be loaded. Restart the app and try again.')
      return null
    }
  }, [])

  const rescan = useCallback(async (): Promise<void> => {
    setScanning(true)
    setError(null)
    try {
      const r = await window.api.scanAllOnboardingGaps()
      if (!r.ok) setError(r.error)
      else {
        await load()
        setNotice(`Checked ${r.data.clients.toLocaleString('en-GB')} clients in ${(r.data.ms / 1000).toFixed(1)} seconds.`)
      }
    } catch {
      setError('The check did not finish. Try again.')
    } finally {
      setScanning(false)
    }
  }, [load])

  useEffect(() => {
    void load().then((w) => {
      if (w && w.scannedAt === null) void rescan() // never checked: run the first check now
    })
  }, [load, rescan])

  useEffect(() => setShown(PAGE), [requirement, category, assignee, query, sort])
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(t)
  }, [notice])

  const counts = useMemo(() => {
    const m = new Map<string, { field: string; label: string; clients: number }>()
    for (const r of rows) {
      for (const g of r.gaps) {
        const c = m.get(g.field) ?? { field: g.field, label: g.label, clients: 0 }
        c.clients += 1
        m.set(g.field, c)
      }
    }
    return [...m.values()].sort((a, b) => b.clients - a.clients || a.label.localeCompare(b.label))
  }, [rows])
  const assignees = useMemo(() => [...new Set(rows.map((r) => r.assignedTo).filter((a): a is string => !!a))].sort(), [rows])
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter((c): c is string => !!c))].sort(), [rows])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = rows.filter((r) =>
      (!requirement || r.gaps.some((g) => g.field === requirement)) &&
      (!category || r.category === category) &&
      (!assignee || (assignee === '__none' ? !r.assignedTo : r.assignedTo === assignee)) &&
      (!q || r.clientName.toLowerCase().includes(q) || r.clientRef.toLowerCase().includes(q)))
    return [...list].sort((a, b) =>
      sort === 'most' ? b.gaps.length - a.gaps.length || a.clientName.localeCompare(b.clientName)
        : sort === 'ref' ? a.clientRef.localeCompare(b.clientRef, undefined, { numeric: true })
          : a.clientName.localeCompare(b.clientName))
  }, [rows, requirement, category, assignee, query, sort])
  const totalGaps = rows.reduce((n, r) => n + r.gaps.length, 0)

  const mark = async (row: OnboardingWorklistRow, observationId: number, status: 'provided' | 'waived', notes?: string): Promise<void> => {
    try {
      const r = await window.api.updateObservation(observationId, status, notes)
      if (!r.success) {
        setError(r.error ?? 'That change was not saved.')
        return
      }
      setRows((prev) => prev
        .map((x) => (x.clientRef === row.clientRef ? { ...x, gaps: x.gaps.filter((g) => g.observationId !== observationId) } : x))
        .filter((x) => x.gaps.length > 0))
      setActive(null)
      setNote('')
    } catch {
      setError('That change was not saved. Try again.')
    }
  }

  const copy = async (): Promise<void> => {
    const lines = [
      ['Client', 'Ref', 'Type', 'Assigned to', 'Missing'].join('\t'),
      ...visible.map((r) => [cell(r.clientName), cell(r.clientRef), CATEGORY[r.category ?? ''] ?? r.category ?? '', cell(r.assignedTo ?? ''),
        r.gaps.map((g) => g.label).join('; ')].join('\t'))
    ]
    await navigator.clipboard.writeText(lines.join('\n'))
    setNotice(`Copied ${visible.length.toLocaleString('en-GB')} rows. Paste them into Excel.`)
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white/90">Onboarding gaps</h1>
          <p className="mt-1 text-sm text-white/50">
            {data
              ? `${totalGaps.toLocaleString('en-GB')} gaps across ${rows.length.toLocaleString('en-GB')} live clients${data.scannedAt ? ` · last checked ${when(data.scannedAt)}` : ''}`
              : 'Loading…'}
          </p>
        </div>
        <div className="flex gap-2">
          <GlassButton variant="secondary" size="sm" onClick={() => void rescan()} loading={scanning} disabled={scanning}>
            Recheck all clients
          </GlassButton>
          <GlassButton variant="ghost" size="sm" onClick={() => void copy()} disabled={!visible.length}>
            Copy as table
          </GlassButton>
        </div>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/[0.08] px-5 py-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="text-sm text-aether">{notice}</p>}

      {counts.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show clients missing">
          <Chip selected={requirement === null} onClick={() => setRequirement(null)}>All gaps</Chip>
          {counts.map((c) => (
            <Chip key={c.field} selected={requirement === c.field} onClick={() => setRequirement(requirement === c.field ? null : c.field)}>
              {c.label} <span className="ml-1 tabular-nums text-white/40">{c.clients.toLocaleString('en-GB')}</span>
            </Chip>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a client by name or ref" aria-label="Find a client" className={`${inputClass} min-w-[16rem] flex-1`} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Client type" className={inputClass}>
          <option value="">All client types</option>
          {categories.map((c) => <option key={c} value={c}>{CATEGORY[c] ?? c}</option>)}
        </select>
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assigned to" className={inputClass}>
          <option value="">Anyone</option>
          <option value="__none">Unassigned</option>
          {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className={inputClass}>
          <option value="name">Name A–Z</option>
          <option value="most">Most gaps first</option>
          <option value="ref">Client ref</option>
        </select>
      </div>

      <GlassCard glow="none" className="p-2">
        {visible.length === 0 ? (
          <p className="p-6 text-sm text-white/50">
            {rows.length === 0
              ? data?.scannedAt ? 'No gaps. Every live client has what they need on file.' : 'Not checked yet.'
              : 'No clients match these filters.'}
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {visible.slice(0, shown).map((r) => {
              const open = active ? r.gaps.find((g) => g.observationId === active.obs) : undefined
              return (
                <li key={r.clientRef} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button type="button" onClick={() => openClientDetail(r.clientId)} className="text-left text-sm font-medium text-white/85 hover:text-aether focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                        {r.clientName}
                      </button>
                      <p className="text-xs text-white/40">
                        {r.clientRef} · {CATEGORY[r.category ?? ''] ?? 'Type not set'} · {r.assignedTo ?? 'Unassigned'}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {r.gaps.map((g) => (
                        <button
                          key={g.observationId}
                          type="button"
                          aria-expanded={active?.obs === g.observationId}
                          onClick={() => {
                            setActive(active?.obs === g.observationId ? null : { obs: g.observationId, waive: false })
                            setNote('')
                          }}
                          className={`rounded-full border px-2.5 py-1 text-[11px] hover:bg-white/[0.06] ${g.field === requirement ? 'border-divine/40 text-divine' : 'border-white/10 text-white/60'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {open && active && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
                      {active.waive ? (
                        <>
                          <input
                            autoFocus
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={`Why ${open.label.toLowerCase()} is not needed`}
                            aria-label="Reason for waiving"
                            className={`${inputClass} min-w-[18rem] flex-1 py-1.5 text-xs`}
                          />
                          <button type="button" className={smallButton} disabled={!note.trim()} onClick={() => void mark(r, open.observationId, 'waived', note.trim())}>
                            Waive
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="mr-1 text-white/60">{open.label}</span>
                          <button type="button" className={smallButton} onClick={() => void mark(r, open.observationId, 'provided')}>
                            Mark as received
                          </button>
                          <button type="button" className={smallButton} onClick={() => setActive({ obs: open.observationId, waive: true })}>
                            Waive…
                          </button>
                        </>
                      )}
                      <button type="button" className={smallButton} onClick={() => setActive(null)}>Cancel</button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {visible.length > shown && (
          <div className="p-3">
            <GlassButton variant="ghost" size="sm" onClick={() => setShown((s) => s + PAGE)}>
              Show {Math.min(PAGE, visible.length - shown)} more
            </GlassButton>
          </div>
        )}
      </GlassCard>
    </div>
  )
}
