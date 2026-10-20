# Import engine & practice registers — integration notes

This bundle adds migration **0007_practice_registers** (16 new tables, a deadline worklist view, 4 new `clients` columns), a versioned migration runner, an adapter-based import engine with a dry-run report, IPC handlers, preload entries, and shared types. It builds on the Option A stabilisation bundle; apply that first.

Nothing in this bundle contains client data. The test suite runs against your real workbook only when you point it at the file.

## 1. Install

Run from the repository root, on a branch. Commands are one per line so they work in bash, cmd and PowerShell.

```
git switch -c feature/import-engine
tar -xzf crm-import.tar.gz --strip-components=1
git apply --check patches/01-types.patch patches/02-preload.patch patches/03-database.patch patches/04-audit-log.patch
git apply patches/01-types.patch patches/02-preload.patch patches/03-database.patch patches/04-audit-log.patch
npm install exceljs@^4.4.0
npm install -D vitest@^2.1.9 tsx@^4.23.15
npm pkg set "scripts.test=node scripts/electron-node.mjs node_modules/vitest/vitest.mjs run"
npm pkg set "scripts.import=node scripts/electron-node.mjs node_modules/tsx/dist/cli.mjs src/main/import/cli.ts"
```

If `git apply --check` fails, the target file differs from the version the patch was made against (Option A for types and preload; your uploaded copies for `database.ts` and `schema.ts`). Use `git apply --3way` or apply that hunk by hand; each patch is short.

The four patches:

| Patch | File | Change |
|---|---|---|
| 01-types | `src/shared/types.ts` | register/import domain types, `DeadlineWorklistQuery`, `DataIssueQuery`, `import` and `registers` namespaces on `IElectronAPI`, `auto_enrolment` service type. Additive only. |
| 02-preload | `src/preload/index.ts` | 17 bridge entries; the existing `satisfies IElectronAPI` guard checks every one. |
| 03-database | `src/main/database.ts` | calls `applyMigrationsSafely(db)` after `openWithRecovery()` and on the in-memory fallback. |
| 04-audit-log | `src/main/db/schema.ts` | `logAction()` writes to `audit_log` first; the Merkle append becomes an optional mirror, so `cleanup-phase9.sh` no longer silently stops auditing. |

### Register the handlers (manual — the file was not in the upload)

Your main-process entry (`src/main/index.ts`, where `registerClientHandlers()` is called) collided with the renderer's `index.ts` when the project was flattened, so I could not patch it. Add, next to the other registrations:

```ts
import { registerImportHandlers } from './ipc/import'
import { registerRegisterHandlers } from './ipc/registers'
// …alongside registerClientHandlers(), after initializeLedger():
registerImportHandlers()
registerRegisterHandlers()
```

### Why tests run under Electron

`postinstall` (`electron-builder install-app-deps`) compiles `better-sqlite3-multiple-ciphers` for Electron's ABI. Plain `node` then cannot open a database (`NODE_MODULE_VERSION` mismatch). `scripts/electron-node.mjs` runs Vitest and the CLI with `ELECTRON_RUN_AS_NODE=1`, against exactly the binary the app ships.

## 2. Verify

```
npm run typecheck
npm test
```

`npm test` runs 31 unit tests. The 32nd, the full-cycle integration test on the real workbook, runs only when you name the file:

```
# bash
CRM_TEST_WORKBOOK="/path/to/DYNAMIC_ACCOUNTANTS_Master_Client_Database_v2.xlsx" npm test
# PowerShell
$env:CRM_TEST_WORKBOOK = "C:\path\to\DYNAMIC_ACCOUNTANTS_Master_Client_Database_v2.xlsx"; npm test
```

On first start of the patched app the log shows `[migrate] applied: 0007_practice_registers`. On every later start, nothing.

## 3. Rehearse on a copy, then import for real

Find your database and key mode: open DevTools in the app (Ctrl+Shift+I) and run `await window.api.getSystemStatus()`. It returns `mode` and `path`.

| mode | `--key` to pass the CLI |
|---|---|
| `dev-only` | `dev-only-change-me` (see security finding 1) |
| `encrypted`, via `AETERNA_DB_KEY` | that passphrase, or set the env var |
| `encrypted`, via the legacy wrapped key in electron-store | the CLI cannot unwrap it; wait for the in-app import screen |

Close the app, copy the database file, and rehearse on the copy:

```
npm run import -- migrate  --db "C:\crm-test\aeterna-copy.db" --key "dev-only-change-me"
npm run import -- preview  --db "C:\crm-test\aeterna-copy.db" --key "dev-only-change-me" --file "C:\path\master.xlsx" --out report.md --json report.json
npm run import -- commit   --db "C:\crm-test\aeterna-copy.db" --key "dev-only-change-me" --file "C:\path\master.xlsx" --expect <fingerprint-from-report> --by "Arif"
npm run import -- batches  --db "C:\crm-test\aeterna-copy.db" --key "dev-only-change-me"
npm run import -- rollback --db "C:\crm-test\aeterna-copy.db" --key "dev-only-change-me" --batch 1 --by "Arif"
```

`report.md` and `report.json` contain client data. Keep them out of the repository.

For the real database: close the app, take a backup copy of the file, start the app once (it applies 0007 itself), close it, then run `preview` and `commit` against the real path. Preview and commit must run on the same calendar day, or pass the same `--today YYYY-MM-DD` to both; otherwise the fingerprints differ and the commit is refused. Never run the CLI while the app has the database open.

## 4. How it behaves

**Preview never writes.** The CLI asserts this by comparing `total_changes()` before and after.

**Commit writes exactly what was previewed.** It re-reads the file, re-plans inside one transaction, and refuses unless the plan's SHA-256 fingerprint equals the one you reviewed. A changed file, a changed database, or a different practice date all cause a refusal.

**Re-import is a three-way merge** against the snapshot the previous import stored:

| CRM since last import | Source since last import | Result |
|---|---|---|
| untouched | changed | source value written |
| edited | unchanged | CRM value kept, silently |
| edited | changed | CRM value kept, conflict reported |

A CRM record matched for the first time — by company number, then UTR, then exact unique name — only has its blank fields filled. Imports never overwrite data someone typed into the CRM.

**Rollback** undoes the most recent committed batch only, newest change first. It refuses, naming each row and column, if anything the batch wrote was edited afterwards, or if a client it created has since acquired tasks, payments or other rows. `--force` overrides this and is recorded in the audit log. The `import_changes` journal is append-only, enforced by triggers.

**Audit:** commit and rollback each write an `audit_log` row inside their own transaction.

## 5. What goes where (master workbook v2)

- **Clients:** `CLIENT_ID` becomes `clients.ref` for new clients and `REF_CODE` goes to `legacy_ref`. Matched existing clients keep their ref.
- **Statutory dates:** source due dates win; the statutory rule date is stored alongside with its basis. Disagreements raise a data issue only for obligations where the rule is authoritative (CT600, CT payment, VAT, SA, P11D, AE).
- **Worklist:** mirrors the workbook's own `Deadline_Calendar`. Register rows the calendar left off are archived as history.
- **CT payments:** a new obligation. Future ones are live work. Past ones are archived with status `unknown`, because the workbook never tracked payments.
- **SA_Returns (2013-14 to 2017-18):** go to `compliance_periods`, archived. They do not go to `hmrc_submissions`, which models submissions made through the app.
- **Auto-enrolment re-declarations:** computed from the duties start date on TPR's rule. This assumes every earlier re-enrolment used the anniversary date, and each row says so.
- **Never imported:** plain-text passwords. Unattributed e-mail addresses are excluded as data minimisation.
- **Held back until the database is keyed with a real passphrase:** CH authentication codes, director personal codes, gateway user IDs. The app decides this from the ledger mode; the renderer cannot override it.

## 6. Using it from the renderer

`IpcResult` methods are meant for `safeInvoke`. Its default 5-second timeout is too short for a workbook preview, so pass a longer one:

```ts
const file = await safeInvoke(() => window.api.import.chooseFile(), 'import:choose-file', 300_000)
if (file) {
  const preview = await safeInvoke(() => window.api.import.preview(file.token), 'import:preview', 120_000)
  // show preview.report; on confirm (partner only):
  await safeInvoke(() => window.api.import.commit(file.token, preview.fingerprint), 'import:commit', 120_000)
}
const overdue = await window.api.registers.getWorklist({ withinDays: 0 })
```

**Roles:** preview needs partner or manager; commit and rollback need partner. Register reads need a signed-in user. Staff see only clients assigned to them, including in the worklist, the issue register and related-client names.

## 7. Adding another data source

Implement `ImportAdapter` (`src/main/import/core/canonical.ts`) in a new file under `src/main/import/adapters/`, then add it to `ADAPTERS` in `adapters/index.ts`:

- **`detect(file)`** returns a confidence from 0 to 1.
- **`extract(file, ctx)`** returns a `CanonicalBundle`. Normalise and validate with `core/normalise.ts`. Emit problems as findings rather than guessing. Never emit calculated due dates; the projector applies the rules.

Matching, merge, fingerprinting, journalling, rollback, the report and the IPC flow are all shared, so a CSV export, an accounting-package API or Companies House data is one file plus tests. A new kind of data (say, time records) needs a canonical type, a projector section and a migration.

## 8. Removing this change

Migration 0007 is additive: new tables, plus four nullable columns on `clients`. To back out, restore your pre-import database backup and revert the branch. If you revert the code but keep the database, the extra tables and columns are inert; the existing code never reads them.

## 9. Caveats — what was and was not verified

**Verified** (sandbox: Linux x64, Electron 41.10.7 in Node mode, plus Node 22):
- 0007 applies to a database built from your uploaded `database.ts` schema, and is idempotent.
- The full preview, commit, idempotent re-preview, guarded rollback and clean rollback cycle works on the real workbook.
- 32/32 tests pass under both runtimes.
- Strict typecheck passes under your `tsconfig.node.json` settings.
- All four patches apply cleanly to the uploaded / Option A files.

**Not verified:**
- `src/main/ipc/import.ts` and `registers.ts` were typechecked against stand-in signatures, because `src/main/ipc/auth.ts` was not in the upload. They assume `requireRole(roles[])` throws when unauthorised and `getCurrentUser()` returns `{ id, name, role } | null`, as your other handlers use them. Handler registration in `src/main/index.ts` is manual.
- No renderer screen exists yet.
- Windows and macOS builds were not exercised.
- `typecheck:web` was not run; the renderer could not be reconstructed from the flattened upload. Of the renderer files that use `ServiceType`, neither maps it exhaustively.

**Data caveats:**
- Confirmation statement "last made up to" dates in the workbook are stale (42 of 167 agree with the statutory rule), so CS due dates come from the source.
- The AE anniversary assumption above applies.

## 10. Security findings (not fixed by this bundle)

1. **Fresh installs are effectively unencrypted.** With no `AETERNA_DB_KEY` and no legacy wrapped key, `database.ts` keys SQLCipher with the public string `dev-only-change-me` (mode `dev-only`). `initializeEncryption()` in `schema.ts`, which generated a wrapped key, is never called. This is why sensitive identifiers are held back.
2. **A wrong key or a migration error silently empties the app.** `openWithRecovery()` treats any exception as corruption, renames the database aside and starts a new empty one. This is why 0007 runs outside it and never throws.
3. **`clients:get` has no staff scoping,** and `clients:get-all` returns every client when no user is signed in.
4. Carried forward from the gap analysis:
   - The deadline scheduler never alerts on overdue items and ignores `next_sa_due`.
   - The onboarding gap check applies company-only fields to individuals.
