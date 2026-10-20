/**
 * Settings → People (partners): everyone who can sign in, with their role
 * and how their sign-in stands; invitations waiting; and how the practice
 * signs people out. Open a person to change their role, turn their access
 * off or on, unlock them, set a temporary password or remove them. Owned by
 * the auth domain.
 */
import { useState } from 'react'
import { CalendarClock, LockKeyhole, RefreshCw, Timer, UserPlus, Users, X } from 'lucide-react'
import { IDLE_CHOICES, SELF_UNLOCK_MINUTES, idleLabel, type InviteCreated, type PendingInvite, type Person } from '@shared/contracts/auth'
import { instantToLondonDate } from '@shared/domain/dates'
import { Avatar, EmptyState, Field, GlassBadge, GlassButton, GlassTable, Loading, LoadProblem, Select, toast, useConfirm, type Column } from '@renderer/components/ui'
import { useApiMutation, useApiQuery } from '@renderer/lib/api'
import { formatDate, formatDateTime, formatRelative, plural } from '@renderer/lib/format'
import { InviteCodeDialog, InviteDialog } from '@renderer/screens/auth/people/InviteDialog'
import { PersonBadges, RoleBadge } from '@renderer/screens/auth/people/people-ui'
import { PersonDialog } from '@renderer/screens/auth/people/PersonDialog'
import { useAuthStatus } from '@renderer/stores/session'

const ROLE_ORDER = { partner: 0, manager: 1, staff: 2 } as const

const COLUMNS: readonly Column<Person>[] = [
  {
    id: 'name',
    header: 'Person',
    sortValue: (p) => p.name,
    cell: (p) => (
      <span className="flex min-w-0 items-center gap-3">
        <Avatar name={p.name} size="sm" decorative />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium text-fg">{p.name}</span>
            {p.isYou && (
              <GlassBadge tone="accent" size="sm">
                You
              </GlassBadge>
            )}
          </span>
          <span className="block truncate text-xs text-fg-subtle">{p.username}</span>
        </span>
      </span>
    )
  },
  { id: 'role', header: 'Role', sortValue: (p) => ROLE_ORDER[p.role], cell: (p) => <RoleBadge role={p.role} />, width: '8rem' },
  { id: 'status', header: 'Sign-in', cell: (p) => <PersonBadges person={p} /> },
  {
    id: 'clients',
    header: 'Clients',
    align: 'end',
    hideBelow: 'lg',
    width: '6rem',
    sortValue: (p) => p.clients.assigned,
    cell: (p) => (p.clients.assigned ? p.clients.assigned.toLocaleString('en-GB') : <span className="text-fg-subtle">None</span>)
  },
  {
    id: 'last',
    header: 'Last signed in',
    hideBelow: 'md',
    width: '10rem',
    sortValue: (p) => p.lastSignInAt ?? '',
    cell: (p) => (p.lastSignInAt ? <span title={formatDateTime(p.lastSignInAt)}>{formatRelative(p.lastSignInAt)}</span> : <span className="text-fg-subtle">Not yet</span>)
  }
]

const IDLE_OPTIONS = IDLE_CHOICES.map((m) => ({ value: String(m), label: idleLabel(m) }))

export default function PeopleSection(): JSX.Element {
  const people = useApiQuery('people.list', undefined)
  const firmName = useAuthStatus().data?.firmName ?? null
  const [openId, setOpenId] = useState<number | null>(null)
  const [inviting, setInviting] = useState(false)
  const [renewed, setRenewed] = useState<InviteCreated | null>(null)

  if (people.isPending) return <Loading label="Loading people…" />
  if (people.isError) return <LoadProblem title="People couldn’t be loaded" error={people.error} onRetry={() => void people.refetch()} retrying={people.isFetching} />

  const { people: everyone, invites, idle, lockAfter } = people.data
  const open = everyone.find((p) => p.id === openId) ?? null
  const signedIn = everyone.filter((p) => p.signedIn).length
  const locked = everyone.filter((p) => p.locked)

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="people-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 id="people-heading" className="sr-only">
            Everyone who can sign in
          </h3>
          <p className="text-sm text-fg-muted">
            <span className="font-medium text-fg">{plural(everyone.length, 'person', 'people')}</span>
            {signedIn ? ` · ${signedIn} signed in now` : ''}
            {invites.length ? ` · ${plural(invites.length, 'invitation')} waiting` : ''}
          </p>
          <GlassButton variant="primary" icon={UserPlus} onClick={() => setInviting(true)} data-testid="people-invite">
            Invite someone
          </GlassButton>
        </div>
        {locked.length > 0 && (
          <p role="status" className="mb-3 flex items-center gap-2 rounded-xl bg-warning/10 px-3 py-2 text-[13px] text-fg">
            <LockKeyhole size={15} aria-hidden className="shrink-0 text-warning" />
            {locked.length === 1 ? `${locked[0].name}’s account is locked.` : `${locked.length} accounts are locked.`} Open {locked.length === 1 ? 'it' : 'one'} to unlock.
          </p>
        )}
        <GlassTable
          caption="People"
          columns={COLUMNS}
          rows={everyone}
          rowKey={(p) => p.id}
          onRowClick={(p) => setOpenId(p.id)}
          rowLabel={(p) => `Open ${p.name}`}
          initialSort={null}
        />
        {everyone.length === 1 && (
          <div className="mt-4">
            <EmptyState
              size="sm"
              icon={Users}
              title="It’s just you so far"
              body="Invite the rest of the practice. Each person gets a code to set up their own username and password on this PC."
              action={
                <GlassButton icon={UserPlus} onClick={() => setInviting(true)}>
                  Invite someone
                </GlassButton>
              }
            />
          </div>
        )}
      </section>

      {invites.length > 0 && <Invitations invites={invites} onRenewed={setRenewed} />}

      <IdlePolicy practiceMinutes={idle.practiceMinutes} lockAfter={lockAfter} />

      <PersonDialog person={open} onClose={() => setOpenId(null)} lockAfter={lockAfter} />
      <InviteDialog open={inviting} onClose={() => setInviting(false)} firmName={firmName} />
      <InviteCodeDialog created={renewed} firmName={firmName} onClose={() => setRenewed(null)} />
    </div>
  )
}

function Invitations({ invites, onRenewed }: { invites: PendingInvite[]; onRenewed: (created: InviteCreated) => void }): JSX.Element {
  const confirm = useConfirm()
  const renew = useApiMutation('people.renewInvite', {
    invalidates: ['people.list'],
    onSuccess: (data) => onRenewed(data),
    onError: (err) => void toast.error('A new code couldn’t be made', { description: err.message })
  })
  const cancel = useApiMutation('people.cancelInvite', {
    invalidates: ['people.list'],
    onSuccess: () => void toast.success('Invitation cancelled'),
    onError: (err) => void toast.error('The invitation couldn’t be cancelled', { description: err.message })
  })
  return (
    <section aria-labelledby="invites-heading">
      <h3 id="invites-heading" className="font-display text-[15px] font-semibold text-fg">
        Invitations waiting
      </h3>
      <p className="mb-3 text-[13px] text-fg-muted">Each code works once. If one is lost, make a new code; the old one stops working.</p>
      <ul className="glass divide-y divide-line/10 rounded-2xl">
        {invites.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={inv.name} size="sm" decorative />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-fg">{inv.name}</span>
                <RoleBadge role={inv.role} />
                {inv.expired ? (
                  <GlassBadge tone="warning" size="sm" icon={CalendarClock}>
                    Expired {formatDate(instantToLondonDate(inv.expiresAt))}
                  </GlassBadge>
                ) : (
                  <GlassBadge tone="neutral" size="sm" icon={CalendarClock}>
                    Until {formatDate(instantToLondonDate(inv.expiresAt))}
                  </GlassBadge>
                )}
              </p>
              <p className="truncate text-xs text-fg-subtle">
                {[inv.email, inv.invitedBy ? `invited by ${inv.invitedBy}` : null, `on ${formatDate(instantToLondonDate(inv.createdAt))}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex gap-1.5">
              <GlassButton size="sm" icon={RefreshCw} loading={renew.isPending && renew.variables?.id === inv.id} onClick={() => renew.mutate({ id: inv.id })} aria-label={`Make a new code for ${inv.name}`}>
                New code
              </GlassButton>
              <GlassButton
                size="sm"
                variant="ghost"
                icon={X}
                aria-label={`Cancel ${inv.name}’s invitation`}
                onClick={async () => {
                  const ok = await confirm({
                    title: `Cancel ${inv.name}’s invitation?`,
                    body: 'The code stops working. You can invite them again at any time.',
                    confirmLabel: 'Cancel invitation',
                    cancelLabel: 'Keep it',
                    tone: 'danger'
                  })
                  if (ok) cancel.mutate({ id: inv.id })
                }}
              >
                Cancel
              </GlassButton>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function IdlePolicy({ practiceMinutes, lockAfter }: { practiceMinutes: number; lockAfter: number }): JSX.Element {
  const save = useApiMutation('people.setIdlePolicy', {
    invalidates: ['people.list', 'auth.session', 'account.get'],
    onSuccess: (data) => void toast.success(`Everyone is now signed out after ${idleLabel(data.idle.practiceMinutes)} without use`),
    onError: (err) => void toast.error('That didn’t change', { description: err.message })
  })
  return (
    <section aria-labelledby="signing-in-heading">
      <h3 id="signing-in-heading" className="mb-3 font-display text-[15px] font-semibold text-fg">
        Keeping sign-ins safe
      </h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="glass-sunken flex flex-col gap-3 rounded-2xl p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-fg">
            <Timer size={16} aria-hidden className="text-accent-text" />
            Signing out when nobody is using it
          </p>
          <Field label="Sign everyone out after" hint="With a minute’s warning first. People can choose a shorter time for themselves in Your sign-in.">
            <Select value={String(practiceMinutes)} onChange={(v) => save.mutate({ minutes: Number(v) })} options={IDLE_OPTIONS} disabled={save.isPending} />
          </Field>
        </div>
        <div className="glass-sunken flex flex-col gap-2 rounded-2xl p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-fg">
            <LockKeyhole size={16} aria-hidden className="text-accent-text" />
            Wrong passwords
          </p>
          <p className="text-[13px] text-fg-muted">
            After {lockAfter} wrong passwords in a row, an account locks until a partner unlocks it here. If the only partner is locked out, the lock lifts by itself after {SELF_UNLOCK_MINUTES} minutes.
          </p>
          <p className="text-[13px] text-fg-muted">Someone who has forgotten their password gets a temporary one from a partner, and chooses their own when they sign in.</p>
        </div>
      </div>
    </section>
  )
}
