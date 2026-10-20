/**
 * The wizard's first step: the firm's name, and its address and contact
 * details if they are to hand. Saved straight away (before anyone can sign
 * in), so the wizard carries on from here after a restart. The references
 * can wait for Settings → Firm details. Owned by the auth domain.
 */
import { useState } from 'react'
import { ArrowRight, Info } from 'lucide-react'
import type { FirmField } from '@shared/contracts/auth'
import { GlassButton } from '@renderer/components/ui'
import { useApiMutation, useApiQuery } from '@renderer/lib/api'
import { FirmFields, firmInput, firmProblem, firmValues, type FirmValues } from '@renderer/screens/auth/firm/FirmFields'
import type { SetupStepProps } from './steps'

const NAME: readonly FirmField[] = ['name']
const CONTACT: readonly FirmField[] = ['addressLine1', 'town', 'postcode', 'email', 'phone']
const ALL: readonly FirmField[] = [...NAME, ...CONTACT]

export default function FirmStep({ draft, updateDraft, next }: SetupStepProps): JSX.Element {
  const setup = useApiQuery('setup.status', undefined)
  const [values, setValues] = useState<FirmValues>(() => firmValues(setup.data?.firm, draft.firmName))
  const [touched, setTouched] = useState<ReadonlySet<FirmField>>(new Set())
  const [serverError, setServerError] = useState<{ field: FirmField; message: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const save = useApiMutation('setup.saveFirm', {
    invalidates: ['setup.status', 'auth.status'],
    onSuccess: (data) => {
      updateDraft({ firmName: data.firm?.name ?? values.name.trim() })
      next()
    },
    onError: (err) => {
      if (err.field && (ALL as readonly string[]).includes(err.field)) setServerError({ field: err.field as FirmField, message: err.message })
      else setFormError(err.message)
    }
  })

  const change = (field: FirmField, value: string): void => {
    setValues((v) => ({ ...v, [field]: value }))
    if (field === 'name') updateDraft({ firmName: value })
    if (serverError?.field === field) setServerError(null)
    setFormError(null)
  }

  const submit = (): void => {
    setTouched(new Set(ALL))
    if (firmProblem(values, ALL)) return
    save.mutate(firmInput(values, ALL))
  }

  const blur = (field: FirmField): void => setTouched((t) => new Set(t).add(field))
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex flex-col gap-6"
    >
      <FirmFields fields={NAME} values={values} onChange={change} touched={touched} onBlur={blur} serverError={serverError} autoFocus="name" testIds={{ name: 'setup-firm-name' }} columns={1} />
      <FirmFields fields={CONTACT} values={values} onChange={change} touched={touched} onBlur={blur} serverError={serverError} heading="Address and contact, if you have them to hand" />
      <p className="flex items-start gap-2 text-xs text-fg-subtle">
        <Info size={14} aria-hidden className="mt-px shrink-0" />
        The company number, VAT number, UTR and PAYE reference go in Settings → Firm details whenever suits.
      </p>
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <div className="flex justify-end">
        <GlassButton type="submit" variant="primary" icon={ArrowRight} iconPosition="end" loading={save.isPending}>
          Continue
        </GlassButton>
      </div>
    </form>
  )
}
