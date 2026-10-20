import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileDown, Radar } from 'lucide-react'
import type { ClientRisk, RiskBand, RiskReport } from '@shared/types'
import { useLicence } from '@renderer/hooks/useLicence'
import { csvText, downloadText, firmForFileName } from '@renderer/lib/csv'
import { todayIso } from '@renderer/lib/dates'
import { openClient } from '@renderer/lib/open-client'
import { openTarget } from '@renderer/lib/targets'
import { useAuthStore } from '@renderer/stores/crm/auth'
import { useUiStore } from '@renderer/stores/ui'
import { call, inputClass, Notice, smallButton } from './references/ui'

export const BAND_WORDS: Record<RiskBand, string> = { high: 'High', medium: 'Medium', low: 'Low', clear: 'Nothing found' }
const BAND_STYLE: Record<RiskBand, { chip: string; bar: string; figure: string }> = {
  high: { chip: 'border-rose-400/40 text-rose-200', bar: 'bg-rose-400', figure: 'text-rose-300' },
  medium: { chip: 'border-amber-300/40 text-amber-100', bar: 'bg-amber-300', figure: 'text-amber-200/90' },
  low: { chip: 'border-white/15 text-white/70', bar: 'bg-aether/70', figure: 'text-white/80' },
  clear: { chip: 'border-white/10 text-white/45', bar: 'bg-white/20', figure: 'text-white/45' }
}

/** What each reason is called in the filter. */
export const FACTOR_WORDS: Record<string, string> = {
  deadlines: 'Overdue deadlines',
  deadlines_long: 'Overdue for over 90 days',
  ch_strike_off: 'Strike-off proposed',
  ch_status: 'Companies House status',
  ch_accounts: 'Accounts overdue at Companies House',
  ch_confirmation: 'Confirmation statement overdue at Companies House',
  aml_missing: 'No AML check',
  aml_incomplete: 'Due diligence not complete',
  aml_review: 'AML review overdue',
  high_risk: 'High risk',
  engagement_letter: 'No engagement letter',
  authorisation_missing: 'No agent authorisation or 64-8',
  authorisation_expired: 'Authorisation expired',
  authorisation_expiring: 'Authorisation expiring',
  data_issues: 'Data issues',
  fees_overdue: 'Fees overdue',
  fees_long: 'Fees over 90 days'
}

type Whose = 'everyone' | 'mine' | 'nobody' | `p:${string}`

/** The rows a person picked: by band, whose, reason and name. */
export function filterRisks(rows: readonly ClientRisk[], f: { band: RiskBand | 'all'; whose: Whose; factor: string; find: string; me: string | null; showClear: boolean }): ClientRisk[] {
  const find = f.find.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.band !== 'all' ? r.band !== f.band : !f.showClear && r.band === 'clear') return false
    if (f.whose === 'mine' && (!f.me || (r.person ?? '').toLowerCase() !== f.me.toLowerCase())) return false
    if (f.whose === 'nobody' && r.person) return false
    if (f.whose.startsWith('p:') && (r.person ?? '').toLowerCase() !== f.whose.slice(2).toLowerCase()) return false
    if (f.factor !== 'all' && !r.factors.some((x) => x.code === f.factor)) return false
    if (find && !r.client_name.toLowerCase().includes(find) && !(r.client_ref ?? '').toLowerCase().includes(find)) return false
    return true
  })
}

/** The list as a spreadsheet: one row per client, the reasons in one cell. */
export function riskCsv(rows: readonly ClientRisk[]): { header: string[]; rows: string[][] } {
  return {
    header: ['Client', 'Client code', 'Score', 'Band', 'With', 'Reasons'],
    rows: rows.map((r) => [r.client_name, r.client_ref ?? '', String(r.score), BAND_WORDS[r.band], r.person ?? '', r.factors.map((f) => `${f.label} (${f.points})`).join('; ')])
  }
}

function Figure({ band, count, active, onPick }: { band: RiskBand; count: number; active: boolean; onPick: (b: RiskBand) => void }): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onPick(band)}
      className={`flex min-w-[9rem] flex-col items-start rounded-xl border px-4 py-3 text-left transition-colors ${active ? 'border-aether/50 bg-aether/[0.08]' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}
      data-testid={`risk-figure-${band}`}
    >
      <span className="text-xs text-white/50">{BAND_WORDS[band]}</span>
      <span className={`text-2xl font-light tabular-nums ${count ? BAND_STYLE[band].figure : 'text-white/40'}`}>{count}</span>
    </button>
  )
}

function RiskRow({ r, open, onToggle }: { r: ClientRisk; open: boolean; onToggle: () => void }): JSX.Element {
  const style = BAND_STYLE[r.band]
  const top = r.factors.slice(0, 3)
  return (
    <li className="py-3" data-testid="risk-row">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} every reason for ${r.client_name}`} className="rounded p-0.5 text-white/40 hover:text-white/80">
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        </button>
        <div className="flex w-28 shrink-0 items-center gap-2" title={`Score ${r.score} of 100`}>
          <span className="w-7 text-right text-sm tabular-nums text-white/85">{r.score}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <span className={`block h-full rounded-full ${style.bar}`} style={{ width: `${Math.max(4, r.score)}%` }} />
          </span>
        </div>
        <span className={`w-28 shrink-0 rounded-full border px-2 py-0.5 text-center text-[11px] ${style.chip}`}>{BAND_WORDS[r.band]}</span>
        <button type="button" className="w-64 shrink-0 truncate text-left text-sm text-white/85 hover:text-aether" onClick={() => openClient({ id: r.client_id, ref: r.client_ref })}>
          {r.client_name}
        </button>
        <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {top.map((f) => (
            <span key={f.code} className="truncate rounded-lg border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs text-white/65">
              {f.label}
            </span>
          ))}
          {r.factors.length > top.length && <span className="text-xs text-white/40">+{r.factors.length - top.length} more</span>}
        </span>
        <span className="w-28 truncate text-right text-xs text-white/40">{r.person ?? 'Nobody yet'}</span>
      </div>
      {open && (
        <ul className="ml-9 mt-3 space-y-1.5 border-l border-white/10 pl-4">
          {r.factors.map((f) => (
            <li key={f.code} className="flex flex-wrap items-baseline gap-3 text-sm">
              <span className="w-10 text-right text-xs tabular-nums text-white/45">+{f.points}</span>
              <span className="min-w-0 flex-1 text-white/75">{f.label}</span>
              {f.target && (
                <button type="button" className={smallButton} onClick={() => openTarget(f.target)}>
                  Go there
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

const FIRST_ROWS = 100

/** What a practice-wide gap is, and where it is put right. */
const GAP_TEXT: Record<string, { what: string; where: string; route: 'compliance' | 'clients' | 'references' }> = {
  aml_missing: { what: 'an AML check', where: 'Compliance → HMRC and AML', route: 'compliance' },
  engagement_letter: { what: 'an engagement letter', where: 'each client’s record (Edit)', route: 'clients' },
  authorisation_missing: { what: 'an agent authorisation or a 64-8', where: 'Compliance → References and logins', route: 'references' }
}

/**
 * Risk (Sentinel): every client ranked by what needs attention — overdue
 * deadlines, Companies House red flags, AML, the engagement letter, agent
 * authorisations, data issues and fees. Every point has a reason, and each
 * reason goes to where it is dealt with. Staff see their own clients.
 */
export function Sentinel(): JSX.Element {
  const me = useAuthStore((s) => s.user)
  const navigateTo = useUiStore((s) => s.navigateTo)
  const { status: licence } = useLicence()
  const [report, setReport] = useState<RiskReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [band, setBand] = useState<RiskBand | 'all'>('all')
  const [whose, setWhose] = useState<Whose>('everyone')
  const [factor, setFactor] = useState('all')
  const [find, setFind] = useState('')
  const [showClear, setShowClear] = useState(false)
  const [opened, setOpened] = useState<Set<number>>(new Set())
  const [all, setAll] = useState(false)

  const load = useCallback(async () => {
    const r = await call(window.api.sentinel.report(), setError)
    if (r) {
      setError(null)
      setReport(r)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(() => (report ? filterRisks(report.rows, { band, whose, factor, find, me: me?.name ?? null, showClear }) : []), [report, band, whose, factor, find, me?.name, showClear])
  const people = useMemo(() => (report ? [...new Set(report.rows.map((r) => r.person).filter((p): p is string => !!p))].sort((a, b) => a.localeCompare(b, 'en-GB')) : []), [report])
  const factors = useMemo(() => (report ? Object.entries(report.factorCounts).sort((a, b) => b[1] - a[1]) : []), [report])

  const saveCsv = (): void => {
    const { header, rows } = riskCsv(shown)
    downloadText(`risk_${firmForFileName(licence?.licensedTo)}_${todayIso()}.csv`, csvText(header, rows))
  }

  if (error && !report) {
    return (
      <div className="space-y-3">
        <Notice tone="error">{error}</Notice>
        <button type="button" className={smallButton} onClick={() => void load()}>
          Try again
        </button>
      </div>
    )
  }
  if (!report) return <p className="text-sm text-white/50" aria-busy="true">Working out each client’s risk…</p>

  const toggle = (id: number): void =>
    setOpened((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="max-w-[96rem] space-y-6" data-testid="sentinel-screen">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="flex max-w-prose items-center gap-2 text-sm text-white/50">
          <Radar size={14} aria-hidden />
          {me?.role === 'staff' ? 'Your clients, ranked by what needs attention.' : 'Every client, ranked by what needs attention.'} Every point has a reason; open a client to see them all.
        </p>
        <button type="button" className={`${smallButton} flex items-center gap-1.5`} onClick={saveCsv} disabled={!shown.length}>
          <FileDown size={12} aria-hidden /> Save as CSV…
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        {(['high', 'medium', 'low', 'clear'] as const).map((b) => (
          <Figure key={b} band={b} count={report.counts[b]} active={band === b} onPick={(x) => setBand(band === x ? 'all' : x)} />
        ))}
      </div>

      {report.practiceGaps.length > 0 && (
        <div className="max-w-4xl rounded-xl border border-amber-300/30 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-100/90" data-testid="risk-practice-gaps">
          <p className="font-medium">Not recorded for nearly every client</p>
          <ul className="mt-1.5 space-y-1">
            {report.practiceGaps.map((g) => {
              const t = GAP_TEXT[g.code]
              return t ? (
                <li key={g.code}>
                  {g.clients} of {report.rows.length} clients have no record of {t.what}.{' '}
                  <button type="button" className="text-amber-50 underline-offset-2 hover:underline" onClick={() => navigateTo(t.route)}>
                    Record them in {t.where}
                  </button>
                </li>
              ) : null
            })}
          </ul>
          <p className="mt-1.5 text-xs text-amber-100/60">Each counts a few points towards every client’s score, so recording them brings every score down.</p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-56 flex-col gap-1">
          <span className="text-xs text-white/55">Whose</span>
          <select className={inputClass} value={whose} onChange={(e) => setWhose(e.target.value as Whose)} data-testid="risk-whose">
            <option value="everyone">{me?.role === 'staff' ? 'All of them' : 'Everyone’s'}</option>
            {me && <option value="mine">Mine ({me.name})</option>}
            <option value="nobody">Nobody’s yet</option>
            {people.filter((p) => p.toLowerCase() !== me?.name.toLowerCase()).map((p) => (
              <option key={p} value={`p:${p}`}>{p}</option>
            ))}
          </select>
        </label>
        <label className="flex w-72 flex-col gap-1">
          <span className="text-xs text-white/55">Reason</span>
          <select className={inputClass} value={factor} onChange={(e) => setFactor(e.target.value)} data-testid="risk-factor">
            <option value="all">Any reason</option>
            {factors.map(([code, n]) => (
              <option key={code} value={code}>{`${FACTOR_WORDS[code] ?? code} (${n})`}</option>
            ))}
          </select>
        </label>
        <label className="flex w-64 flex-col gap-1">
          <span className="text-xs text-white/55">Find</span>
          <input className={inputClass} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Client name or code" />
        </label>
        {band === 'all' && (
          <label className="flex items-center gap-2 pb-2 text-xs text-white/60">
            <input type="checkbox" checked={showClear} onChange={(e) => setShowClear(e.target.checked)} className="accent-[#00f5e8]" />
            Show clients with nothing found ({report.counts.clear})
          </label>
        )}
      </div>

      {shown.length === 0 ? (
        <Notice>{report.rows.length ? 'No client matches these choices.' : 'No clients yet.'}</Notice>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5">
          <ul className="divide-y divide-white/5">
            {(all ? shown : shown.slice(0, FIRST_ROWS)).map((r) => (
              <RiskRow key={r.client_id} r={r} open={opened.has(r.client_id)} onToggle={() => toggle(r.client_id)} />
            ))}
          </ul>
          {!all && shown.length > FIRST_ROWS && (
            <div className="py-3">
              <button type="button" className={smallButton} onClick={() => setAll(true)}>
                Show all {shown.length}
              </button>
            </div>
          )}
        </div>
      )}

      <details className="max-w-3xl rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 text-sm text-white/60">
        <summary className="cursor-pointer text-white/75">How the score works</summary>
        <div className="mt-3 space-y-2">
          <p>Each reason adds points; the score is their total, up to 100. High is 45 or more, medium 25 to 44, low below 25. Missing paperwork alone keeps a client low; overdue filings, Companies House red flags and unpaid fees move it up.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Overdue deadlines: 15 for the first and 5 for each more, up to 35; 10 more when one is over 90 days late.</li>
            <li>Companies House: strike-off proposed 35; a status other than active (liquidation, administration, receivership and the like) 30; accounts overdue there 15; confirmation statement overdue 10.</li>
            <li>Fees overdue 10; 6 more when some are over 90 days.</li>
            <li>AML: no check 8; due diligence not complete 6; review overdue 6; high risk 8.</li>
            <li>No engagement letter recorded 5.</li>
            <li>Agent authorisations: none in place and no 64-8 recorded 3; one expired or a request lapsed 6; one expiring within 30 days 3.</li>
            <li>Open data issues: 3 for each high, 1 for each medium, up to 8.</li>
          </ul>
          <p>Companies House facts come from the daily check, once the practice’s API key is saved in Settings. Before a company’s first check, a strike-off or liquidation on the client record counts instead.</p>
        </div>
      </details>
    </div>
  )
}
