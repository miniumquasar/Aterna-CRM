# Building a domain: practical notes

Read `ARCHITECTURE.md` and your section of `DOMAINS.md` first. These notes cover the details
the foundation settled while it was being built.

## Setting up a worktree

- Link the main checkout's packages instead of installing again:
  `ln -s /home/user/aterna-crm/node_modules node_modules`. If something fails to resolve
  through the link, run `npm ci` instead (postinstall rebuilds the native SQLite module for
  Electron).
- `npm test` runs vitest under Electron's own Node (`scripts/electron-node.mjs`).
- For the smoke test: `npx electron-vite build`, then `npm run smoke` (xvfb is used when there
  is no display). Never run `playwright install`.

## Handlers and contracts

- Declare each channel in `src/shared/contracts/<domain>.ts` with `kind: 'read' | 'write'`, plus
  `auth: 'public'` or `allowWhenReadOnly: true` where they apply. The contract test fails until
  every declared channel has a handler.
- In `src/main/ipc/<domain>.ts`, call `handle('area.verb', (req, ctx) => ...)`. `ctx` gives `db`,
  `actor`, `requireActor()`, `now()`, `emit(event, payload)`, `session` and `log`.
- Validate requests with the helpers in `src/main/ipc/input.ts` (`record`, `requiredText`,
  `optionalDate`, `optionalPence`, `oneOf`, `requiredId`…). For anything a person can fix, throw
  `new UserFacingError(code, 'Plain sentence.', field)`. Any other error becomes `internal`, is
  logged and is never shown.
- Every write calls `recordChange(db, ctx.actor, { action, entity, entityId, clientId, summary, before, after })`
  from `src/main/access/audit.ts` inside the same `db.transaction`. `createTestIpc(db)` fails a
  call when a write channel changes rows without it. Mark a channel `audited: false` only for
  writes like sessions or this PC's preferences. Fields named like password, token or secret are
  never stored; `*_enc` values are stored as a fingerprint; NI numbers, authentication codes,
  recovery words and backup codes are recorded as `[not recorded]`. Never write the `audit_head`
  key in `app_meta` yourself.
- Access: `requireRole(actor, 'manager', 'assign clients')`, `assertClientAccess(db, actor, clientId)`,
  `clientScopeSql(actor, 'c')` (returns `{ sql, params }` to AND into list queries),
  `requirePartnerToDelete(actor, 'an invoice')` for records the practice must keep.
- Sensitive values: `encryptField(value, 'table.column')` and `decryptField(stored, 'table.column')`
  from `src/main/security/field-crypto.ts`. The context string is bound into the encryption.
  Columns are named `*_enc`, with `encryptedCheck()` as their CHECK.
- Settings: `getSetting` / `setSetting` from `src/main/db/settings.ts`. The settings table's
  `"group"` column is a reserved word; quote it in raw SQL.
- Data issues: `raiseIssue`, `resolveIssue`, `resolveIssuesNotIn` (`src/main/access/issues.ts`),
  keyed by `dedupeKey`. Notifications: `notify` and `completeSubject` (`src/main/access/notify.ts`),
  keyed by `subjectKey` and `dedupeKey`.
- External links open only through the allow-list in `src/main/app/external-links.ts` (gov.uk and
  subdomains, ollama.com, bitopi.co.uk, login.microsoftonline.com, `mailto:`, `wa.me`). Ask the
  integrator for another host.

## Migrations

- One file per migration in `src/main/db/migrations/<range>_<domain>/`, added to that folder's
  `index.ts` array, with ids inside your range (a test enforces this; a shared number is refused).
- Use STRICT tables and the helpers in `src/main/db/sql.ts`: `NOW`, `TIMESTAMPS`, `dateCheck`,
  `boolCheck`, `encryptedCheck`. Money is `INTEGER *_pence`, dates `TEXT`. Reference core tables
  and lower-numbered domains only. Read `0001_core.ts` before writing SQL against the core tables.
- A migration may set `foreignKeys: 'off'` for a table rebuild; every key is checked before commit.

## Background jobs and events

- `registerJob(intervalJob('domain.what', { firstRunAfterMs, everyMs }, (ctx) => ...))` in your
  register function. Jobs start at step 9 and never run in tests. Names are unique.
- Events go in your block of `src/shared/ipc/events.ts`, in both the `ApiEvents` interface and
  the `EVENT_NAMES` table. In the renderer: `useApiEvent(name, fn)` or `onEvent` from `lib/api.ts`.
  Emitting `licence.changed` makes the renderer re-read every query.

## Tests

- `tests/helpers/db.ts`: `createTestDb()` (in memory, every migration, partner, manager and staff
  seeded with `TEST_PASSWORD`), `actorFor(role)`, `addClient(db, {...})`.
- `tests/helpers/ipc.ts`: `createTestIpc(db)` calls channels through the real registry, with
  `signInAs(role)`, `ok()`, `call()` and `auditCount()`.
- Put tests in `tests/main/<domain>/`, `tests/shared/<domain>/` or `tests/renderer/<domain>/`.
  A DOM test starts with `// @vitest-environment jsdom`.
- `tests/renderer/slots.test.tsx` draws every route, settings section, client-file tab and setup
  step, so a placeholder you replace must render without `console.error` under jsdom (stub
  `matchMedia` as that test does if you need it).

## Renderer

- Screens default-export a component taking `{ params }` (`ScreenProps`). Use
  `useApiQuery(channel, req)` and `useApiMutation(channel, { invalidates: [...] })` from
  `@renderer/lib/api`. Every screen that loads data shows `Loading`, `EmptyState` (with the next
  step) or `LoadProblem` (error, `onRetry`). Never touch `window.aeterna` (lint enforces it).
- Navigation: `navigate(id, params, { replace: true })` and `useRoute()` from `stores/router`.
  The person signed in is `useActor()` from `stores/session`.
- Design system: only components from `@renderer/components/ui`; each prop is documented in its
  file. Colours come from Tailwind theme classes only (`bg-surface`, `glass`, `glass-raised`,
  `text-fg`, `text-fg-muted`, `text-fg-subtle`, `bg-accent`, `text-accent-text`, `text-accent-fg`,
  `success`, `warning`, `danger`, `info`, `line`, `chart-1`…`chart-8`). Tailwind's default palette
  is replaced, so `bg-red-500` does not exist. Opacity modifiers use the default scale or an
  arbitrary value like `/[0.12]`. Confirm destructive actions with `useConfirm()`; messages with
  `toast.success()` / `toast.error()`.
- Lint: react-hooks v7 recommended rules are errors — no synchronous setState in an effect body,
  no reading `ref.current` during render, no reassigning variables inside JSX map callbacks. The
  renderer cannot import electron, `@main/*` or `node:*`. Shared code imports neither process.
- Smoke expectations: every route renders an h1 (`PageHeader`) inside `main` and settles any
  `role=status` Loading within 8 seconds, with zero `console.error`. `clientFile` is visited with
  `clientId=1`, which may not exist: a missing client shows a not-found state without logging.

## Domain-specific hooks

- **design:** keep the CSS variable names in `src/shared/theme/variables.ts`, every component's
  props, and the signatures of `readAppearance()` and `windowColours()`; you may extend the
  `ModeTokens` shape if you update every use. `components/layout/Splash.tsx` is the splash slot
  App.tsx renders over everything (render null when done). Effects levels and Reduce transparency
  are wired through data attributes on `<html>` and `styles/index.css` / `glass.css`.
  What the design system now offers every screen (all from `@renderer/components/ui` unless
  named): `<Amount pence={n} />` for money (tabular, small £, quiet pence, negatives in
  brackets; `whole`, `symbol={false}`, `negative='minus'`); `<Reference label="UTR">…</Reference>`
  or the `ref-figures` class for references (slashed zero), and `tabular` for any column of
  figures; `<GlassBadge tone="success" dot>Paid</GlassBadge>` for a status (never colour a whole
  row); `RadioCards`, `Skeleton`; chart colours from `useTheme().tokens.chart` (8),
  `chartSequential` and `chartDiverging` (5 each), or the Tailwind colours `chart-1…8`,
  `seq-1…5`, `div-1…5` (a series meaning good or bad wears the success / danger tokens);
  soft tints `bg-success-soft` and friends; opaque `bg-surface*` for sticky bars; `font-serif`
  only for page titles, client-file headers and empty-state headlines (PageHeader and EmptyState
  already use it); `data-print="hide"` and `data-print-flow` for print; `<ThemeScope>` from
  `@renderer/theme` to draw a subtree in another palette; `useReducedMotion()` /
  `useFullEffects()` from `@renderer/theme` for anything that animates. The font licences
  (`src/renderer/src/assets/fonts/*-OFL.txt`, sources in `SOURCES.txt`) must be shown in the
  app's notices (release, About).
- **auth:** App.tsx gates on `auth.status`'s `setupNeeded`, `setupComplete`, `signedIn`, `actor`
  and `firmName`; keep those fields. Replace session resolution with `setSessionResolver()` in
  `src/main/ipc/context.ts` (idle sign-out, last-seen times). Sessions are bound to the window and
  end when it closes; open sessions are closed as `app_restarted` at start-up. Settings → Your
  sign-in is `screens/settings/AccountSection.tsx`. Keep the backup domain's `RestoreOffer` that
  SetupWizard renders while `setupNeeded`. `auth.signIn` and `auth.signOut` are `audited: false`.
  What auth offers the other domains. Main process, from `src/main/auth`:
  `requireRecentReauth(ctx, 'print the recovery sheet')` in a protected handler (refuses with
  `{ code: 'forbidden', field: 'reauth' }` unless the password was entered on this window in the
  last 5 minutes); `registerPersonLinkCheck({ id, count(db, userId), describe(n) })` for every
  table whose rows name a person, so removing that person is refused with your records named;
  `registerSetupProbe('recovery' | 'vault' | 'licence' | 'import', (db) => boolean | null)` from
  your register function, so the first-run wizard knows whether your step's work is done (null:
  it doesn't apply); `activePeople(db)`, `readFirm(db)` and `firmName(db)`. Renderer:
  `withReauth()` / `ensureRecentReauth()` from `components/session/reauth.ts` (the dialog is
  already mounted by the shell, through IdleWarning, and by the setup wizard); `PasswordField`
  from `components/session/PasswordField.tsx` for any password or passphrase box; the channel
  `people.directory` for person pickers and `firm.get` for the firm's details.
- **licence:** replace `src/main/licence/gate.ts`, keeping `isReadOnly()` and `licenceHolder()`.
  Fill `startLicence()` in `src/main/licence/startup.ts` (step 5; may return a Promise) and the tool
  in `tools/licence-generator/`.
- **backup:** fill `src/main/backup/startup.ts`. `applyPendingRestore()` runs before the key is
  read. `recoverDatabaseKey({ problem: 'missing_key' | 'unreadable_key' | 'wrong_key', message, window })`
  resolves the 64-hex key or null; write the key file with `writeDatabaseKey()` from
  `src/main/db/key-file.ts`, never over an existing one (rename a wrong one aside first). For the
  UI, open `window.rendererFile` at `#/unlock` with `window.preloadPath` (App.tsx shows
  `components/recovery/UnlockApp.tsx`); handle your channels with `ipcMain.handle(INVOKE_CHANNEL)`
  because the registry isn't installed yet, and remove that handler before resolving. Fill
  `startCrashReports()` / `recordCrash()` in `src/main/system/crash-reports.ts`, and
  `components/recovery/RestoreOffer.tsx` for restore on a new PC in the setup wizard.
  `startupNotices()` (`src/main/app/notices.ts`) holds start-up notices for DatabaseStatusBanner;
  `runtimeInfo()` (`src/main/app/runtime.ts`) gives version, packaged and dataFolder; data paths
  come from `dataPaths()` (`src/main/app/paths.ts`). `DatabaseOpenError.reason` is one of
  `wrong_key`, `busy`, `orphaned_log`, `set_aside_failed`, `invalid_key` or `create_failed`;
  `KeyFileError.reason` is `missing`, `unreadable` or `exists`.
- **navigation:** the sidebar holds at most 14 entries (the brief). Activity, Onboarding gaps
  and Practice details have no sidebar entry: insights links to Activity from the bell and
  Home, clients and compliance link to Onboarding gaps from Clients and Home, and Settings →
  Firm details already links to Practice details. All three are in Go to….
- **references:** fill `screens/settings/VaultSection.tsx` (partner only: per-firm switch,
  passphrase change, sheet) and `screens/practice/searchProvider.ts` ("whose reference is this?").
- **compliance / work:** Go to… providers at `screens/compliance/searchProvider.ts` and
  `screens/work/searchProvider.ts`.
- **integrations:** fill `screens/companies-house/ClientCompaniesHouseTab.tsx` and
  `screens/assistant/AssistantBriefing.tsx` (render null when the assistant isn't available).
  Forecast keeps `<AssistantBriefing subject={{ kind: 'forecast' }} />`; the client Overview tab
  keeps `<AssistantBriefing subject={{ kind: 'client', clientId }} />`.
- **release:** complete `electron-builder.yml` and `src/main/app/menu.ts`, own `screens/about/**`;
  check the transparent `titleBarOverlay` and the `asarUnpack` entry for
  better-sqlite3-multiple-ciphers on a real Windows build. The spell checker fetches its en-GB
  dictionary from Chromium's CDN on Windows and Linux: bundle the dictionaries or turn spellcheck
  off, since the app must stay offline.
