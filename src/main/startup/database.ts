/**
 * Start-up step 3's first half: the database key and the open database, with
 * the backup domain's hooks (src/main/backup/startup.ts) in their places —
 *
 *   1. applyPendingRestore: a restore staged by the last run is swapped in;
 *   2. the key file is read (or made, for a new installation);
 *   3. the database is opened (probe, integrity check, set-aside rules);
 *
 * and, when the key file is missing or damaged or its key doesn't open the
 * database, recoverDatabaseKey may supply the key from the recovery sheet.
 * Without it, start-up stops with the original explanation. Nothing here
 * ever overwrites a key file or changes a database it can't open.
 */
import type { Logger } from '../app/logger'
import type { DataPaths } from '../app/paths'
import type { BackupStartup, KeyRecovery } from '../backup/startup'
import { DatabaseOpenError, openDatabase, type OpenedDatabase } from '../db/connection'
import { KeyFileError, isDatabaseKey, loadOrCreateDatabaseKey } from '../db/key-file'

export interface DatabaseStartupDeps {
  applyPendingRestore: (ctx: BackupStartup) => void | Promise<void>
  recoverDatabaseKey: (ctx: KeyRecovery) => Promise<string | null>
  window: KeyRecovery['window']
  log: Logger
  now: () => Date
  /** A line for the start-up log. */
  line: (message: string) => void
}

export interface StartedDatabase extends OpenedDatabase {
  key: string
  /** How the key was had. */
  keySource: 'created' | 'key_file' | 'recovery_sheet'
}

export async function openPracticeDatabase(paths: DataPaths, deps: DatabaseStartupDeps): Promise<StartedDatabase> {
  const base: BackupStartup = { paths, log: deps.log.child('backup'), now: deps.now() }
  await deps.applyPendingRestore(base)

  const recover = async (problem: KeyRecovery['problem'], err: Error): Promise<string> => {
    deps.line(`database key problem (${problem}): offering the recovery sheet`)
    const key = await deps.recoverDatabaseKey({ ...base, problem, message: err.message, window: deps.window })
    if (key === null) throw err
    if (!isDatabaseKey(key)) throw new KeyFileError('unreadable', 'The key from the recovery sheet isn’t in the expected form (64 hexadecimal characters).', { cause: err })
    deps.line('database key supplied from the recovery sheet')
    return key
  }

  let key: string
  let keySource: StartedDatabase['keySource']
  try {
    const loaded = loadOrCreateDatabaseKey({ keyFile: paths.keyFile, databaseFile: paths.database })
    key = loaded.key
    keySource = loaded.created ? 'created' : 'key_file'
    deps.line(loaded.created ? 'database key created for this installation' : 'database key read')
  } catch (err) {
    if (!(err instanceof KeyFileError) || err.reason === 'exists') throw err
    key = await recover(err.reason === 'missing' ? 'missing_key' : 'unreadable_key', err)
    keySource = 'recovery_sheet'
  }

  const open = (k: string): OpenedDatabase => openDatabase({ file: paths.database, key: k, log: deps.log.child('database'), now: deps.now })
  try {
    return { ...open(key), key, keySource }
  } catch (err) {
    if (!(err instanceof DatabaseOpenError) || err.reason !== 'wrong_key' || keySource === 'recovery_sheet') throw err
    const recovered = await recover('wrong_key', err)
    return { ...open(recovered), key: recovered, keySource: 'recovery_sheet' }
  }
}
