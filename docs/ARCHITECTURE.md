# AETERNA CRM — architecture and conventions

This is the contract every part of the app is built against. Read it before writing code,
and follow it exactly; where it is silent, follow the code that already exists.

AETERNA CRM is an offline Electron desktop app for UK accounting practices: clients,
Companies House and HMRC compliance, deadlines, AML, work and billing, communications,
references and a credential vault, with a per-firm yearly licence. Everything stays on the
PC. The product decisions are in `docs/DOMAINS.md` (what each part must do) and
`recovered-from-claude-chat/RELEASE_PLAN.md` (the release plan this build follows).

Logic from the earlier build survives in `recovered-from-claude-chat/project/` and
`recovered-from-claude-chat/early-bundles/` (see that folder's `MANIFEST.md` for how far each
file can be trusted). Port from it freely — it was tested against the practice's real data —
but adapt it to the schema and contracts here; never import from that folder.

## Product facts

| Fact | Value |
| --- | --- |
| Product name | AETERNA CRM (`productName`), data folder `AETERNA CRM` |
| App ID | `uk.co.bitopi.aeternacrm` (also the Windows AppUserModelID) |
| Vendor | Bitopi, support `info@bitopi.co.uk`, `07555 221010` |
| Platforms | Windows 10/11 x64 now (NSIS, unsigned); macOS configured, not built |
| Language | UK English throughout: licence, colour, organisation, dates `20 Oct 2026` |

These live in `src/shared/product.ts`; never repeat them elsewhere.

## Stack

Electron 41 · electron-vite 5 · Vite 7 · React 18.3 · TypeScript 5 (strict) · Tailwind CSS 3.4 ·
framer-motion 11 · zustand 5 · @tanstack/react-query 5 · lucide-react · recharts 2 ·
better-sqlite3-multiple-ciphers 12 · exceljs 4 · nodemailer · vitest 3 · Playwright ·
electron-builder 26 · ESLint 9 with typescript-eslint.

No other runtime dependency without a clear need. Never add a cloud service.

## Repository layout

```
package.json · electron.vite.config.ts · electron-builder.yml · tsconfig*.json
tailwind.config.ts · postcss.config.js · eslint.config.mjs · vitest.config.ts
build/                      icons, installer.nsh, entitlements.mac.plist
scripts/                    electron-node.mjs (tests under Electron's Node), smoke.mjs, release helpers
tools/licence-generator/    the vendor key tool (never shipped in the app)
docs/                       ARCHITECTURE.md, DOMAINS.md, user and admin guides
src/shared/                 code both processes use: contracts, pure domain logic, theme data
src/main/                   Electron main process: database, services, IPC handlers
src/preload/                the bridge (`window.aeterna`)
src/renderer/               the React app
tests/                      vitest: tests/main, tests/shared, tests/renderer
e2e/                        Playwright against the built Electron app
```

Path aliases (tsconfig, electron-vite and vitest all agree): `@shared/*` → `src/shared/*`,
`@main/*` → `src/main/*`, `@renderer/*` → `src/renderer/src/*`. Main and preload never import
from the renderer; the renderer never imports from `@main`.

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | electron-vite dev |
| `npm run typecheck` | `tsc --noEmit` for `tsconfig.node.json` (main, preload, shared, tools, tests, scripts) and `tsconfig.web.json` (renderer, shared, and `tests/renderer`, which need the DOM) |
| `npm run lint` | ESLint, 0 errors required |
| `npm test` | vitest, run under Electron's own Node so the one native SQLite build serves tests and app (`scripts/electron-node.mjs`) |
| `npm run build` | typecheck, lint, test, then `electron-vite build` |
| `npm run smoke` | Playwright launches `out/` under xvfb, signs in, visits every route, fails on any renderer error |
| `npm run dist:win` | build, then electron-builder NSIS x64 |
| `npm run licence -- <cmd>` | vendor key tool |

`postinstall` runs `electron-builder install-app-deps` so the native module matches Electron.

## The IPC contract

One typed contract, one bridge, one registry. No `ipcRenderer` anywhere but the preload, no
ad-hoc channel strings.

### Result and errors — `src/shared/ipc/result.ts`

```ts
export type ErrorCode =
  | 'unauthenticated' | 'forbidden' | 'read_only' | 'not_found' | 'invalid'
  | 'conflict' | 'locked' | 'unavailable' | 'internal'
export interface ApiError { code: ErrorCode; message: string; field?: string }
export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError }
```

`message` is a plain sentence a person can act on ("A client with this company number
already exists: Alder Ltd (CL0042)."). Never a stack trace, never SQL.

### Contracts — `src/shared/contracts/<domain>.ts`

Each domain declares its channels in its own file:

```ts
import type { ChannelSpec } from '../ipc/spec'

export interface ClientsContract {
  'clients.list': ChannelSpec<ClientListQuery, ClientListItem[]>
  'clients.update': ChannelSpec<{ id: number; values: ClientInput }, Client>
}

export const clientsChannels = {
  'clients.list': { kind: 'read' },
  'clients.update': { kind: 'write' },
} as const satisfies ChannelTable<ClientsContract>
```

- Channel names are `<domain>.<verb>` in camelCase: `clients.list`, `deadlines.markFiled`.
- `kind` is `'read'` or `'write'`. A write changes stored data.
- Optional flags: `auth: 'public'` (callable signed out: sign-in, setup, licence status,
  appearance, ping); `allowWhenReadOnly: true` (a write still allowed after the licence
  lapses: licence entry, backups, appearance, sign-out, exports); `audited: false` (a write whose
  changes deliberately stay out of the audit log: sessions and sign-in history, this PC's
  preferences).
- `src/shared/ipc/contract.ts` composes every domain into `ApiContract` and `CHANNELS`; the
  scaffold pre-wires all domains, so a domain only edits its own file.

### Events — `src/shared/ipc/events.ts`

Main → renderer pushes (`notifications.changed`, `licence.changed`, `session.ended`,
`appearance.osChanged`, …) are declared in one `ApiEvents` interface, each with its payload.

### The bridge — `src/preload/index.ts`

Exposes exactly this, via `contextBridge`, as `window.aeterna`:

```ts
invoke<C extends Channel>(channel: C, req: Req<C>): Promise<Result<Res<C>>>
on<E extends EventName>(event: E, listener: (payload: ApiEvents[E]) => void): () => void
info: { platform: NodeJS.Platform; versions: { app: string; electron: string } }
```

It refuses any channel or event not in `CHANNELS` / `EVENTS`. Nothing else is exposed.

### The registry — `src/main/ipc/registry.ts`

```ts
handle('clients.update', (req, ctx) => updateClient(ctx.db, ctx.actor, req.id, req.values))
```

The registry does, for every call, in this order: check the channel exists; resolve the
session bound to the calling window (the renderer never holds a token); refuse with
`unauthenticated` unless the channel is `public`; refuse writes with `read_only` when the
licence gate says so, unless `allowWhenReadOnly`; run the handler; turn a thrown
`UserFacingError(code, message, field?)` into its `Result`, and anything else into
`internal` with the detail logged (never sent). Handlers are plain functions of
`(req, ctx)`; `ctx` gives `db`, `actor` (signed-in user, or `null` on public channels),
`requireActor()`, `now()` and `emit(event, payload)`.

Each domain exports `registerXxxHandlers()` from `src/main/ipc/<domain>.ts`;
`src/main/ipc/register-all.ts` calls them all, pre-wired.

### Renderer access — `src/renderer/src/lib/api.ts`

- `invoke(channel, req)` → `Result`.
- `useApiQuery(channel, req, options?)` and `useApiMutation(channel, options?)` wrap
  @tanstack/react-query. Query keys are `[channel, req]`. A mutation invalidates the queries
  it names (`invalidates: ['clients.list', 'dashboard.summary']`).
- Screens never touch `window.aeterna` directly.
- `App.tsx` sends the person back to sign-in when any query or save is refused as
  `unauthenticated`, and re-reads every query on `licence.changed` (read-only began or ended).
- Opened at `#/unlock` (by the backup domain's start-up hook, before the database is open), the
  page is `components/recovery/UnlockApp.tsx` instead of the app.
- Where `window.aeterna` is absent (the browser demo), `lib/api.ts` uses the demo backend in
  `src/renderer/src/demo/`. The app code is the same either way.

## Main process

### Start-up — `src/main/index.ts` and `src/main/startup/`

Nine steps, in this order, each logged to `logs/startup.log` in the data folder; a failed step
shows a plain-language error window with the log path and does not continue:

1. Single-instance lock and the Windows app ID.
2. Data folder (`app.getPath('appData')/AETERNA CRM`, or `AETERNA_DATA_DIR` for tests and
   smoke runs), moving data left by earlier builds.
3. Database: a restore staged by the last run swapped in, the key (or, when the key file is
   missing, damaged or wrong, the key from the recovery sheet), open, integrity check,
   migrations (`src/main/startup/database.ts`, with the backup domain's hooks in
   `src/main/backup/startup.ts`).
4. One-time conversion of values encrypted under the old scheme (if any).
5. Licence (`startLicence()`, which may be async).
6. Every handler group (`registerAllHandlers()`).
7. Wiring report: any channel in `CHANNELS` without a handler is logged (and fails tests).
8. Main window.
9. Background jobs: deadline and notification checks, Companies House checks, scheduled
   backups, licence reminders. A domain registers its jobs with `registerJob()` (`src/main/jobs.ts`)
   from its own `registerXxxHandlers()`; step 9 starts them, and they never run in tests.

The window: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity`
on, a strict CSP in `index.html`, navigation and new windows blocked, external links opened
only for an allow-list (gov.uk, companieshouse.gov.uk, find-and-update.company-information…,
ollama.com, Microsoft's sign-in page for the optional Microsoft 365 email setting, `mailto:`,
`https://wa.me/`). Only the exact app page (`index.html` with any `#route`) counts as the app, for
navigation and for IPC. Every other webContents (a print window, the start-up error window) refuses
pop-ups and navigation. A page that crashes is reloaded, at most three times a minute.
`backgroundColor` matches the saved theme so there is no white flash. No developer tools or Reload
menu in packaged builds.

Title bar: the window has no native title bar (`titleBarStyle: 'hidden'`). The renderer draws its
own (`components/layout/TitleBar.tsx`) as the drag region. On Windows and Linux the system's own
minimise, maximise and close buttons are kept through `titleBarOverlay` over the top-right corner,
recoloured with the theme (`applyWindowTheme()`), so snap layouts and keyboard behaviour stay the
system's; the page leaves room for them with `env(titlebar-area-*)`. macOS keeps its traffic lights
(`hiddenInset`). No IPC is needed for window controls.

### Database — `src/main/db/`

- `better-sqlite3-multiple-ciphers`, opened with `cipher = 'sqlcipher'`, `legacy = 4`, the
  per-install key from `database-key.json` beside the database (32 random bytes, hex). Then
  `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`, `synchronous = NORMAL`.
- A database that cannot be opened (wrong key, missing key file, corrupt file) is **never**
  renamed, emptied or replaced: start-up stops with an explanation (`DatabaseOpenError.reason`
  says which). Only a file that opens but fails `quick_check` (a damage report, or SQLITE_CORRUPT /
  SQLITE_NOTADB from the check) is set aside, with its `-wal` and `-shm`, all or none; a check that
  can't run because the file is busy or locked stops start-up with nothing changed. A `-wal` file
  without its database is never joined to a new one, and never gets a new key. A key file is
  written only where none exists (`createDatabaseKey()`, `writeDatabaseKey()`).
- `getDb()` returns the open handle; services take `db` as a parameter so tests can pass an
  in-memory one.
- Migrations are the only schema source: each exports `{ id: 'NNNN_name', up(db) }` (with
  `foreignKeys: 'off'` for a table rebuild, which then has every key checked before it commits).
  Core's is `src/main/db/migrations/0001_core.ts`; each domain keeps its own in
  `src/main/db/migrations/<range>_<domain>/` (e.g. `0400_clients/0401_registers.ts`), listed in that
  folder's `index.ts`, and `migrations/index.ts` composes the folders. They are applied in id order,
  each inside a transaction, and recorded in `schema_migrations`; a database migrated by a newer
  version is refused, unchanged. A migration never drops user data.
- Number ranges, one per domain (see `docs/DOMAINS.md`): `0001` core, `0100` auth, `0200`
  licence, `0300` backup and system, `0400` clients, `0500` compliance, `0600` work and
  billing, `0700` AML and issues, `0800` communications and documents, `0900` references and
  vault, `1000` import, `1100` insights, `1200` Companies House and AI. A domain's tables may
  reference core tables and lower-numbered domains only.
- Money is whole pence, `INTEGER`, columns named `*_pence`. Dates are `TEXT`: civil dates
  `YYYY-MM-DD`, instants ISO 8601 UTC. Booleans are `INTEGER` 0/1. Every table has
  `created_at`, and `updated_at` where rows change.
- Sensitive values (NINO, Companies House auth code, ID document numbers) are encrypted with
  `src/main/security/field-crypto.ts` (AES-256-GCM, key derived from the database key with
  HKDF), stored as `v1:<base64>`, in columns named `*_enc`.

### Core tables — `0001_core.ts`

`app_meta`, `firm` (one row), `settings` (`group`, `key`, JSON `value`), `users`, `sessions`,
`invites`, `sign_in_events`, `clients`, `client_services`, `client_contacts`, `audit_log`,
`data_issues`, `notifications`. Their columns are defined in that file; read it before writing
SQL against them. `clients.id` is the key every client-linked table references
(`client_id INTEGER NOT NULL REFERENCES clients(id)`); `clients.code` (`CL0001`) is the
human-facing code, changeable but never empty.

### Access, audit and issues — `src/main/access/`

- `policy.ts`: `requireRole(actor, 'manager')` (partner ≥ manager ≥ staff),
  `assertClientAccess(db, actor, clientId)`, and `clientScopeSql(actor, alias)` for list
  queries. Staff see and change only clients assigned to them (and those clients' records);
  managers and partners see everything; only partners delete records the practice must keep
  (invoices, receipts, HMRC submissions, AML records, documents, WIP).
- `audit.ts`: `recordChange(db, actor, { action, entity, entityId, clientId?, before?, after? })`
  — call it in the same transaction as every write. Rows are hash-chained (`prev_hash`,
  `hash` = SHA-256 of the previous hash and the canonical row), and the newest entry is kept in
  `app_meta` (`audit_head`), so edits, removals (the newest ones included) and additions made
  outside the app show up in Security. The registry notices a write channel that changed rows
  without an audit entry (logged in the app; a failure in `createTestIpc`); the few writes that
  deliberately aren't audited say `audited: false` in their flags (sign-in, sign-out, appearance).
- `issues.ts`: `raiseIssue(db, {...dedupeKey})` and `resolveIssue(db, dedupeKey)` for the data
  issue register (references that fail their check, import findings, migration repairs).
- `notify.ts`: `notify(db, {...})` adds to the notification table with a `subjectKey`, so a
  notification is marked done automatically once its subject is dealt with.

### Errors

Throw `new UserFacingError('invalid', 'Enter a company number of 8 characters.', 'company_number')`
for anything a person can fix. Let programming errors throw; the registry logs them.

## Shared domain logic — `src/shared/domain/`

Pure functions, used by main (truth) and renderer (instant feedback), fully unit-tested:
`money.ts` (pence parse and format), `dates.ts` (civil dates in UK time, no UTC slips),
`references.ts` (UTR, NINO, VAT, company number with every prefix, PAYE, Accounts Office,
CIS, EORI…: format and check-digit checks returning a note, never refusing), `client-status.ts`
(current versus "no longer clients": Former client, Ceased, Dissolved, or dissolved at
Companies House), `deadlines.ts` (statutory due-date rules).

## Renderer

### Structure

```
src/renderer/src/main.tsx · App.tsx
lib/            api.ts, format.ts, hooks
theme/          ThemeProvider, palettes applied as CSS variables, useTheme()
components/ui/  the glass design system (below)
components/layout/  AppShell, Sidebar, TitleBar, CommandPalette (Ctrl+K), NotificationBell slot
navigation/     routes.ts (every route, pre-wired), nav.ts (sidebar groups), router store
screens/<area>/ one folder per area
stores/         zustand stores (session, router, preferences)
demo/           browser demo backend (no Electron)
styles/         index.css (tokens), glass.css
```

Routing is an in-app store: `navigate('clientFile', { clientId: 42 })`, back and forward,
last route remembered per user. Every route is declared once in `navigation/routes.ts` with id,
title, group, icon, minimum role and a lazily loaded screen.

### The design system — `components/ui/`

Screens use these and nothing else for surfaces and controls, so the theme reaches everything:

`GlassPanel` / `GlassCard` (surfaces, with `tone`, `padding`, `interactive`), `GlassButton`
(`variant: primary | secondary | ghost | danger`, `size`, `icon`, `loading`), `GlassBadge`
(`tone: neutral | accent | success | warning | danger | info`), `GlassModal` / `Dialog`
(focus trap, Escape, labelled, nested-safe), `useConfirm()` (never `window.confirm`),
`toast` (success, info, warning, error), `GlassTable` (sortable columns, row click, sticky
header, keyboard row navigation, empty state), `Field`, `TextInput`, `TextArea`, `Select`,
`DateInput`, `MoneyInput`, `Checkbox`, `Toggle`, `Segmented`, `Tabs`, `SearchInput`,
`PageHeader` (title, subtitle, actions), `StatTile`, `EmptyState`, `Loading`, `LoadProblem`
(message + Try again), `Tooltip`, `Avatar`, `ProgressRing`, `Kbd`, `RadioCards` (choice cards),
`Amount` (money: tabular, small £, negatives in brackets), `Reference` (slashed zero) and
`Skeleton`. `theme/` adds `ThemeScope` (a subtree in another palette), `useReducedMotion()` and
`useFullEffects()`.

Every interactive element has a visible focus ring and an accessible name. Respect
`prefers-reduced-motion` and the app's own "Reduce motion" setting.

### Theme

Three modes — Day, Night and Auto (follows Windows) — and colour themes, Burgundy & Slate by
default. A theme is pure data in `src/shared/theme/palettes.ts` (main uses it for the window
background); the renderer writes it to CSS variables on `<html data-mode data-palette>`, and
Tailwind colours read those variables (`rgb(var(--accent) / <alpha-value>)`), so no component
hard-codes a colour. Each palette defines, for day and night: backdrop gradient, glass surface
and border, text levels, accent and accent-2, semantic colours, focus ring, and a validated
categorical chart palette. Settings → Appearance changes mode, colour theme, effects level
(Full / Balanced / Lite — Lite turns off blur for modest PCs), reduce motion and reduce
transparency; the choice is saved for the user on this PC.

### Copy and UX rules

- Sentence case, plain words, UK spelling. Buttons say what they do ("Mark filed").
- Every screen that loads data shows `Loading`, `EmptyState` (with the next step) or
  `LoadProblem` (with Try again) — never a blank panel or an endless spinner.
- Destructive actions confirm with `useConfirm()`, naming what goes.
- Forms validate as you type with the shared checks; references that fail a check are saved
  with a warning and flagged, never refused.
- Numbers: money `£1,250.00`, counts with thousands separators, dates `20 Oct 2026`.
- Keyboard: everything reachable by Tab, Escape closes, Enter submits, Ctrl+K opens Go to….

## Testing

- `tests/main/**`: services against `createTestDb()` (`tests/helpers/db.ts`: in-memory,
  every migration applied, a partner, a manager and a staff user seeded) with
  `actorFor('partner' | 'manager' | 'staff')`.
- `tests/shared/**`: pure logic, table-driven.
- `tests/renderer/**`: pure renderer logic; component tests with jsdom and Testing Library
  where behaviour matters (dialogs, forms). A DOM test starts with `// @vitest-environment jsdom`.
- `tests/helpers/ipc.ts`: `createTestIpc(db)` calls channels through the real registry (session,
  public, read-only checks and error handling), with `signInAs(role)`.
- `tests/contract.test.ts`: every channel in `CHANNELS` has a handler, every handler a
  channel, flags are valid. That every write audits is checked on each call through
  `createTestIpc` (above), so a domain's own handler tests catch a missing `recordChange()`.
- `tests/renderer/slots.test.tsx`: every route's screen, settings section, client-file tab and
  setup step loads and draws.
- `e2e/`: Playwright `_electron` smoke over every route in Day and Night, then every client-file
  tab and settings section.

Every new service gets tests in the same change. Tests never use real client data.

## Git

Commit small, working steps with clear messages. Never commit `node_modules`, `out/`,
`release/`, a database, `database-key.json`, a licence signing key or a workbook.
