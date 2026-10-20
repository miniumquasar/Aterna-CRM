/**
 * Settings → Firm details: the practice's name, address, contact details
 * and references (company number, VAT number, UTR, PAYE reference). They
 * appear on reports, letters and the recovery sheet. Partners and managers
 * change them; everyone else sees them. A reference that doesn't pass its
 * check is kept, with a note. Owned by the auth domain.
 */
import { useState } from 'react'
import { Building, RotateCcw, Save } from 'lucide-react'
import { FIRM_FIELDS, FIRM_FIELD_LABELS, type FirmField, type FirmView } from '@shared/contracts/auth'
import { formatInstant } from '@shared/domain/dates'
import { EmptyState, GlassButton, Loading, LoadProblem, toast } from '@renderer/components/ui'
import { useApiMutation, useApiQuery } from '@renderer/lib/api'
import { FirmFields, firmInput, firmProblem, firmValues, type FirmValues } from '@renderer/screens/auth/firm/FirmFields'

const GROUPS: ReadonlyArray<{ title: string; fields: readonly FirmField[] }> = [
  { title: 'The practice', fields: ['name', 'tradingName'] },
  { title: 'Address', fields: ['addressLine1', 'addressLine2', 'town', 'county', 'postcode', 'country'] },
  { title: 'Contact', fields: ['email', 'phone', 'website'] },
  { title: 'References', fields: ['companyNumber', 'vatNumber', 'utr', 'payeRef'] }
]

export default function FirmSection(): JSX.Element {
  const firm = useApiQuery('firm.get', undefined)
  if (firm.isPending) return <Loading label="Loading the firm’s details…" />
  if (firm.isError) return <LoadProblem title="The firm’s details couldn’t be loaded" error={firm.error} onRetry={() => void firm.refetch()} retrying={firm.isFetching} />
  const view = firm.data
  if (!view.canEdit) return <FirmReadOnly view={view} />
  return <FirmForm key={view.details?.updatedAt ?? 'new'} view={view} />
}

function FirmForm({ view }: { view: FirmView }): JSX.Element {
  const saved = firmValues(view.details)
  const [values, setValues] = useState<FirmValues>(saved)
  // Stored references show their notes straight away; others once a box is left.
  const [touched, setTouched] = useState<ReadonlySet<FirmField>>(() => new Set(FIRM_FIELDS.filter((f) => saved[f])))
  const [serverError, setServerError] = useState<{ field: FirmField; message: string } | null>(null)
  const save = useApiMutation('firm.update', {
    invalidates: ['firm.get', 'auth.status', 'system.info'],
    onSuccess: (data) => {
      const notes = Object.keys(data.warnings).length
      if (notes) toast.warning('Firm details saved, with notes', { description: 'A reference that doesn’t pass its check is kept; check the notes beside it.' })
      else toast.success('Firm details saved')
    },
    onError: (err) => {
      if (err.field && (FIRM_FIELDS as readonly string[]).includes(err.field)) setServerError({ field: err.field as FirmField, message: err.message })
      else toast.error('The firm’s details couldn’t be saved', { description: err.message })
    }
  })
  const dirty = FIRM_FIELDS.some((f) => values[f].trim() !== saved[f].trim())

  const submit = (): void => {
    setTouched(new Set(FIRM_FIELDS))
    if (firmProblem(values, FIRM_FIELDS)) return
    save.mutate(firmInput(values, FIRM_FIELDS))
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-7"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {GROUPS.map((g) => (
        <FirmFields
          key={g.title}
          heading={g.title}
          fields={g.fields}
          values={values}
          onChange={(f, v) => {
            setValues((old) => ({ ...old, [f]: v }))
            if (serverError?.field === f) setServerError(null)
          }}
          touched={touched}
          onBlur={(f) => setTouched((t) => new Set(t).add(f))}
          serverError={serverError}
        />
      ))}
      <div className="hairline sticky bottom-0 -mx-7 -mb-7 flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t bg-surface-raised/95 px-7 py-4 backdrop-blur">
        <p className="text-xs text-fg-subtle">{view.details?.updatedAt ? `Last changed ${formatInstant(view.details.updatedAt)}.` : 'Not saved yet.'}</p>
        <div className="flex gap-2">
          {dirty && (
            <GlassButton
              variant="ghost"
              icon={RotateCcw}
              onClick={() => {
                setValues(saved)
                setServerError(null)
              }}
            >
              Undo changes
            </GlassButton>
          )}
          <GlassButton type="submit" variant="primary" icon={Save} loading={save.isPending} disabled={!dirty}>
            Save firm details
          </GlassButton>
        </div>
      </div>
    </form>
  )
}

function FirmReadOnly({ view }: { view: FirmView }): JSX.Element {
  const d = view.details
  if (!d) return <EmptyState size="sm" icon={Building} title="No firm details yet" body="A partner or manager adds them here." />
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-fg-muted">Partners and managers change these.</p>
      {GROUPS.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">{g.title}</h3>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
            {g.fields.map((f) => (
              <div key={f} className="min-w-0">
                <dt className="text-xs text-fg-subtle">{FIRM_FIELD_LABELS[f]}</dt>
                <dd className="truncate text-sm text-fg">{d[f] || <span className="text-fg-subtle">Not given</span>}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
