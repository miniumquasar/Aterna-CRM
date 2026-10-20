/**
 * Auth handlers: sign-in and sessions, password re-entry, invitations, your
 * own sign-in, people, the firm's details and the first-run wizard. Owned by
 * the auth domain; the rules live in src/main/auth/.
 *
 * The session is bound to the calling window; the renderer never sees it.
 * Registering also installs the session resolver (idle sign-out, access
 * turned off) and the background check for idle sessions.
 */
import type { SignOutInput } from '@shared/contracts/auth'
import type { Actor } from '@shared/domain/roles'
import { requireRole } from '../access/policy'
import { runtimeInfo } from '../app/runtime'
import { changeOwnPassword, confirmOwnPassword, getAccount, setOwnIdle } from '../auth/account'
import { firmView, saveFirm } from '../auth/firm'
import { acceptInvite, cancelInvite, checkInvite, createInvite, renewInvite } from '../auth/invites'
import { directory, listPeople, removalCheck, removePerson, resetPassword, setAccess, setIdlePolicy, setRole, unlockPerson, updatePerson } from '../auth/people'
import { grantReauth, requireRecentReauth } from '../auth/reauth'
import { authStatus, completePasswordChange, createFirstPartner, finishSetup, signIn } from '../auth/service'
import { finishSession, registerIdleJob, resolveSession, sessionInfo, touchSession, trackWindowSession } from '../auth/sessions'
import { recordSetupProgress, saveFirmDuringSetup, setupStatus } from '../auth/setup'
import type { Db } from '../db/connection'
import { setSessionResolver, type HandlerContext } from './context'
import { UserFacingError, isUserFacingError } from './errors'
import { handle } from './registry'

/** Binds a session that just began to the calling window, ending any other it had. */
function bindNewSession(ctx: HandlerContext, sessionId: string, now: Date): void {
  const previous = ctx.session.id
  if (previous && previous !== sessionId) finishSession(ctx.db, previous, 'signed_out', now)
  ctx.session.bind(sessionId)
  trackWindowSession(sessionId)
  // The password was typed just now, so protected actions are open for a few minutes.
  grantReauth(sessionId, now)
}

/** The calling window's session (signed-in channels always have one). */
function sessionOf(ctx: HandlerContext): string {
  const id = ctx.session.id
  if (!id) throw new UserFacingError('unauthenticated', 'Sign in to carry on.')
  return id
}

/** A wrong password that locked the account also signed the person out: tell the window. */
function signedOutIfLocked<T>(ctx: HandlerContext, run: () => T): T {
  try {
    return run()
  } catch (err) {
    if (isUserFacingError(err) && err.code === 'locked') {
      ctx.session.unbind()
      ctx.emit('session.ended', { reason: 'locked' })
    }
    throw err
  }
}

/** Development builds only: the first person who can sign in, to fill in the sign-in screen. */
function devFirstUser(db: Db): { username: string; name: string } | null {
  if (runtimeInfo().packaged) throw new UserFacingError('not_found', 'That isn’t available in this copy of AETERNA CRM.')
  const row = db
    .prepare("SELECT username, name FROM users WHERE active = 1 AND password_hash IS NOT NULL ORDER BY (role = 'partner') DESC, id LIMIT 1")
    .get() as { username: string; name: string } | undefined
  return row ?? null
}

const inviteKey = (ctx: HandlerContext): string => `window:${ctx.senderId}`

const partnerOnly = (actor: Actor | null): Actor => requireRole(actor, 'partner', 'manage people')

export function registerAuthHandlers(): void {
  setSessionResolver(resolveSession)
  registerIdleJob()

  // ── Signing in and out ────────────────────────────────────────────────────
  handle('auth.status', (_req, ctx) => authStatus(ctx.db, ctx.actor))

  handle('auth.signIn', (req, ctx) => {
    const now = ctx.now()
    const answer = signIn(ctx.db, req, now)
    if (answer.kind === 'passwordChange') return { ...authStatus(ctx.db, ctx.actor), passwordChange: answer.person }
    bindNewSession(ctx, answer.sessionId, now)
    return authStatus(ctx.db, answer.actor)
  })

  handle('auth.completePasswordChange', (req, ctx) => {
    const now = ctx.now()
    const { actor, sessionId } = completePasswordChange(ctx.db, req, now)
    bindNewSession(ctx, sessionId, now)
    return authStatus(ctx.db, actor)
  })

  handle('auth.signOut', (req, ctx) => {
    const id = ctx.session.id
    const reason = (req as SignOutInput | undefined)?.reason === 'idle' ? 'idle' : 'signed_out'
    if (id) {
      finishSession(ctx.db, id, reason, ctx.now())
      ctx.session.unbind()
    }
    return authStatus(ctx.db, null)
  })

  handle('auth.activity', (_req, ctx) => {
    const id = sessionOf(ctx)
    const now = ctx.now()
    touchSession(ctx.db, id, now)
    return sessionInfo(ctx.db, id, now)
  })

  handle('auth.session', (_req, ctx) => sessionInfo(ctx.db, sessionOf(ctx), ctx.now()))

  handle('auth.reauth', (req, ctx) => {
    const actor = ctx.requireActor()
    const id = sessionOf(ctx)
    const now = ctx.now()
    const password = req && typeof req === 'object' ? (req as { password?: unknown }).password : undefined
    signedOutIfLocked(ctx, () => confirmOwnPassword(ctx.db, actor, password, now, 'password', 'Wrong password when asked for it again'))
    touchSession(ctx.db, id, now)
    return { until: grantReauth(id, now).toISOString() }
  })

  // ── Invitations, accepted on this PC ──────────────────────────────────────
  handle('auth.checkInvite', (req, ctx) => checkInvite(ctx.db, req, inviteKey(ctx), ctx.now()))

  handle('auth.acceptInvite', (req, ctx) => {
    const now = ctx.now()
    const { actor, sessionId } = acceptInvite(ctx.db, req, inviteKey(ctx), now)
    bindNewSession(ctx, sessionId, now)
    return authStatus(ctx.db, actor)
  })

  handle('dev.firstUser', (_req, ctx) => devFirstUser(ctx.db))

  // ── Your sign-in ──────────────────────────────────────────────────────────
  handle('account.get', (_req, ctx) => getAccount(ctx.db, ctx.requireActor()))

  handle('account.changePassword', (req, ctx) => {
    const actor = ctx.requireActor()
    return signedOutIfLocked(ctx, () => changeOwnPassword(ctx.db, actor, ctx.session.id, req, ctx.now()))
  })

  handle('account.setIdle', (req, ctx) => setOwnIdle(ctx.db, ctx.requireActor(), req, ctx.now()))

  // ── People (partners) ─────────────────────────────────────────────────────
  handle('people.list', (_req, ctx) => listPeople(ctx.db, ctx.actor, ctx.now()))

  handle('people.directory', (_req, ctx) => {
    ctx.requireActor()
    return directory(ctx.db)
  })

  handle('people.invite', (req, ctx) => createInvite(ctx.db, ctx.actor, req, ctx.now()))

  handle('people.renewInvite', (req, ctx) => renewInvite(ctx.db, ctx.actor, req, ctx.now()))

  handle('people.cancelInvite', (req, ctx) => {
    cancelInvite(ctx.db, ctx.actor, req, ctx.now())
    return listPeople(ctx.db, ctx.actor, ctx.now())
  })

  handle('people.update', (req, ctx) => updatePerson(ctx.db, ctx.actor, req, ctx.now()))

  handle('people.setRole', (req, ctx) => setRole(ctx.db, ctx.actor, req, ctx.now()))

  handle('people.setAccess', (req, ctx) => setAccess(ctx.db, ctx.actor, req, ctx.now()))

  handle('people.unlock', (req, ctx) => unlockPerson(ctx.db, ctx.actor, req, ctx.now()))

  handle('people.resetPassword', (req, ctx) => {
    partnerOnly(ctx.actor)
    requireRecentReauth(ctx, 'set a temporary password')
    return resetPassword(ctx.db, ctx.actor, req, ctx.now())
  })

  handle('people.removalCheck', (req, ctx) => removalCheck(ctx.db, ctx.actor, req))

  handle('people.remove', (req, ctx) => {
    removePerson(ctx.db, ctx.actor, req, ctx.now())
    return listPeople(ctx.db, ctx.actor, ctx.now())
  })

  handle('people.setIdlePolicy', (req, ctx) => {
    setIdlePolicy(ctx.db, ctx.actor, req, ctx.now())
    return listPeople(ctx.db, ctx.actor, ctx.now())
  })

  // ── The firm's details ────────────────────────────────────────────────────
  handle('firm.get', (_req, ctx) => firmView(ctx.db, ctx.requireActor()))

  handle('firm.update', (req, ctx) => saveFirm(ctx.db, ctx.requireActor(), req, ctx.now()))

  // ── First-run setup ───────────────────────────────────────────────────────
  handle('setup.status', (_req, ctx) => setupStatus(ctx.db, ctx.actor))

  handle('setup.saveFirm', (req, ctx) => saveFirmDuringSetup(ctx.db, req, ctx.now()))

  handle('setup.createFirstPartner', (req, ctx) => {
    const now = ctx.now()
    const { actor, sessionId } = createFirstPartner(ctx.db, req, now)
    bindNewSession(ctx, sessionId, now)
    return authStatus(ctx.db, actor)
  })

  handle('setup.progress', (req, ctx) => recordSetupProgress(ctx.db, ctx.requireActor(), req))

  handle('setup.finish', (_req, ctx) => {
    finishSetup(ctx.db, ctx.actor, ctx.now())
    return authStatus(ctx.db, ctx.actor)
  })
}
