/**
 * First-run setup: what a new practice does once, in this order —
 *
 *   firm       the firm's name and contact details
 *   partner    the first partner's account (who can then sign in)
 *   recovery   the encryption key's recovery sheet, saved or printed
 *   vault      the vault passphrase, with its one chance to print
 *   licence    the free trial, or a licence key
 *   import     the master workbook
 *
 * Whether a step is done is read from the practice's own records wherever it
 * can be (a firm name saved, a partner who can sign in, the sheet saved for
 * this key, the vault set up, a licence entered, clients brought in), so the
 * wizard carries on where it stopped after a restart. Only choices that leave
 * no other trace — leaving a step for later, seeing the licence step, and
 * finishing — are kept, as app_settings rows named setup.*.
 *
 * A practice that was set up before the wizard existed is marked finished by
 * migration 0017, so the wizard never appears for it.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { SetupStatus, SetupStepKey, SetupStepState } from '../../shared/types'
import { writeAudit } from '../access/audit'
import { requirePartner, UserFacingError, type Actor } from '../access/policy'
import { firmDetails } from '../records/firm'

export const SETUP_STEPS: readonly SetupStepKey[] = ['firm', 'partner', 'recovery', 'vault', 'licence', 'import']

/** Steps a partner can mark as done or leave for later in the wizard. */
export const MARKABLE_STEPS: readonly SetupStepKey[] = ['recovery', 'vault', 'licence', 'import']

export const COMPLETED_SETTING = 'setup.completed_at'
const stepSetting = (step: SetupStepKey): string => `setup.${step}`

/** What the service needs to know from outside the database. */
export interface SetupProbe {
  /** Whether the recovery sheet has been saved for the current key; null when this installation has no sheet to make. */
  recoverySheetDone: () => boolean | null
  /** Whether the vault has been set up. */
  vaultSetUp: () => boolean
  /** Whether a licence key (not just the trial) is in place. */
  licensed: () => boolean
}

function setting(db: Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

function setSetting(db: Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value)
}

const tableExists = (db: Database, name: string): boolean =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)

/** Nobody can sign in yet: a new installation. */
export function isFirstRun(db: Database): boolean {
  return !db.prepare('SELECT 1 FROM users WHERE password_hash IS NOT NULL AND active = 1 LIMIT 1').get()
}

function clientsBroughtIn(db: Database): boolean {
  if (db.prepare('SELECT 1 FROM clients LIMIT 1').get()) return true
  return tableExists(db, 'import_batches') && !!db.prepare("SELECT 1 FROM import_batches WHERE status = 'committed' LIMIT 1").get()
}

export function setupStatus(db: Database, probe: SetupProbe): SetupStatus {
  const marked = (step: SetupStepKey): string | null => setting(db, stepSetting(step))
  const state = (done: boolean, step: SetupStepKey): SetupStepState => (done ? 'done' : marked(step) === 'skipped' ? 'skipped' : 'todo')
  const notes: SetupStatus['notes'] = {}

  const recovery = probe.recoverySheetDone()
  if (recovery === null) notes.recovery = 'This installation uses an encryption key set outside the app, so there is no recovery sheet to make here.'

  const firm = firmDetails(db)
  const states: Record<SetupStepKey, SetupStepState> = {
    firm: firm?.name?.trim() ? 'done' : 'todo',
    partner: isFirstRun(db) ? 'todo' : 'done',
    recovery: recovery === null ? 'done' : state(recovery, 'recovery'),
    vault: state(probe.vaultSetUp(), 'vault'),
    licence: state(probe.licensed() || marked('licence') === 'done', 'licence'),
    import: state(clientsBroughtIn(db), 'import')
  }
  const steps = SETUP_STEPS.map((key) => ({ key, state: states[key] }))
  return {
    complete: setting(db, COMPLETED_SETTING) !== null,
    firstRun: states.partner === 'todo',
    steps,
    next: steps.find((s) => s.state === 'todo')?.key ?? null,
    notes,
    firm: firm
      ? {
          name: firm.name ?? '',
          registration_number: firm.registration_number,
          address_line1: firm.address_line1,
          address_line2: firm.address_line2,
          city: firm.city,
          postcode: firm.postcode,
          country: firm.country,
          email: firm.email,
          phone: firm.phone
        }
      : null
  }
}

/** A partner marks a step done or leaves it for later. */
export function markStep(db: Database, actor: Actor, step: unknown, state: unknown): void {
  requirePartner(actor, 'set up the practice')
  if (typeof step !== 'string' || !(MARKABLE_STEPS as readonly string[]).includes(step)) throw new UserFacingError('That isn’t a setup step.')
  if (state !== 'done' && state !== 'skipped') throw new UserFacingError('A step is either done or left for later.')
  if (state === 'done' && step !== 'licence') throw new UserFacingError('That step is done when its work is done.')
  const key = stepSetting(step as SetupStepKey)
  db.transaction(() => {
    const before = setting(db, key)
    if (before === state) return
    setSetting(db, key, state)
    writeAudit(db, actor, state === 'skipped' ? 'Left a setup step for later' : 'Finished a setup step', 'app_settings', key, before === null ? null : { [key]: before }, { [key]: state })
  })()
}

/**
 * Finishes setup. The firm's name and a partner are needed; any other step
 * not yet done is recorded as left for later, so the record says exactly what
 * was and wasn't done at the time.
 */
export function finishSetup(db: Database, actor: Actor, probe: SetupProbe): SetupStatus {
  requirePartner(actor, 'finish setting up the practice')
  const now = setupStatus(db, probe)
  if (now.complete) return now
  const missing = now.steps.filter((s) => (s.key === 'firm' || s.key === 'partner') && s.state !== 'done')
  if (missing.length) throw new UserFacingError('Enter the firm’s name before finishing.')
  db.transaction(() => {
    for (const s of now.steps) {
      if (s.state === 'todo' && (MARKABLE_STEPS as readonly string[]).includes(s.key)) setSetting(db, stepSetting(s.key), 'skipped')
    }
    setSetting(db, COMPLETED_SETTING, new Date().toISOString())
    writeAudit(db, actor, 'Finished setting up the practice', 'app_settings', COMPLETED_SETTING, null, {
      steps: Object.fromEntries(now.steps.map((s) => [s.key, s.state === 'todo' ? 'left for later' : s.state === 'skipped' ? 'left for later' : 'done']))
    })
  })()
  return setupStatus(db, probe)
}
