/**
 * Settings → Your sign-in, for everyone: who you are signed in as, changing
 * your own password, how soon you are signed out when you step away, and
 * your latest sign-ins (so anything unexpected stands out). Owned by the
 * auth domain.
 */
import { useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, KeyRound, LockKeyhole, ShieldOff, Timer, UserX } from 'lucide-react'
import { IDLE_CHOICES, MIN_PASSWORD_LENGTH, idleLabel, passwordProblem, type Account, type SignInEvent, type SignInOutcome } from '@shared/contracts/auth'
import { ROLE_LABELS } from '@shared/domain/roles'
import { PasswordField } from '@renderer/components/session/PasswordField'
import { Avatar, Field, GlassBadge, GlassButton, Loading, LoadProblem, Select, toast } from '@renderer/components/ui'
import { useApiMutation, useApiQuery } from '@renderer/lib/api'
import { formatDateTime, formatRelative } from '@renderer/lib/format'
import { navigate } from '@renderer/stores/router'

function Block({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }): JSX.Element {
  return (
    <section aria-labelledby={id} className="hairline border-t pt-6 first:border-t-0 first:pt-0">
      <h3 id={id} className="font-display text-[15px] font-semibold text-fg">
        {title}
      </h3>
      {description && <p className="mb-4 mt-0.5 text-[13px] text-fg-muted">{description}</p>}
      {children}
    </section>
  )
}

export default function AccountSection(): JSX.Element {
  const account = useApiQuery('account.get', undefined)
  if (account.isPending) return <Loading label="Loading your sign-in…" />
  if (account.isError) return <LoadProblem title="Your sign-in couldn’t be loaded" error={account.error} onRetry={() => void account.refetch()} retrying={account.isFetching} />
  const a = account.data
  return (
    <div className="flex flex-col gap-6">
      <You account={a} />
      <ChangePassword account={a} />
      <IdleChoice account={a} />
      <RecentSignIns events={a.recentSignIns} />
    </div>
  )
}

function You({ account }: { account: Account }): JSX.Element {
  return (
    <section aria-label="You" className="flex flex-wrap items-center gap-4">
      <Avatar name={account.name} size="lg" decorative />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg font-semibold text-fg">{account.name}</span>
          <GlassBadge tone={account.role === 'partner' ? 'accent' : account.role === 'manager' ? 'info' : 'neutral'} size="sm">
            {ROLE_LABELS[account.role]}
          </GlassBadge>
        </p>
        <p className="text-[13px] text-fg-muted">
          Signs in as <span className="font-medium text-fg">{account.username}</span>
          {account.email ? ` · ${account.email}` : ''}
        </p>
        <p className="text-xs text-fg-subtle">
          {account.passwordChangedAt ? `Password last changed ${formatRelative(account.passwordChangedAt)}.` : 'Password not changed since the account was made.'}{' '}
          {account.role === 'partner' ? 'Change your name or email in People; another partner changes your role.' : 'A partner changes your name, email and role.'}
        </p>
      </div>
      {account.role === 'partner' && (
        <GlassButton size="sm" onClick={() => navigate('settings', { section: 'people' }, { replace: true })}>
          Open People
        </GlassButton>
      )}
    </section>
  )
}

function ChangePassword({ account }: { account: Account }): JSX.Element {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const context = { username: account.username, name: account.name }
  const change = useApiMutation('account.changePassword', {
    invalidates: ['account.get', 'auth.session'],
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setAgain('')
      setErrors({})
      toast.success('Password changed', { description: 'Use the new one next time you sign in.' })
    },
    onError: (err) => {
      if (err.field === 'currentPassword') setCurrent('')
      setErrors(err.field ? { [err.field]: err.message } : { form: err.message })
    }
  })
  const submit = (): void => {
    const found: Record<string, string> = {}
    if (!current) found.currentPassword = 'Enter your current password.'
    const problem = passwordProblem(next, context)
    if (problem) found.newPassword = problem
    else if (next === current) found.newPassword = 'That is your current password. Choose a new one.'
    else if (next !== again) found.again = 'The two passwords don’t match.'
    setErrors(found)
    if (Object.keys(found).length === 0) change.mutate({ currentPassword: current, newPassword: next })
  }
  return (
    <Block id="account-password" title="Change your password" description="Any other session of yours ends; this one carries on.">
      <form
        noValidate
        className="grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" error={errors.currentPassword} className="md:col-span-2 md:max-w-sm" testId="account-current-password" />
        <PasswordField
          label="New password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          strength={context}
          error={errors.newPassword}
          testId="account-new-password"
        />
        <PasswordField label="New password again" hint="To be sure it’s what you meant." value={again} onChange={setAgain} autoComplete="new-password" error={errors.again} testId="account-new-password-again" />
        {errors.form && (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger md:col-span-2">
            <CircleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
            {errors.form}
          </p>
        )}
        <div className="md:col-span-2">
          <GlassButton type="submit" variant="primary" icon={KeyRound} loading={change.isPending}>
            Change password
          </GlassButton>
        </div>
      </form>
    </Block>
  )
}

function IdleChoice({ account }: { account: Account }): JSX.Element {
  const { practiceMinutes, ownMinutes } = account.idle
  const options = [
    { value: 'practice', label: `The practice’s setting: ${idleLabel(practiceMinutes)}` },
    ...IDLE_CHOICES.filter((m) => m < practiceMinutes).map((m) => ({ value: String(m), label: idleLabel(m) }))
  ]
  const save = useApiMutation('account.setIdle', {
    invalidates: ['account.get', 'auth.session'],
    onSuccess: (a) => void toast.success(`You’ll be signed out after ${idleLabel(a.idle.effectiveMinutes)} without use`),
    onError: (err) => void toast.error('That didn’t change', { description: err.message })
  })
  return (
    <Block id="account-idle" title="When you step away" description="AETERNA CRM signs you out after a while without use, with a minute’s warning first. You can choose a shorter time than the practice’s.">
      <Field label="Sign me out after" className="max-w-sm">
        <Select
          value={ownMinutes === null ? 'practice' : String(ownMinutes)}
          onChange={(v) => save.mutate({ minutes: v === 'practice' ? null : Number(v) })}
          options={options}
          disabled={save.isPending}
        />
      </Field>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-subtle">
        <Timer size={13} aria-hidden />
        {account.role === 'partner' ? 'The practice’s setting is in Settings → People.' : 'A partner sets the practice’s longest time.'}
      </p>
    </Block>
  )
}

const OUTCOME: Record<SignInOutcome, { label: string; icon: typeof CircleCheck; tone: string }> = {
  success: { label: 'Signed in', icon: CircleCheck, tone: 'text-success' },
  wrong_password: { label: 'Wrong password', icon: CircleAlert, tone: 'text-warning' },
  unknown_user: { label: 'Unknown username', icon: UserX, tone: 'text-warning' },
  locked: { label: 'Refused: the account was locked', icon: LockKeyhole, tone: 'text-danger' },
  access_off: { label: 'Refused: access was off', icon: ShieldOff, tone: 'text-danger' }
}

function RecentSignIns({ events }: { events: SignInEvent[] }): JSX.Element {
  return (
    <Block id="account-history" title="Your recent sign-ins" description="If one of these wasn’t you, change your password and tell a partner.">
      {events.length === 0 ? (
        <p className="text-[13px] text-fg-muted">No sign-ins recorded yet.</p>
      ) : (
        <ul className="glass-sunken divide-y divide-line/10 rounded-2xl">
          {events.map((e) => {
            const o = OUTCOME[e.outcome]
            const Icon = o.icon
            return (
              <li key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                <Icon size={16} aria-hidden className={`mt-0.5 shrink-0 ${o.tone}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-fg">{o.label}</p>
                  {e.detail && <p className="text-xs text-fg-muted">{e.detail}</p>}
                </div>
                <span className="shrink-0 text-xs text-fg-subtle" title={formatDateTime(e.at)}>
                  {formatRelative(e.at)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Block>
  )
}
