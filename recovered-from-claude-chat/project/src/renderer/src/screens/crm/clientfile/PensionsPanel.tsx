import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { PensionSaveResult, PensionScheme, PensionSchemeInput } from '@shared/types'
import { dayText, todayIso } from '@renderer/lib/dates'
import { FormDialog } from '@renderer/components/forms/FormDialog'
import { Field, inputClass, Section, smallButton } from '../references/ui'
import { ListState, orNull, PanelMessages, RowButtons, SuggestInput, usePanelList } from './panel-kit'

const PROVIDERS = ['NEST', 'The People’s Pension', 'Smart Pension', 'NOW: Pensions', 'Aviva', 'Royal London', 'Scottish Widows', 'Legal & General'] as const
const DECLARATION_STATUSES = ['Done', 'Due', 'Overdue', 'Not due yet'] as const

interface Draft {
  id: number | null
  letter_code: string
  duties_start_date: string
  provider: string
  declaration_date: string
  declaration_status: string
  last_payment_date: string
  notes: string
}

const draftFrom = (p?: PensionScheme): Draft => ({
  id: p?.id ?? null,
  letter_code: p?.letter_code ?? '',
  duties_start_date: p?.duties_start_date?.slice(0, 10) ?? '',
  provider: p?.provider ?? '',
  declaration_date: p?.declaration_date?.slice(0, 10) ?? '',
  declaration_status: p?.declaration_status ?? '',
  last_payment_date: p?.last_payment_date?.slice(0, 10) ?? '',
  notes: p?.notes ?? ''
})

/** What a save (or a removal) did to the re-declaration deadlines, in a sentence; empty when nothing. */
export function deadlineChanges(r: PensionSaveResult, removed = false): string {
  const parts: string[] = []
  // Soonest first, so "passed: confirm it was made" reads before the one ahead.
  const added = [...r.deadlinesAdded].sort((a, b) => a.due_date.localeCompare(b.due_date))
  if (added.length) {
    const dates = added.map((d) => `${dayText(d.due_date)}${d.status === 'unknown' ? ' (passed: confirm it was made)' : ''}`)
    parts.push(`Re-declaration deadline${added.length === 1 ? '' : 's'} added: due ${dates.join(' and ')}.`)
  }
  if (r.deadlinesRestored) parts.push(`${r.deadlinesRestored} earlier re-declaration deadline${r.deadlinesRestored === 1 ? '' : 's'} back on the list.`)
  if (r.deadlinesArchived) {
    const n = `${r.deadlinesArchived} open re-declaration deadline${r.deadlinesArchived === 1 ? '' : 's'}`
    parts.push(removed ? `${n} archived with it.` : `${n} from the old date archived.`)
  }
  return parts.join(' ')
}

function PensionDialog({ clientRef, initial, onClose, onSaved }: { clientRef: string; initial: Draft; onClose: () => void; onSaved: (message: string) => void }): JSX.Element {
  const [d, setD] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]): void => setD((x) => ({ ...x, [k]: v }))
  const today = todayIso()
  const code = d.letter_code.replace(/\s+/g, '')
  const codeError = code && !/^\d{10}$/.test(code) ? 'A Pensions Regulator letter code is 10 digits.' : null

  const save = async (): Promise<void> => {
    setError(null)
    if (codeError) return setError(codeError)
    const input: PensionSchemeInput = {
      ...(d.id === null ? { client_ref: clientRef } : { id: d.id }),
      letter_code: orNull(d.letter_code),
      duties_start_date: orNull(d.duties_start_date),
      provider: orNull(d.provider),
      declaration_date: orNull(d.declaration_date),
      declaration_status: orNull(d.declaration_status),
      last_payment_date: orNull(d.last_payment_date),
      notes: orNull(d.notes)
    }
    setBusy(true)
    const r = await window.api.registers.savePensionScheme(input)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onSaved(`${d.id === null ? 'Workplace pension added.' : 'Workplace pension saved.'} ${deadlineChanges(r.data)}`.trim())
  }

  return (
    <FormDialog
      open
      title={d.id === null ? 'Add a workplace pension' : initial.provider || 'Workplace pension'}
      description="Auto-enrolment. The duties start date sets the re-declaration deadline: five months after each third anniversary."
      onClose={onClose}
      onSubmit={save}
      submitLabel={d.id === null ? 'Add pension' : 'Save'}
      busy={busy}
      error={error}
      testid="pension-dialog"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Provider">
          <SuggestInput value={d.provider} onChange={(v) => set('provider', v)} suggestions={PROVIDERS} testid="pension-provider" />
        </Field>
        <Field label="Letter code" hint="10 digits, from The Pensions Regulator" error={codeError}>
          <input className={`${inputClass} font-mono`} inputMode="numeric" value={d.letter_code} onChange={(e) => set('letter_code', e.target.value)} data-testid="pension-letter-code" />
        </Field>
        <Field label="Duties start date" hint="Also called the staging date">
          <input type="date" className={inputClass} value={d.duties_start_date} onChange={(e) => set('duties_start_date', e.target.value)} data-testid="pension-duties" />
        </Field>
        <Field label="Last payment to the scheme">
          <input type="date" className={inputClass} max={today} value={d.last_payment_date} onChange={(e) => set('last_payment_date', e.target.value)} />
        </Field>
      </div>
      <fieldset className="grid gap-3 rounded-xl border border-white/10 p-3 sm:grid-cols-2">
        <legend className="px-1 text-xs text-white/60">Declaration of compliance</legend>
        <Field label="Made on">
          <input type="date" className={inputClass} max={today} value={d.declaration_date} onChange={(e) => set('declaration_date', e.target.value)} />
        </Field>
        <Field label="Where it stands">
          <SuggestInput value={d.declaration_status} onChange={(v) => set('declaration_status', v)} suggestions={DECLARATION_STATUSES} />
        </Field>
      </fieldset>
      <Field label="Notes">
        <textarea className={`${inputClass} min-h-[4rem]`} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormDialog>
  )
}

/** The client's workplace pensions (auto-enrolment), kept in step with their re-declaration deadlines. */
export function PensionsPanel({ clientRef, onChanged }: { clientRef: string; onChanged?: () => void }): JSX.Element {
  const list = usePanelList(() => window.api.registers.getPensionSchemes(clientRef), [clientRef])
  const [editing, setEditing] = useState<Draft | null>(null)
  const done = async (message: string): Promise<void> => {
    setEditing(null)
    await list.changed(message)
    onChanged?.()
  }
  const pensions = list.data ?? []

  return (
    <Section
      title="Workplace pensions"
      description="Auto-enrolment duties, the provider and the declaration of compliance. The re-declaration deadline on the list above follows the duties start date."
      actions={
        <button type="button" className={`${smallButton} inline-flex items-center gap-1`} onClick={() => setEditing(draftFrom())} data-testid="pension-new">
          <Plus size={12} aria-hidden /> Add a workplace pension
        </button>
      }
    >
      <PanelMessages error={list.error} note={list.note} />
      <ListState loading={!list.loaded && !list.error} empty={pensions.length === 0} loadingText="Loading workplace pensions…" emptyText="No workplace pension recorded.">
        <ul className="divide-y divide-white/5 rounded-xl border border-white/10" data-testid="pension-schemes">
          {pensions.map((p) => {
            const name = p.provider || 'Provider not recorded'
            return (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 space-y-1">
                  <p className="text-white/90">
                    {name}
                    {p.letter_code && <span className="ml-2 font-mono text-xs text-white/60">{p.letter_code}</span>}
                  </p>
                  <p className="text-xs text-white/60">
                    {p.duties_start_date ? `Duties from ${dayText(p.duties_start_date.slice(0, 10))}` : 'No duties start date, so no re-declaration deadline'}
                    {p.declaration_date && ` · Declared ${dayText(p.declaration_date.slice(0, 10))}`}
                    {p.declaration_status && ` (${p.declaration_status})`}
                    {p.last_payment_date && ` · Last payment ${dayText(p.last_payment_date.slice(0, 10))}`}
                  </p>
                  {p.notes && <p className="whitespace-pre-line text-xs text-white/55">{p.notes}</p>}
                </div>
                <RowButtons
                  what={`workplace pension ${p.provider ?? ''}`.trim()}
                  testid="pension"
                  onChange={() => setEditing(draftFrom(p))}
                  removeQuestion="Remove this workplace pension?"
                  removeDetail="Its open re-declaration deadlines are archived with it. Filed ones stay on record."
                  onRemove={async () => {
                    const r = await window.api.registers.deletePensionScheme(p.id)
                    if (!r.ok) list.setError(r.error)
                    else await done(`Workplace pension removed. ${deadlineChanges(r.data, true)}`.trim())
                  }}
                />
              </li>
            )
          })}
        </ul>
      </ListState>
      {editing && <PensionDialog clientRef={clientRef} initial={editing} onClose={() => setEditing(null)} onSaved={(m) => void done(m)} />}
    </Section>
  )
}
