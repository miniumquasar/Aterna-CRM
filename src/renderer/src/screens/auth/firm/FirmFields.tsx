/**
 * The firm's details as form fields, checked as you type with the same
 * rules the main process uses (checkFirmField): a problem stops saving, a
 * reference that fails its check is kept with a note. Used by Settings →
 * Firm details and the wizard's first step. Owned by the auth domain.
 */
import type { ReactNode } from 'react'
import { FIRM_FIELDS, FIRM_FIELD_LABELS, checkFirmField, type FirmDetails, type FirmField, type FirmInput } from '@shared/contracts/auth'
import { Field, TextInput } from '@renderer/components/ui'
import { cx } from '@renderer/lib/cx'

export type FirmValues = Record<FirmField, string>

export function firmValues(details: FirmDetails | null | undefined, fallbackName = ''): FirmValues {
  return Object.fromEntries(FIRM_FIELDS.map((f) => [f, details?.[f] ?? (f === 'name' ? fallbackName : f === 'country' ? 'United Kingdom' : '')])) as FirmValues
}

/** The request for the fields a form shows (empty boxes are sent as null, so they clear). */
export function firmInput(values: FirmValues, fields: readonly FirmField[]): FirmInput {
  const out: Record<string, string | null> = { name: values.name.trim() }
  for (const f of fields) if (f !== 'name') out[f] = values[f].trim() || null
  return out as FirmInput
}

/** The first problem that would stop saving, as [field, sentence], or null. */
export function firmProblem(values: FirmValues, fields: readonly FirmField[]): [FirmField, string] | null {
  for (const f of fields) {
    const problem = checkFirmField(f, values[f], values.country).problem
    if (problem) return [f, problem]
  }
  return null
}

const HINTS: Partial<Record<FirmField, string>> = {
  name: 'As it appears on your letters and invoices.',
  tradingName: 'Only if the practice trades under another name.',
  email: 'The practice’s main address, for letters and reports.',
  companyNumber: '8 characters, like 01234567 or OC123456.',
  vatNumber: '9 digits. GB is added for you.',
  utr: 'The practice’s 10-digit Corporation Tax UTR.',
  payeRef: 'The office number, a slash, then the reference: 123/AB45678.'
}

const AUTOCOMPLETE: Partial<Record<FirmField, string>> = {
  name: 'organization',
  addressLine1: 'address-line1',
  addressLine2: 'address-line2',
  town: 'address-level2',
  county: 'address-level1',
  postcode: 'postal-code',
  country: 'country-name',
  email: 'email',
  phone: 'tel',
  website: 'url'
}

const WIDE: ReadonlySet<FirmField> = new Set(['name', 'tradingName', 'addressLine1', 'addressLine2', 'email', 'website'])

export interface FirmFieldsProps {
  fields: readonly FirmField[]
  values: FirmValues
  onChange: (field: FirmField, value: string) => void
  /** Fields the person has left (or tried to save), whose checks now show. */
  touched: ReadonlySet<FirmField>
  onBlur: (field: FirmField) => void
  /** A refusal from saving, on its field. */
  serverError?: { field: FirmField; message: string } | null
  required?: readonly FirmField[]
  autoFocus?: FirmField
  testIds?: Partial<Record<FirmField, string>>
  /** Two columns on wide screens. */
  columns?: 1 | 2
  heading?: ReactNode
}

export function FirmFields({ fields, values, onChange, touched, onBlur, serverError, required = ['name'], autoFocus, testIds = {}, columns = 2, heading }: FirmFieldsProps): JSX.Element {
  return (
    <fieldset className="min-w-0">
      {heading && <legend className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">{heading}</legend>}
      <div className={cx('grid gap-x-4 gap-y-4', columns === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1')}>
        {fields.map((f) => {
          const check = touched.has(f) ? checkFirmField(f, values[f], values.country) : null
          const error = serverError?.field === f ? serverError.message : (check?.problem ?? null)
          const isRequired = required.includes(f)
          return (
            <Field
              key={f}
              label={FIRM_FIELD_LABELS[f]}
              hint={HINTS[f]}
              error={error}
              warning={!error ? (check?.warning ?? null) : null}
              required={isRequired}
              optional={!isRequired}
              className={cx(columns === 2 && WIDE.has(f) && 'md:col-span-2')}
            >
              <TextInput
                value={values[f]}
                onChange={(e) => onChange(f, e.target.value)}
                onBlur={() => onBlur(f)}
                autoFocus={autoFocus === f}
                autoComplete={AUTOCOMPLETE[f] ?? 'off'}
                spellCheck={f === 'name' || f === 'tradingName' ? undefined : false}
                type={f === 'email' ? 'email' : f === 'phone' ? 'tel' : 'text'}
                data-testid={testIds[f]}
              />
            </Field>
          )
        })}
      </div>
    </fieldset>
  )
}
