/**
 * One person, for a partner: their details, role, sign-in (unlock, access
 * on or off, a temporary password) and removal — refused, with the reason
 * and the way forward, while clients or past work are under them. For the
 * partner themselves, only their details: their own role, access and
 * password are not changed here. Owned by the auth domain.
 */
import { useState, type ReactNode } from 'react'
import { KeyRound, LockKeyholeOpen, Save, ShieldOff, Trash2, UserRound } from 'lucide-react'
import { ROLE_DESCRIPTIONS, looksLikeEmail, type Person, type RemovalCheck } from '@shared/contracts/auth'
import { ROLE_LABELS, ROLES, type Role } from '@shared/domain/roles'
import { Avatar, Field, GlassButton, GlassModal, GlassPanel, Segmented, TextInput, Toggle, toast, useConfirm } from '@renderer/components/ui'
import { call, errorMessage, useApiMutation } from '@renderer/lib/api'
import { formatDateTime, formatRelative } from '@renderer/lib/format'
import { navigate } from '@renderer/stores/router'
import { PersonBadges, RoleBadge, roleNoun } from './people-ui'
import { ResetPasswordDialog } from './ResetPasswordDialog'

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))
const LIST: ['people.list'] = ['people.list']

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="hairline border-t pt-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">{title}</h3>
      {children}
    </section>
  )
}

export function PersonDialog({ person, onClose, lockAfter }: { person: Person | null; onClose: () => void; lockAfter: number }): JSX.Element {
  return (
    <GlassModal
      open={person !== null}
      onClose={onClose}
      size="md"
      title={person?.name ?? ''}
      description={person ? `${person.username} · ${ROLE_LABELS[person.role]}${person.isYou ? ' · you' : ''}` : undefined}
    >
      {person && <PersonBody key={person.id} person={person} onClose={onClose} lockAfter={lockAfter} />}
    </GlassModal>
  )
}

function PersonBody({ person, onClose, lockAfter }: { person: Person; onClose: () => void; lockAfter: number }): JSX.Element {
  const confirm = useConfirm()
  const [resetOpen, setResetOpen] = useState(false)
  const [removal, setRemoval] = useState<RemovalCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const fail = (err: { message: string }): void => void toast.error('That didn’t change', { description: err.message })
  const setRole = useApiMutation('people.setRole', { invalidates: LIST, onError: fail, onSuccess: (p) => toast.success(`${p.name} is now ${roleNoun(p.role)}`) })
  const setAccess = useApiMutation('people.setAccess', {
    invalidates: LIST,
    onError: fail,
    onSuccess: (p) => toast.success(p.active ? `${p.name} can sign in again` : `${p.name}’s access is off`)
  })
  const unlock = useApiMutation('people.unlock', { invalidates: LIST, onError: fail, onSuccess: (p) => toast.success(`${p.name}’s account is unlocked`) })
  const remove = useApiMutation('people.remove', {
    invalidates: LIST,
    onError: fail,
    onSuccess: () => {
      toast.success(`${person.name} has been removed`)
      onClose()
    }
  })

  const chooseRole = async (role: Role): Promise<void> => {
    if (role === person.role) return
    if (role === 'partner') {
      const ok = await confirm({
        title: `Make ${person.name} a partner?`,
        body: 'Partners can do everything: manage people, the vault and the licence, and delete records the practice must keep.',
        confirmLabel: 'Make them a partner'
      })
      if (!ok) return
    }
    setRole.mutate({ id: person.id, role })
  }

  const chooseAccess = async (active: boolean): Promise<void> => {
    if (!active) {
      const ok = await confirm({
        title: `Turn off ${person.name}’s access?`,
        body: 'They are signed out now and can’t sign in until a partner turns it back on. Their clients and records stay exactly as they are.',
        confirmLabel: 'Turn access off',
        tone: 'danger'
      })
      if (!ok) return
    }
    setAccess.mutate({ id: person.id, active })
  }

  const startRemove = async (): Promise<void> => {
    setChecking(true)
    try {
      const check = await call('people.removalCheck', { id: person.id })
      setRemoval(check)
      if (!check.canRemove) return
      const ok = await confirm({
        title: `Remove ${person.name}?`,
        body: `${person.name} can no longer sign in and leaves the list of people. The audit log keeps everything they did. This can’t be undone; to stop them signing in for a while, turn their access off instead.`,
        confirmLabel: `Remove ${person.name}`,
        tone: 'danger'
      })
      if (ok) remove.mutate({ id: person.id })
    } catch (err) {
      toast.error('That couldn’t be checked', { description: errorMessage(err) })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-4 pt-1">
      <div className="flex items-center gap-3">
        <Avatar name={person.name} size="lg" decorative />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <RoleBadge role={person.role} size="md" />
            <PersonBadges person={person} />
          </div>
          <p className="text-xs text-fg-subtle">
            {person.lastSignInAt ? (
              <>
                Last signed in <span title={formatDateTime(person.lastSignInAt)}>{formatRelative(person.lastSignInAt)}</span>
              </>
            ) : (
              'Hasn’t signed in yet'
            )}
            {person.clients.assigned + person.clients.responsible > 0 &&
              ` · looks after ${person.clients.assigned} client${person.clients.assigned === 1 ? '' : 's'}${person.clients.responsible ? `, partner for ${person.clients.responsible}` : ''}`}
          </p>
        </div>
      </div>

      <DetailsForm person={person} />

      {person.isYou ? (
        <GlassPanel tone="info" padding="sm" radius="lg" className="flex items-start gap-3">
          <UserRound size={17} aria-hidden className="mt-0.5 shrink-0 text-info" />
          <div className="min-w-0 text-[13px] text-fg-muted">
            <p>This is you. Another partner changes your role and access. Your password and idle sign-out are in Your sign-in.</p>
            <GlassButton
              size="sm"
              className="mt-2"
              onClick={() => {
                onClose()
                navigate('settings', { section: 'account' }, { replace: true })
              }}
            >
              Open Your sign-in
            </GlassButton>
          </div>
        </GlassPanel>
      ) : (
        <>
          <Section title="Role">
            <Segmented label={`${person.name}’s role`} value={person.role} onChange={(r) => void chooseRole(r)} options={ROLE_OPTIONS} fullWidth />
            <p className="mt-2 text-xs text-fg-subtle">{ROLE_DESCRIPTIONS[person.role]}.</p>
          </Section>

          <Section title="Signing in">
            <div className="flex flex-col gap-4">
              {person.locked && (
                <GlassPanel tone="warning" padding="sm" radius="lg" className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 text-[13px] text-fg">
                    Locked after {lockAfter} wrong passwords in a row
                    {person.lockedAt ? `, ${formatRelative(person.lockedAt)}` : ''}.
                    {person.selfUnlocksAt ? ` It unlocks by itself at ${formatDateTime(person.selfUnlocksAt).split(', ')[1]}.` : ''}
                  </p>
                  <GlassButton size="sm" variant="primary" icon={LockKeyholeOpen} loading={unlock.isPending} onClick={() => unlock.mutate({ id: person.id })}>
                    Unlock
                  </GlassButton>
                </GlassPanel>
              )}
              {!person.locked && person.failedSignIns > 0 && (
                <p className="text-[13px] text-fg-muted">
                  {person.failedSignIns} wrong password{person.failedSignIns === 1 ? '' : 's'} since their last good one.{' '}
                  <GlassButton variant="ghost" size="sm" onClick={() => unlock.mutate({ id: person.id })} loading={unlock.isPending}>
                    Clear the count
                  </GlassButton>
                </p>
              )}
              <Toggle
                checked={person.active}
                onChange={(on) => void chooseAccess(on)}
                disabled={setAccess.isPending}
                label="Can sign in"
                description={person.active ? 'Turn off to stop them signing in, keeping all their records.' : 'Their access is off. Turn it on to let them sign in again.'}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 flex-1 text-[13px] text-fg-muted">
                  {person.mustChangePassword ? 'They have a temporary password and choose their own at their next sign-in.' : 'Forgotten their password? Set a temporary one for them.'}
                </p>
                <GlassButton size="sm" icon={KeyRound} onClick={() => setResetOpen(true)}>
                  Set a temporary password
                </GlassButton>
              </div>
            </div>
          </Section>

          <Section title="Removing">
            {removal && !removal.canRemove ? (
              <GlassPanel tone="warning" padding="sm" radius="lg" role="status">
                <p className="text-[13px] font-medium text-fg">{person.name} can’t be removed yet</p>
                {removal.links.length > 0 ? (
                  <ul className="mt-1 list-disc pl-5 text-[13px] text-fg-muted">
                    {removal.links.map((l) => (
                      <li key={l.label}>{l.label}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[13px] text-fg-muted">{removal.reason}</p>
                )}
                {removal.links.length > 0 && <p className="mt-2 text-[13px] text-fg-muted">Move these to someone else first, or turn their access off: their records stay as they are.</p>}
                {person.active && (
                  <GlassButton size="sm" className="mt-3" icon={ShieldOff} onClick={() => void chooseAccess(false)}>
                    Turn access off instead
                  </GlassButton>
                )}
              </GlassPanel>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 flex-1 text-[13px] text-fg-muted">Only for someone with no clients or past work in the practice.</p>
                <GlassButton size="sm" variant="danger" icon={Trash2} loading={checking || remove.isPending} onClick={() => void startRemove()}>
                  Remove from the practice
                </GlassButton>
              </div>
            )}
          </Section>
          <ResetPasswordDialog person={person} open={resetOpen} onClose={() => setResetOpen(false)} />
        </>
      )}
    </div>
  )
}

function DetailsForm({ person }: { person: Person }): JSX.Element {
  const [name, setName] = useState(person.name)
  const [email, setEmail] = useState(person.email ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const update = useApiMutation('people.update', {
    invalidates: ['people.list', 'people.directory', 'auth.status'],
    onSuccess: (p) => toast.success(`${p.name}’s details saved`),
    onError: (err) => setErrors(err.field ? { [err.field]: err.message } : { form: err.message })
  })
  const changed = name.trim() !== person.name || (email.trim() || null) !== person.email
  const submit = (): void => {
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = 'Enter their name.'
    if (email.trim() && !looksLikeEmail(email)) found.email = 'Enter an email address like name@example.co.uk, or leave it empty.'
    setErrors(found)
    if (Object.keys(found).length === 0) update.mutate({ id: person.id, name: name.trim(), email: email.trim() || null })
  }
  return (
    <form
      noValidate
      className="grid grid-cols-1 items-start gap-3 md:grid-cols-[1fr_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Field label="Name" error={errors.name}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </Field>
      <Field label="Email" optional error={errors.email}>
        <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" spellCheck={false} />
      </Field>
      <GlassButton type="submit" icon={Save} disabled={!changed} loading={update.isPending} className="md:mt-[26px]">
        Save
      </GlassButton>
      {errors.form && (
        <p role="alert" className="text-sm text-danger md:col-span-3">
          {errors.form}
        </p>
      )}
    </form>
  )
}
