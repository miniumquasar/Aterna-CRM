/**
 * Inviting someone to the practice: their name, email if wanted, role and
 * how long the invitation lasts; then the code to give them, shown once.
 * InviteCodeDialog shows a renewed code the same way. Owned by the auth
 * domain.
 */
import { useState } from 'react'
import { Check, Copy, Mail, UserPlus } from 'lucide-react'
import {
  DEFAULT_INVITE_DAYS,
  INVITE_EXPIRY_CHOICES,
  ROLE_DESCRIPTIONS,
  looksLikeEmail,
  type InviteCreated
} from '@shared/contracts/auth'
import { ROLE_LABELS, ROLES, type Role } from '@shared/domain/roles'
import { PRODUCT_NAME } from '@shared/product'
import { instantToLondonDate } from '@shared/domain/dates'
import { Field, GlassButton, GlassModal, Segmented, Select, TextInput } from '@renderer/components/ui'
import { useApiMutation } from '@renderer/lib/api'
import { formatDate } from '@renderer/lib/format'
import { copyText, roleNoun } from './people-ui'

const EXPIRY_OPTIONS = INVITE_EXPIRY_CHOICES.map((d) => ({ value: String(d), label: d === 1 ? '1 day' : `${d} days` }))
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))

export function InviteDialog({ open, onClose, firmName }: { open: boolean; onClose: () => void; firmName: string | null }): JSX.Element {
  return (
    <GlassModal open={open} onClose={onClose} title="Invite someone" description="They set up their own sign-in on this PC with the code you give them." size="md" closeOnBackdrop={false}>
      {open && <InviteForm onClose={onClose} firmName={firmName} />}
    </GlassModal>
  )
}

function InviteForm({ onClose, firmName }: { onClose: () => void; firmName: string | null }): JSX.Element {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [days, setDays] = useState(String(DEFAULT_INVITE_DAYS))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [created, setCreated] = useState<InviteCreated | null>(null)
  const invite = useApiMutation('people.invite', {
    invalidates: ['people.list'],
    onSuccess: (data) => setCreated(data),
    onError: (err) => setErrors(err.field ? { [err.field]: err.message } : { form: err.message })
  })

  if (created) return <InviteCode created={created} firmName={firmName} onDone={onClose} />

  const submit = (): void => {
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = 'Enter their name.'
    if (email.trim() && !looksLikeEmail(email)) found.email = 'Enter an email address like name@example.co.uk, or leave it empty.'
    setErrors(found)
    if (Object.keys(found).length === 0) invite.mutate({ name: name.trim(), email: email.trim() || null, role, expiresInDays: Number(days) })
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4 pt-1"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Their name" hint="As the practice should show it." error={errors.name} required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="off" data-testid="invite-name" />
        </Field>
        <Field label="Email" optional hint="To send them the code from your mail app." error={errors.email}>
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" spellCheck={false} />
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg" aria-hidden>
          Role
        </span>
        <Segmented label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} fullWidth />
        <p className="text-xs text-fg-subtle">{ROLE_DESCRIPTIONS[role]}.</p>
      </div>
      <Field label="The invitation lasts" hint="After that the code stops working; you can make a new one." className="md:max-w-xs">
        <Select value={days} onChange={setDays} options={EXPIRY_OPTIONS} />
      </Field>
      {errors.form && (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      )}
      <div className="hairline -mx-6 mt-2 flex justify-end gap-2 border-t px-6 pb-4 pt-4">
        <GlassButton variant="ghost" onClick={onClose}>
          Cancel
        </GlassButton>
        <GlassButton type="submit" variant="primary" icon={UserPlus} loading={invite.isPending}>
          Create invitation
        </GlassButton>
      </div>
    </form>
  )
}

function instructions(created: InviteCreated, firmName: string | null): string {
  const until = formatDate(instantToLondonDate(created.invite.expiresAt), 'long')
  return [
    `Hello ${created.invite.name.split(/\s+/)[0]},`,
    '',
    `You’re invited to join ${firmName ?? 'the practice'} on ${PRODUCT_NAME} as ${roleNoun(created.invite.role)}.`,
    '',
    `On the practice PC, open ${PRODUCT_NAME}, choose “I have an invitation code” on the sign-in page, and enter this code:`,
    '',
    `    ${created.code}`,
    '',
    `You’ll then choose your own username and password. The code works once, until ${until}.`
  ].join('\n')
}

/** The code, shown once, with ways to pass it on. */
export function InviteCode({ created, firmName, onDone }: { created: InviteCreated; firmName: string | null; onDone: () => void }): JSX.Element {
  const until = formatDate(instantToLondonDate(created.invite.expiresAt), 'long')
  const email = created.invite.email
  const message = instructions(created, firmName)
  return (
    <div className="flex flex-col gap-4 pt-1" data-testid="invite-created">
      <p className="text-sm text-fg">
        Give this code to <strong className="font-semibold">{created.invite.name}</strong>. It makes them {roleNoun(created.invite.role)}.
      </p>
      <div className="glass-sunken flex flex-col items-center gap-3 rounded-2xl px-4 py-5">
        <p className="select-all font-mono text-[26px] font-semibold tracking-[0.22em] text-fg" data-testid="invite-code-shown" aria-label={`Invitation code ${created.code.split('').join(' ')}`}>
          {created.code}
        </p>
        <GlassButton size="sm" icon={Copy} onClick={() => void copyText(created.code, 'Code')}>
          Copy code
        </GlassButton>
      </div>
      <p className="text-[13px] text-fg-muted">
        On this PC, they choose <span className="font-medium text-fg">I have an invitation code</span> on the sign-in page and type it in, then choose their own username and password. It works once, until {until}.
      </p>
      <p className="rounded-xl bg-warning/10 px-3 py-2 text-xs text-fg-muted">The code isn’t shown again. If it’s lost, make a new one from the list of invitations.</p>
      <div className="hairline -mx-6 mt-2 flex flex-wrap justify-end gap-2 border-t px-6 pb-4 pt-4">
        <GlassButton variant="ghost" icon={Copy} onClick={() => void copyText(message, 'Invitation')}>
          Copy the invitation
        </GlassButton>
        {email && (
          <GlassButton
            variant="secondary"
            icon={Mail}
            onClick={() => window.open(`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Your invitation to ${firmName ?? PRODUCT_NAME}`)}&body=${encodeURIComponent(message)}`)}
          >
            Email it
          </GlassButton>
        )}
        <GlassButton variant="primary" icon={Check} onClick={onDone} data-autofocus>
          Done
        </GlassButton>
      </div>
    </div>
  )
}

/** A renewed code, in its own dialog. */
export function InviteCodeDialog({ created, firmName, onClose }: { created: InviteCreated | null; firmName: string | null; onClose: () => void }): JSX.Element {
  return (
    <GlassModal open={created !== null} onClose={onClose} title="A new invitation code" description="The old code no longer works." size="md">
      {created && <InviteCode created={created} firmName={firmName} onDone={onClose} />}
    </GlassModal>
  )
}
