/**
 * Where the first-run wizard has got to, read from the practice's own
 * records wherever possible, so it carries on where it stopped after a
 * restart:
 *
 *   firm       done once the firm's name is saved
 *   partner    done once someone can sign in
 *   recovery, vault, licence, import
 *              done when the domain that owns the step says so through a
 *              probe it registers (registerSetupProbe); without one, the
 *              wizard only knows whether it has moved past the step
 *   done       the end
 *
 * The wizard's own position is kept in settings (setup / position and the
 * furthest step reached, setup / reached), because moving past a step
 * leaves no other trace.
 */
import { SETUP_STEP_IDS, type ProbedSetupStep, type SetupStepId, type SetupStepState } from '@shared/contracts/auth'
import type { Db } from '../db/connection'
import { getSetting, setSetting } from '../db/settings'

/**
 * Whether a step's work is done: true, false, or null when the step doesn't
 * apply to this installation (it then counts as done).
 */
export type SetupProbe = (db: Db) => boolean | null

const probes = new Map<ProbedSetupStep, SetupProbe>()

/**
 * For the domains that fill a wizard step: tells the wizard whether the
 * step's work is done, so the summary and the resume point are right.
 * Call it from your registerXxxHandlers(); registering again replaces it.
 *
 *   registerSetupProbe('licence', (db) => licenceEntered(db))
 */
export function registerSetupProbe(step: ProbedSetupStep, probe: SetupProbe): void {
  probes.set(step, probe)
}

/** Forgets every probe (tests). */
export function clearSetupProbes(): void {
  probes.clear()
}

const index = (step: SetupStepId): number => SETUP_STEP_IDS.indexOf(step)

function storedStep(db: Db, key: 'position' | 'reached'): SetupStepId | null {
  const value = getSetting<unknown>(db, 'setup', key)
  return typeof value === 'string' && (SETUP_STEP_IDS as readonly string[]).includes(value) ? (value as SetupStepId) : null
}

/** Records the step the wizard shows now (and the furthest reached). */
export function recordSetupPosition(db: Db, at: SetupStepId, userId: number | null): void {
  setSetting(db, 'setup', 'position', at, userId)
  const reached = storedStep(db, 'reached')
  if (!reached || index(at) > index(reached)) setSetting(db, 'setup', 'reached', at, userId)
}

function firmSaved(db: Db): boolean {
  const row = db.prepare('SELECT name FROM firm WHERE id = 1').get() as { name: string } | undefined
  return !!row?.name?.trim()
}

function someoneCanSignIn(db: Db): boolean {
  return !!db.prepare('SELECT 1 FROM users WHERE password_hash IS NOT NULL AND active = 1 LIMIT 1').get()
}

function probe(db: Db, step: ProbedSetupStep): boolean | undefined {
  const p = probes.get(step)
  if (!p) return undefined
  const done = p(db)
  return done === null ? true : done
}

/** Each step's state, in order. */
export function setupProgressStates(db: Db): Array<{ id: SetupStepId; state: SetupStepState }> {
  const reached = storedStep(db, 'reached')
  const reachedAt = reached ? index(reached) : -1
  return SETUP_STEP_IDS.map((id) => {
    if (id === 'firm') return { id, state: firmSaved(db) ? 'done' : 'todo' }
    if (id === 'partner') return { id, state: someoneCanSignIn(db) ? 'done' : 'todo' }
    if (id === 'done') return { id, state: 'todo' }
    const passed = index(id) < reachedAt
    const done = probe(db, id)
    const state: SetupStepState = done === true ? 'done' : passed ? (done === false ? 'skipped' : 'passed') : 'todo'
    return { id, state }
  })
}

/**
 * Where the wizard carries on: the firm or the partner while nobody can sign
 * in, then the step it was last showing (the step after the partner if it
 * has shown none since).
 */
export function setupResumeAt(db: Db): SetupStepId {
  if (!someoneCanSignIn(db)) return firmSaved(db) ? 'partner' : 'firm'
  const position = storedStep(db, 'position')
  if (!position || index(position) <= index('partner')) return 'recovery'
  return position
}
