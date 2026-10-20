import { useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import type { ClientIncomeSource, FilingRoute, IncomeSourceInput, IncomeSourceType, SaRegistration, SaRegistrationInput } from '@shared/types'
import { FILING_ROUTE_LABELS, INCOME_SOURCE_LABELS } from '@shared/types'
import { checkUtr } from '@shared/references'
import { FormDialog } from '@renderer/components/forms/FormDialog'
import { failsCheck, referenceNote } from '@renderer/components/forms/reference-note'
import { Field, inputClass, Section, smallButton } from '../references/ui'
import { ListState, orNull, PanelMessages, RowButtons, SuggestInput, Tag, usePanelList } from './panel-kit'

const REGISTER_STATUSES = ['Active', 'To register', 'Dormant', 'Ceased'] as const
const ROUTES = Object.keys(FILING_ROUTE_LABELS) as FilingRoute[]

/** "12345 67890": a UTR as it is printed on HMRC's letters. */
const utrText = (utr: string): string => (/^\d{10}$/.test(utr) ? `${utr.slice(0, 5)} ${utr.slice(5)}` : utr)

/** The filing routes as stored ("own_agent; client_gateway"), in words. */
export function routesText(stored: string | null): string {
  if (!stored) return ''
  return stored
    .split(/\s*;\s*/)
    .filter(Boolean)
    .map((r) => FILING_ROUTE_LABELS[r as FilingRoute] ?? r)
    .join(', ')
}

interface RegDraft {
  id: number | null
  utr: string
  business_description: string
  filing_route: FilingRoute[]
  first_year_on_file: string
  last_year_on_file: string
  register_status: string
  notes: string
}

const regDraft = (r?: SaRegistration | null): RegDraft => ({
  id: r?.id ?? null,
  utr: r?.utr ?? '',
  business_description: r?.business_description ?? '',
  filing_route: (r?.filing_route ?? '').split(/\s*;\s*/).filter((x): x is FilingRoute => ROUTES.includes(x as FilingRoute)),
  first_year_on_file: r?.first_year_on_file ?? '',
  last_year_on_file: r?.last_year_on_file ?? '',
  register_status: r?.register_status ?? '',
  notes: r?.notes ?? ''
})

function RegistrationDialog({ clientRef, recordUtr, initial, onClose, onSaved }: {
  clientRef: string
  recordUtr: string | null
  initial: RegDraft
  onClose: () => void
  onSaved: (message: string) => void
}): JSX.Element {
  const [d, setD] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof RegDraft>(k: K, v: RegDraft[K]): void => setD((x) => ({ ...x, [k]: v }))
  const utr = d.utr.trim() ? checkUtr(d.utr) : null
  const differs = utr && utr.ok && recordUtr && utr.value !== recordUtr
  // One that fails its check is kept and flagged, not refused; the client record only takes a UTR that passes.
  const utrNote = differs ? `The client record has ${utrText(recordUtr)}. One of them is wrong.` : (referenceNote(d.utr, checkUtr) ?? null)
  const save = async (): Promise<void> => {
    setError(null)
    const input: SaRegistrationInput = {
      ...(d.id === null ? { client_ref: clientRef } : { id: d.id }),
      utr: orNull(d.utr),
      business_description: orNull(d.business_description),
      filing_route: d.filing_route,
      first_year_on_file: orNull(d.first_year_on_file),
      last_year_on_file: orNull(d.last_year_on_file),
      register_status: orNull(d.register_status),
      notes: orNull(d.notes)
    }
    setBusy(true)
    const r = await window.api.registers.saveSaRegistration(input)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    const done = d.id === null ? 'Self Assessment registration added.' : 'Self Assessment registration saved.'
    onSaved(failsCheck(d.utr, checkUtr) ? `${done} Its UTR fails its check, so it is flagged under Issues.` : done)
  }
  return (
    <FormDialog open title={d.id === null ? 'Add the Self Assessment registration' : 'Self Assessment registration'} onClose={onClose} onSubmit={save} submitLabel={d.id === null ? 'Add registration' : 'Save'} busy={busy} error={error} testid="sa-dialog">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="UTR"
          hint={recordUtr || (utr && !utr.ok) ? undefined : 'Also goes on the client record, which has none yet.'}
          warning={utrNote}
        >
          <input className={`${inputClass} font-mono`} inputMode="numeric" value={d.utr} onChange={(e) => set('utr', e.target.value)} data-testid="sa-utr" />
        </Field>
        <Field label="Where it stands">
          <SuggestInput value={d.register_status} onChange={(v) => set('register_status', v)} suggestions={REGISTER_STATUSES} />
        </Field>
      </div>
      <Field label="What the business does" hint="For a sole trader or a partner: the trade, in a few words">
        <input className={inputClass} value={d.business_description} onChange={(e) => set('business_description', e.target.value)} />
      </Field>
      <fieldset className="rounded-xl border border-white/10 p-3">
        <legend className="px-1 text-xs text-white/60">Filed through</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROUTES.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={d.filing_route.includes(r)}
                onChange={(e) => set('filing_route', e.target.checked ? [...d.filing_route, r] : d.filing_route.filter((x) => x !== r))}
              />
              {FILING_ROUTE_LABELS[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First year on file" hint="Like 2019-20">
          <input className={`${inputClass} font-mono`} value={d.first_year_on_file} onChange={(e) => set('first_year_on_file', e.target.value)} />
        </Field>
        <Field label="Last year on file" hint="Like 2024-25">
          <input className={`${inputClass} font-mono`} value={d.last_year_on_file} onChange={(e) => set('last_year_on_file', e.target.value)} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea className={`${inputClass} min-h-[4rem]`} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormDialog>
  )
}

interface IncomeDraft {
  id: number | null
  source_type: IncomeSourceType
  detail: string
  active: boolean
}

function IncomeDialog({ clientRef, initial, onClose, onSaved }: { clientRef: string; initial: IncomeDraft; onClose: () => void; onSaved: (message: string) => void }): JSX.Element {
  const [d, setD] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (): Promise<void> => {
    setError(null)
    const input: IncomeSourceInput = { ...(d.id === null ? { client_ref: clientRef } : { id: d.id }), source_type: d.source_type, detail: d.detail.trim(), active: d.active }
    setBusy(true)
    const r = await window.api.registers.saveIncomeSource(input)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onSaved(`${INCOME_SOURCE_LABELS[d.source_type]} ${d.id === null ? 'added' : 'saved'}.`)
  }
  return (
    <FormDialog open title={d.id === null ? 'Add a source of income' : INCOME_SOURCE_LABELS[initial.source_type]} onClose={onClose} onSubmit={save} submitLabel={d.id === null ? 'Add' : 'Save'} busy={busy} error={error} testid="income-dialog">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kind">
          <select className={inputClass} value={d.source_type} onChange={(e) => setD({ ...d, source_type: e.target.value as IncomeSourceType })} data-testid="income-type">
            {(Object.keys(INCOME_SOURCE_LABELS) as IncomeSourceType[]).map((t) => (
              <option key={t} value={t}>
                {INCOME_SOURCE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Detail" hint="The property, the trade or the employer">
          <input className={inputClass} value={d.detail} onChange={(e) => setD({ ...d, detail: e.target.value })} maxLength={60} data-testid="income-detail" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-white/80">
        <input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} />
        They still have this income
      </label>
    </FormDialog>
  )
}

/** The client's Self Assessment registration, and the sources of income behind it. */
export function SelfAssessmentPanel({ clientRef, recordUtr, onChanged }: { clientRef: string; recordUtr: string | null; onChanged?: () => void }): JSX.Element {
  const list = usePanelList(() => window.api.registers.getSaRegistration(clientRef), [clientRef])
  const [reg, setReg] = useState<RegDraft | null>(null)
  const [income, setIncome] = useState<IncomeDraft | null>(null)
  // The sources of income are kept per client, with or without a registration.
  const sources = usePanelList(() => window.api.registers.getIncomeSources(clientRef), [clientRef])
  const done = async (message: string): Promise<void> => {
    setReg(null)
    setIncome(null)
    await Promise.all([list.changed(message), sources.reload()])
    onChanged?.()
  }
  const r = list.data
  const loading = !list.loaded && !list.error
  const toggle = async (s: ClientIncomeSource): Promise<void> => {
    const res = await window.api.registers.saveIncomeSource({ id: s.id, active: s.active !== 1 })
    if (!res.ok) list.setError(res.error)
    else await done(`${INCOME_SOURCE_LABELS[s.source_type]}${s.detail ? ` (${s.detail})` : ''}: ${res.data.active ? 'current again' : 'no longer'}.`)
  }

  return (
    <Section
      title="Self Assessment"
      description="The registration — UTR, how the return is filed, the years on file — and what the client earns from."
      actions={
        !r && !loading ? (
          <button type="button" className={`${smallButton} inline-flex items-center gap-1`} onClick={() => setReg(regDraft())} data-testid="sa-new">
            <Plus size={12} aria-hidden /> Add the registration
          </button>
        ) : undefined
      }
    >
      <PanelMessages error={list.error ?? sources.error} note={list.note} />
      {loading ? (
        <p className="text-sm text-white/55" aria-busy="true">
          Loading the registration…
        </p>
      ) : r ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 px-4 py-3 text-sm" data-testid="sa-registration">
          <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs text-white/55">UTR</dt>
              <dd className="font-mono text-white/90">{r.utr ? utrText(r.utr) : <span className="font-sans text-white/55">Not recorded</span>}</dd>
              {r.utr && recordUtr && r.utr !== recordUtr && (
                <dd className="mt-1 flex items-center gap-1 text-xs text-amber-100/90">
                  <AlertTriangle size={12} aria-hidden /> Not the same as the client record’s {utrText(recordUtr)}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-xs text-white/55">Filed through</dt>
              <dd className="text-white/85">{routesText(r.filing_route) || <span className="text-white/55">Not recorded</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/55">Where it stands</dt>
              <dd className="text-white/85">{r.register_status ?? <span className="text-white/55">Not recorded</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/55">Years on file</dt>
              <dd className="font-mono text-white/85">
                {r.first_year_on_file || r.last_year_on_file ? `${r.first_year_on_file ?? '?'} to ${r.last_year_on_file ?? '?'}` : <span className="font-sans text-white/55">Not recorded</span>}
              </dd>
            </div>
            {r.business_description && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-white/55">What the business does</dt>
                <dd className="text-white/85">{r.business_description}</dd>
              </div>
            )}
            {r.notes && (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-xs text-white/55">Notes</dt>
                <dd className="whitespace-pre-line text-white/75">{r.notes}</dd>
              </div>
            )}
          </dl>
          <RowButtons
            what="the Self Assessment registration"
            testid="sa"
            onChange={() => setReg(regDraft(r))}
            removeQuestion="Remove the Self Assessment registration?"
            removeDetail="For a client who has stopped, set where it stands to Ceased instead: that keeps the record. The sources of income stay either way."
            onRemove={async () => {
              const res = await window.api.registers.deleteSaRegistration(r.id)
              if (!res.ok) list.setError(res.error)
              else await done('Self Assessment registration removed.')
            }}
          />
        </div>
      ) : (
        <p className="text-sm text-white/55">No Self Assessment registration recorded.</p>
      )}

      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm text-white/85">Sources of income</h3>
          <button type="button" className={`${smallButton} inline-flex items-center gap-1`} onClick={() => setIncome({ id: null, source_type: 'self_employment', detail: '', active: true })} data-testid="income-new">
            <Plus size={12} aria-hidden /> Add a source of income
          </button>
        </div>
        <ListState loading={!sources.loaded && !sources.error} empty={(sources.data ?? []).length === 0} loadingText="Loading sources of income…" emptyText="None recorded.">
          <ul className="divide-y divide-white/5 rounded-xl border border-white/10" data-testid="income-sources">
            {(sources.data ?? []).map((s) => {
              const what = `${INCOME_SOURCE_LABELS[s.source_type]}${s.detail ? `: ${s.detail}` : ''}`
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className={s.active ? 'text-white/85' : 'text-white/60'}>
                    {what}
                    {!s.active && (
                      <span className="ml-2">
                        <Tag>No longer</Tag>
                      </span>
                    )}
                  </span>
                  <RowButtons
                    what={what}
                    onChange={() => setIncome({ id: s.id, source_type: s.source_type, detail: s.detail, active: s.active === 1 })}
                    extra={
                      <button type="button" className={smallButton} onClick={() => void toggle(s)} aria-label={`${s.active ? 'Mark as no longer' : 'Mark as current'}: ${what}`}>
                        {s.active ? 'No longer' : 'Current again'}
                      </button>
                    }
                    removeQuestion={`Remove ${what}?`}
                    removeDetail="If they had this income in the past, marking it “No longer” keeps the history."
                    onRemove={async () => {
                      const res = await window.api.registers.deleteIncomeSource(s.id)
                      if (!res.ok) list.setError(res.error)
                      else await done(`${what} removed.`)
                    }}
                  />
                </li>
              )
            })}
          </ul>
        </ListState>
      </div>

      {reg && <RegistrationDialog clientRef={clientRef} recordUtr={recordUtr} initial={reg} onClose={() => setReg(null)} onSaved={(m) => void done(m)} />}
      {income && <IncomeDialog clientRef={clientRef} initial={income} onClose={() => setIncome(null)} onSaved={(m) => void done(m)} />}
    </Section>
  )
}
