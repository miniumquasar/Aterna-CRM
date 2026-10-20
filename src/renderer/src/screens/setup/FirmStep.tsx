/** The wizard's first step: the firm's name (saved with the first partner). Owned by the auth domain. */
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Field, GlassButton, TextInput } from '@renderer/components/ui'
import type { SetupStepProps } from './steps'

export default function FirmStep({ draft, updateDraft, next }: SetupStepProps): JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => {
    const name = draft.firmName.trim()
    if (!name) return setError('Enter the firm’s name.')
    if (name.length > 200) return setError('The firm’s name can be at most 200 characters.')
    setError(null)
    updateDraft({ firmName: name })
    next()
  }
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex flex-col gap-5"
    >
      <Field label="Firm name" hint="As it appears on your letters and invoices. You can add the address and references later in Settings → Firm details." error={error} required>
        <TextInput value={draft.firmName} onChange={(e) => updateDraft({ firmName: e.target.value })} autoFocus autoComplete="organization" placeholder="e.g. Dynamic Accountants Ltd" data-testid="setup-firm-name" />
      </Field>
      <div className="flex justify-end">
        <GlassButton type="submit" variant="primary" icon={ArrowRight} iconPosition="end">
          Continue
        </GlassButton>
      </div>
    </form>
  )
}
