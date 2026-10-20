/**
 * The first-run wizard, in this order: firm details, first partner, recovery
 * sheet, vault passphrase, trial or licence, workbook import, then ready.
 * The rules for each step's state are in setup-state.ts.
 *
 * Before anyone can sign in (a new installation), three things are open
 * without a session: reading the wizard's state, saving the firm's details,
 * and creating the first partner. After that, the wizard is a partner's.
 */
import { SETUP_STEP_IDS, type SetupStatus, type SetupStepId } from '@shared/contracts/auth'
import { roleAtLeast, type Actor } from '@shared/domain/roles'
import type { Db } from '../db/connection'
import { UserFacingError, invalid } from '../ipc/errors'
import { record } from '../ipc/input'
import { readFirm, saveFirm } from './firm'
import { hasUsers, setupComplete } from './service'
import { recordSetupPosition, setupProgressStates, setupResumeAt } from './setup-state'

export function setupStatus(db: Db, actor: Actor | null): SetupStatus {
  const firstRun = !hasUsers(db)
  if (!firstRun) {
    if (!actor) throw new UserFacingError('unauthenticated', 'Sign in to carry on setting up the practice.')
    if (!roleAtLeast(actor.role, 'partner')) throw new UserFacingError('forbidden', 'Only a partner can set up the practice.')
  }
  return {
    complete: !firstRun && setupComplete(db),
    firstRun,
    firm: readFirm(db),
    resumeAt: setupResumeAt(db),
    steps: setupProgressStates(db)
  }
}

/** The wizard's first step, before anyone can sign in. */
export function saveFirmDuringSetup(db: Db, input: unknown, now: Date = new Date()): SetupStatus {
  if (hasUsers(db)) {
    throw new UserFacingError('conflict', 'The practice is already set up. A partner or manager changes its details in Settings → Firm details.')
  }
  saveFirm(db, null, input, now)
  return setupStatus(db, null)
}

/** Records where the wizard is (a partner, once the first partner exists). */
export function recordSetupProgress(db: Db, actor: Actor | null, input: unknown): SetupStatus {
  const body = record(input)
  const at = body.at
  if (typeof at !== 'string' || !(SETUP_STEP_IDS as readonly string[]).includes(at)) throw invalid('That isn’t a setup step.', 'at')
  const step = at as SetupStepId
  if (step === 'firm' || step === 'partner') throw invalid('Those steps are done once the partner exists.', 'at')
  const status = setupStatus(db, actor)
  if (!status.complete) recordSetupPosition(db, step, actor?.id ?? null)
  return setupStatus(db, actor)
}
