import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import type { ClientContact, PayrollScheme, PayrollSchemeStatus, PayrollSchemeYear, PayrollYearInput, PayrollSchemeInput } from '@shared/types'
import { PAYROLL_STATUS_LABELS } from '@shared/types'
import { checkAccountsOfficeReference, checkPayeReference } from '@shared/references'
import { FormDialog } from '@renderer/components/forms/FormDialog'
import { failsCheck, referenceNote } from '@renderer/components/forms/reference-note'
import { call, Field, inputClass, Section, smallButton } from '../references/ui'
import { countOrNull, ListState, orNull, PanelMessages, RowButtons, SuggestInput, Tag, usePanelList } from './panel-kit'

const FREQUENCIES = ['Weekly', 'Fortnightly', 'Four-weekly', 'Monthly', 'Quarterly', 'Annually'] as const
const RTI_STATUSES = ['Active', 'Nil EPS', 'Not started', 'Dormant', 'Ceased'] as const

interface SchemeDraft {
  id: number | null
  paye_reference: string
  accounts_office_ref: string
  pay_frequency: string
  scheme_status: PayrollSchemeStatus
  payroll_contact_id: string
  notes: string
}

const schemeDraft = (s?: PayrollScheme): SchemeDraft => ({
  id: s?.id ?? null,
  paye_reference: s?.paye_reference ?? '',
  accounts_office_ref: s?.accounts_office_ref ?? '',
  pay_frequency: s?.pay_frequency ?? '',
  scheme_status: s?.scheme_status ?? 'active',
  payroll_contact_id: s?.payroll_contact_id ? String(s.payroll_contact_id) : '',
  notes: s?.notes ?? ''
})

function SchemeDialog({ clientRef, contacts, initial, onClose, onSaved }: {
  clientRef: string
  contacts: readonly ClientContact[]
  initial: SchemeDraft
  onClose: () => void
  onSaved: (message: string) => void
}): JSX.Element {
  const [d, setD] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof SchemeDraft>(k: K, v: SchemeDraft[K]): void => setD((x) => ({ ...x, [k]: v }))
  // Checked as they are typed, as the app checks them when saved. One that fails is kept and flagged, not refused.
  const payeNote = referenceNote(d.paye_reference, checkPayeReference) ?? null
  const aoNote = referenceNote(d.accounts_office_ref, checkAccountsOfficeReference) ?? null

  const save = async (): Promise<void> => {
    setError(null)
    if (!d.paye_reference.trim()) return setError('Enter the employer PAYE reference, like 123/AB45678.')
    const input: PayrollSchemeInput = {
      ...(d.id === null ? { client_ref: clientRef } : { id: d.id }),
      paye_reference: d.paye_reference.trim(),
      accounts_office_ref: orNull(d.accounts_office_ref),
      pay_frequency: orNull(d.pay_frequency),
      scheme_status: d.scheme_status,
      payroll_contact_id: d.payroll_contact_id ? Number(d.payroll_contact_id) : null,
      notes: orNull(d.notes)
    }
    setBusy(true)
    const r = await window.api.registers.savePayrollScheme(input)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    const flagged = [
      failsCheck(d.paye_reference, checkPayeReference) ? 'PAYE reference' : null,
      failsCheck(d.accounts_office_ref, checkAccountsOfficeReference) ? 'Accounts Office reference' : null
    ].filter(Boolean)
    const done = d.id === null ? `PAYE scheme ${r.data.paye_reference} added.` : `PAYE scheme ${r.data.paye_reference} saved.`
    onSaved(flagged.length ? `${done} Its ${flagged.join(' and ')} ${flagged.length > 1 ? 'fail their checks, so they are' : 'fails its check, so it is'} flagged under Issues.` : done)
  }

  return (
    <FormDialog open title={d.id === null ? 'Add a PAYE scheme' : `PAYE scheme ${initial.paye_reference}`} onClose={onClose} onSubmit={save} submitLabel={d.id === null ? 'Add scheme' : 'Save'} busy={busy} error={error} testid="payroll-dialog">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Employer PAYE reference" hint="From HMRC’s letters: 123/AB45678" warning={payeNote}>
          <input className={`${inputClass} font-mono`} value={d.paye_reference} onChange={(e) => set('paye_reference', e.target.value)} data-testid="payroll-paye" />
        </Field>
        <Field label="Accounts Office reference" hint="13 characters: 123PA00123456" warning={aoNote}>
          <input className={`${inputClass} font-mono`} value={d.accounts_office_ref} onChange={(e) => set('accounts_office_ref', e.target.value)} />
        </Field>
        <Field label="How often they pay">
          <SuggestInput value={d.pay_frequency} onChange={(v) => set('pay_frequency', v)} suggestions={FREQUENCIES} />
        </Field>
        <Field label="Where it stands">
          <select className={inputClass} value={d.scheme_status} onChange={(e) => set('scheme_status', e.target.value as PayrollSchemeStatus)}>
            {(Object.keys(PAYROLL_STATUS_LABELS) as PayrollSchemeStatus[]).map((s) => (
              <option key={s} value={s}>
                {PAYROLL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Payroll contact" hint={contacts.length === 0 ? 'Add the client’s contacts above to choose one here.' : undefined}>
        <select className={inputClass} value={d.payroll_contact_id} onChange={(e) => set('payroll_contact_id', e.target.value)} disabled={contacts.length === 0}>
          <option value="">Nobody chosen</option>
          {contacts.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name || c.email}
              {c.role ? ` (${c.role})` : ''}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes">
        <textarea className={`${inputClass} min-h-[4rem]`} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormDialog>
  )
}

interface YearDraft {
  id: number | null
  scheme_id: number
  tax_year: string
  employees: string
  cis_subcontractors: string
  rti_status: string
  payroll_file: string
}

/** The tax year that is running now, "2026-27" (it starts on 6 April). */
export function currentTaxYear(now = new Date()): string {
  const y = now.getFullYear()
  const started = now.getMonth() > 3 || (now.getMonth() === 3 && now.getDate() >= 6)
  const start = started ? y : y - 1
  return `${start}-${String(start + 1).slice(2)}`
}

const yearDraft = (schemeId: number, y?: PayrollSchemeYear): YearDraft => ({
  id: y?.id ?? null,
  scheme_id: schemeId,
  tax_year: y?.tax_year ?? currentTaxYear(),
  employees: y?.employees === null || y?.employees === undefined ? '' : String(y.employees),
  cis_subcontractors: y?.cis_subcontractors === null || y?.cis_subcontractors === undefined ? '' : String(y.cis_subcontractors),
  rti_status: y?.rti_status ?? '',
  payroll_file: y?.payroll_file ?? ''
})

function YearDialog({ scheme, initial, onClose, onSaved }: { scheme: PayrollScheme; initial: YearDraft; onClose: () => void; onSaved: (message: string) => void }): JSX.Element {
  const [d, setD] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof YearDraft>(k: K, v: YearDraft[K]): void => setD((x) => ({ ...x, [k]: v }))
  const save = async (): Promise<void> => {
    setError(null)
    const employees = countOrNull(d.employees)
    const cis = countOrNull(d.cis_subcontractors)
    if ([employees, cis].some((n) => n !== null && (!Number.isInteger(n) || n < 0))) return setError('Employees and CIS subcontractors are whole numbers.')
    const input: PayrollYearInput = {
      ...(d.id === null ? { scheme_id: d.scheme_id } : { id: d.id }),
      tax_year: d.tax_year.trim(),
      employees,
      cis_subcontractors: cis,
      rti_status: orNull(d.rti_status),
      payroll_file: orNull(d.payroll_file)
    }
    setBusy(true)
    const r = await window.api.registers.savePayrollYear(input)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onSaved(`${r.data.tax_year} ${d.id === null ? 'added to' : 'saved for'} ${scheme.paye_reference}.`)
  }
  return (
    <FormDialog open title={d.id === null ? `Add a tax year to ${scheme.paye_reference}` : `${initial.tax_year}, ${scheme.paye_reference}`} onClose={onClose} onSubmit={save} submitLabel={d.id === null ? 'Add year' : 'Save'} busy={busy} error={error} testid="payroll-year-dialog">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tax year" hint="Like 2025-26">
          <input className={`${inputClass} font-mono`} value={d.tax_year} onChange={(e) => set('tax_year', e.target.value)} data-testid="payroll-year-tax-year" />
        </Field>
        <Field label="Employees">
          <input className={inputClass} inputMode="numeric" value={d.employees} onChange={(e) => set('employees', e.target.value)} data-testid="payroll-year-employees" />
        </Field>
        <Field label="CIS subcontractors">
          <input className={inputClass} inputMode="numeric" value={d.cis_subcontractors} onChange={(e) => set('cis_subcontractors', e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="RTI">
          <SuggestInput value={d.rti_status} onChange={(v) => set('rti_status', v)} suggestions={RTI_STATUSES} />
        </Field>
        <Field label="Payroll file" hint="Where the year’s payroll is kept">
          <input className={inputClass} value={d.payroll_file} onChange={(e) => set('payroll_file', e.target.value)} />
        </Field>
      </div>
    </FormDialog>
  )
}

/** The client's PAYE schemes and, for each, its tax years: added, changed and removed here. */
export function PayrollPanel({ clientRef, onChanged }: { clientRef: string; onChanged?: () => void }): JSX.Element {
  const list = usePanelList(() => window.api.registers.getPayrollSchemes(clientRef), [clientRef])
  const [contacts, setContacts] = useState<ClientContact[]>([])
  const [scheme, setScheme] = useState<SchemeDraft | null>(null)
  const [year, setYear] = useState<{ scheme: PayrollScheme; draft: YearDraft } | null>(null)

  useEffect(() => {
    void call(window.api.registers.getContacts(clientRef), () => undefined).then((c) => c && setContacts(c))
  }, [clientRef])

  const done = async (message: string): Promise<void> => {
    setScheme(null)
    setYear(null)
    await list.changed(message)
    onChanged?.()
  }
  const contactName = (id: number | null): string | null => {
    const c = id ? contacts.find((x) => x.id === id) : undefined
    return c ? c.name || c.email : null
  }
  const schemes = list.data ?? []

  return (
    <Section
      title="PAYE schemes"
      description="Employer PAYE and Accounts Office references, how often they pay, and each tax year’s employees and RTI."
      actions={
        <button type="button" className={`${smallButton} inline-flex items-center gap-1`} onClick={() => setScheme(schemeDraft())} data-testid="payroll-new">
          <Plus size={12} aria-hidden /> Add a PAYE scheme
        </button>
      }
    >
      <PanelMessages error={list.error} note={list.note} />
      <ListState loading={!list.loaded && !list.error} empty={schemes.length === 0} loadingText="Loading PAYE schemes…" emptyText="No PAYE schemes recorded.">
        <ul className="space-y-3" data-testid="payroll-schemes">
          {schemes.map((s) => (
            <li key={s.id} className="rounded-xl border border-white/10 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="flex flex-wrap items-center gap-2 text-white/90">
                    <span className="font-mono">{s.paye_reference}</span>
                    <Tag tone={s.scheme_status === 'unknown' ? 'warn' : 'quiet'}>{PAYROLL_STATUS_LABELS[s.scheme_status]}</Tag>
                    {s.pay_frequency && <span className="text-xs text-white/60">Pays {s.pay_frequency.toLowerCase()}</span>}
                  </p>
                  <p className="text-xs text-white/60">
                    {s.accounts_office_ref ? (
                      <>
                        Accounts Office reference <span className="font-mono text-white/75">{s.accounts_office_ref}</span>
                      </>
                    ) : (
                      'No Accounts Office reference'
                    )}
                    {contactName(s.payroll_contact_id) && ` · Payroll contact: ${contactName(s.payroll_contact_id)}`}
                  </p>
                  {s.notes && <p className="whitespace-pre-line text-xs text-white/55">{s.notes}</p>}
                </div>
                <RowButtons
                  what={`PAYE scheme ${s.paye_reference}`}
                  testid="payroll"
                  onChange={() => setScheme(schemeDraft(s))}
                  removeQuestion={`Remove PAYE scheme ${s.paye_reference}?`}
                  removeDetail={s.years.length ? `Its ${s.years.length} tax year${s.years.length === 1 ? '' : 's'} go with it. To keep the history, set it to Closed instead.` : 'To keep it on record, set it to Closed instead.'}
                  onRemove={async () => {
                    const r = await window.api.registers.deletePayrollScheme(s.id)
                    if (!r.ok) list.setError(r.error)
                    else await done(`PAYE scheme ${s.paye_reference} removed.`)
                  }}
                />
              </div>

              <div className="mt-3">
                {s.years.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm" aria-label={`Tax years for ${s.paye_reference}`}>
                      <thead>
                        <tr className="border-b border-white/10 text-xs text-white/55">
                          <th scope="col" className="py-1.5 pr-4 font-normal">Tax year</th>
                          <th scope="col" className="py-1.5 pr-4 text-right font-normal">Employees</th>
                          <th scope="col" className="py-1.5 pr-4 text-right font-normal">CIS subcontractors</th>
                          <th scope="col" className="py-1.5 pr-4 font-normal">RTI</th>
                          <th scope="col" className="py-1.5 pr-4 font-normal">Payroll file</th>
                          <th scope="col" className="py-1.5 font-normal">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.years.map((y) => (
                          <tr key={y.id} className="border-b border-white/5">
                            <th scope="row" className="py-1.5 pr-4 font-mono font-normal text-white/80">{y.tax_year}</th>
                            <td className="py-1.5 pr-4 text-right tabular-nums text-white/80">{y.employees ?? '—'}</td>
                            <td className="py-1.5 pr-4 text-right tabular-nums text-white/80">{y.cis_subcontractors ?? '—'}</td>
                            <td className="py-1.5 pr-4 text-white/70">{y.rti_status ?? '—'}</td>
                            <td className="max-w-[14rem] truncate py-1.5 pr-4 text-white/60" title={y.payroll_file ?? undefined}>{y.payroll_file ?? '—'}</td>
                            <td className="py-1.5 text-right">
                              <RowButtons
                                what={`${y.tax_year} for ${s.paye_reference}`}
                                onChange={() => setYear({ scheme: s, draft: yearDraft(s.id, y) })}
                                removeQuestion={`Remove ${y.tax_year} from ${s.paye_reference}?`}
                                onRemove={async () => {
                                  const r = await window.api.registers.deletePayrollYear(y.id)
                                  if (!r.ok) list.setError(r.error)
                                  else await done(`${y.tax_year} removed from ${s.paye_reference}.`)
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button type="button" className={`${smallButton} mt-2 inline-flex items-center gap-1`} onClick={() => setYear({ scheme: s, draft: yearDraft(s.id) })} aria-label={`Add a tax year to ${s.paye_reference}`} data-testid="payroll-year-new">
                  <Plus size={12} aria-hidden /> Add a tax year
                </button>
              </div>
            </li>
          ))}
        </ul>
      </ListState>
      {scheme && <SchemeDialog clientRef={clientRef} contacts={contacts} initial={scheme} onClose={() => setScheme(null)} onSaved={(m) => void done(m)} />}
      {year && <YearDialog scheme={year.scheme} initial={year.draft} onClose={() => setYear(null)} onSaved={(m) => void done(m)} />}
    </Section>
  )
}
