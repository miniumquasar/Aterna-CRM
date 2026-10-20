/**
 * Auth handlers: status, sign-in and sign-out, and the first-run setup's
 * first partner. Owned by the auth domain. The session is bound to the
 * calling window; the renderer never sees it.
 */
import { authStatus, createFirstPartner, finishSetup, signIn } from '../auth/service'
import { endSession } from './context'
import { handle } from './registry'

export function registerAuthHandlers(): void {
  handle('auth.status', (_req, ctx) => authStatus(ctx.db, ctx.actor))

  handle('auth.signIn', (req, ctx) => {
    const previous = ctx.session.id
    const { actor, sessionId } = signIn(ctx.db, req, ctx.now())
    if (previous) endSession(ctx.db, previous, 'signed_out', ctx.now())
    ctx.session.bind(sessionId)
    return authStatus(ctx.db, actor)
  })

  handle('auth.signOut', (_req, ctx) => {
    const id = ctx.session.id
    if (id) {
      endSession(ctx.db, id, 'signed_out', ctx.now())
      ctx.session.unbind()
    }
    return authStatus(ctx.db, null)
  })

  handle('setup.createFirstPartner', (req, ctx) => {
    const { actor, sessionId } = createFirstPartner(ctx.db, req, ctx.now())
    ctx.session.bind(sessionId)
    return authStatus(ctx.db, actor)
  })

  handle('setup.finish', (_req, ctx) => {
    finishSetup(ctx.db, ctx.actor, ctx.now())
    return authStatus(ctx.db, ctx.actor)
  })
}
