# Domains: who owns what, and what each must do

The app is built as vertical slices. Each domain owns its contract file, its migration range,
its main-process code, its screens and its tests, so slices can be built side by side without
touching each other's files. The scaffold pre-wires every registry (contracts, handlers,
migrations, routes, settings sections, client-file tabs, setup steps) with stubs; a domain
fills in its own stubs and adds new files under its own paths.

**Shared files a domain must not edit** (ask for a change in your report instead):
`src/shared/ipc/*`, `src/main/ipc/registry.ts`, `src/main/ipc/register-all.ts`,
`src/main/db/connection.ts`, `src/main/db/migrate.ts`, `src/main/db/migrations/index.ts`,
`src/main/db/migrations/0001_core.ts`, `src/main/access/*`, `src/preload/*`,
`src/renderer/src/lib/api.ts`, `src/renderer/src/navigation/routes.ts`,
`src/renderer/src/App.tsx`, `package.json` (list a dependency you need in your report; the
integrator adds it). Exception: `src/shared/ipc/events.ts` — append your events at the end of
`ApiEvents`, inside the marked block for your domain.

Plan references below ("L3", "4C") are to `recovered-from-claude-chat/RELEASE_PLAN.md`.
"Port" means: read the recovered file, keep its tested logic and wording, adapt it to this
schema and these contracts.

---

## Wave A

### design — theme, design system, shell
- **Owns:** `src/shared/theme/**`, `src/renderer/src/theme/**`, `src/renderer/src/components/ui/**`,
  `src/renderer/src/components/layout/**`, `src/renderer/src/styles/**`, `tailwind.config.ts`,
  `src/shared/contracts/appearance.ts`, `src/main/ipc/appearance.ts`, `src/main/preferences/**`,
  `src/renderer/src/screens/settings/AppearanceSection.tsx`, `src/renderer/src/screens/system/DesignGallery.tsx`.
- **Must:** Day, Night and Auto (Auto follows Windows through `nativeTheme`); the five colour
  themes from the brief — Burgundy & Slate (default), Sapphire, Emerald & Gold, Graphite &
  Copper, Indigo — plus the luxury themes the palette study recommends; every palette with a
  validated categorical chart scale and AA contrast in both modes; spatial-glass surfaces
  (layered translucency, inner highlight, soft depth, subtle grain), with Effects
  Full / Balanced / Lite, Reduce motion and Reduce transparency; Settings → Appearance laid out
  like the brief's screenshot (mode cards, colour-theme cards with gradient swatches, a check on
  the chosen one); the sidebar footer's sun / moon / half-circle mode switch; every component
  listed in ARCHITECTURE.md, polished, keyboard-complete and accessible; the grouped sidebar,
  title bar (licence holder's firm name, notification bell slot, assistant button), command
  palette (Ctrl+K) with a provider registry other domains add to; a short skippable splash
  (under a second, none under reduced motion); a design gallery screen showing every component
  in the current theme.
- **Inputs:** `docs/design/PALETTES.md` and `docs/design/palettes.json` (the palette study),
  the brief's screenshots (described in that study).
- **Tests:** contrast and chart-palette validation for every palette and mode; theme
  persistence; component behaviour (dialog focus trap, confirm, segmented, table sort).

### auth — sign-in, people, firm, setup
- **Owns:** `src/shared/contracts/auth.ts`, `src/main/auth/**`, `src/main/ipc/auth.ts`,
  migrations `0100`–`0199`, `src/renderer/src/screens/auth/**`, `src/renderer/src/screens/setup/**`
  (the wizard shell and its Firm and First partner steps), `src/renderer/src/screens/settings/PeopleSection.tsx`,
  `src/renderer/src/screens/settings/FirmSection.tsx`, `src/renderer/src/components/session/**`,
  `src/renderer/src/stores/session.ts`.
- **Must (L1, 4A, 4B):** username and password only, scrypt hashing (Node crypto), lockout after
  repeated failures with a partner unlock; sessions bound to the window, idle sign-out after a
  chosen time (30 minutes by default) with a one-minute warning; sign-out in the sidebar;
  re-entry of the password for sensitive actions (`auth.reauth`, used by recovery sheet and
  vault); change password for everyone; invites (single use, expiring, cancellable) with
  roles; change role, turn access off, unlock, reset password, remove (refused while clients
  or past work are under the person — turn access off instead); the first-run wizard in this
  order — firm details, first partner, recovery sheet, vault passphrase, trial or licence,
  workbook import — resuming where it stopped, each step a slot other domains fill; firm
  details (name, address, contact, company number, VAT number, UTR, PAYE reference) with
  Settings → Firm; a development-only first user (`dev.firstUser`, absent in packaged builds).
- **Port:** `project/src/main/setup/service.ts`, `project/src/main/ipc/setup.ts`,
  `project/src/main/ipc/session.ts`, `project/src/main/records/firm.ts`, `project/src/main/records/assignment.ts`.

### licence — trial, keys, read-only, vendor tool
- **Owns:** `src/shared/contracts/licence.ts`, `src/main/licence/**`, `tools/licence-generator/**`,
  migrations `0200`–`0299`, `src/renderer/src/screens/licence/**`,
  `src/renderer/src/screens/settings/LicenceSection.tsx`, `src/renderer/src/screens/setup/LicenceStep.tsx`,
  `src/renderer/src/components/licence/**`.
- **Must (L3 licence policy and loophole table):** one licence per firm on any number of its PCs,
  £175 a year; 60-day trial from first run; offline Ed25519-signed keys naming the firm and the
  days covered (every field signed); renewal stacks — a key starts at the later of the current
  expiry and its issue date, so paying early never loses time and paying after a lapse still
  gives a full year; reminder banner and one desktop notification a day from 30 days; 3 days'
  grace after expiry with a banner, then read-only (everything viewable and exportable, backups,
  settings and licence entry still open; every write channel refused centrally); the latest time
  ever seen sealed, so winding the clock back adds nothing; trial state sealed in three places
  plus a marker outside the data folder (Windows registry, macOS Library), so deleting app data
  doesn't restart the trial; revocation list shipped with each release; the licensed firm's name
  in the title bar, About, every report and export file name; a Licence screen (status with the
  big validity date, key entry, key history on this PC, the reminder and grace notices only when
  they apply); the vendor tool: `init` (passphrase-encrypted signing key), `issue`, `renew`,
  `replace` (firm renamed; old key revoked next release), `revoke`, `trust-file --write`
  (writes `src/main/licence/public-keys.ts`), with a tamper-evident issue register.
- **Port:** `project/src/main/licence/{engine,format,service,public-keys}.ts`,
  `early-bundles/crm-import/src/main/licence/{store,format,engine,service}.ts`,
  `project/tools/licence-generator/*`, tests in `project/tests/licence/*`.
- **Gate API for others:** `src/main/licence/gate.ts` exports `isReadOnly()` (the registry
  calls it) and `licenceHolder()`.

### backup — database key, recovery sheet, backups, system
- **Owns:** `src/shared/contracts/backup.ts`, `src/shared/contracts/system.ts`, `src/main/backup/**`,
  `src/main/security/recovery-sheet.ts`, `src/main/system/**`, `src/main/ipc/backup.ts`,
  `src/main/ipc/system.ts`, migrations `0300`–`0399`, `src/renderer/src/screens/settings/BackupsSection.tsx`,
  `src/renderer/src/screens/setup/RecoveryStep.tsx`, `src/renderer/src/components/recovery/**`,
  `src/renderer/src/components/system/**`.
- **Must (L1, 3C, L4 Fortress):** recovery sheet for the database key — PDF and print, partners
  only with their password re-entered, never logged; the key in short groups with check
  characters so a typing slip is caught and its group named; offered the moment the first
  partner exists, at a partner's first sign-in after an upgrade and whenever the key changes, with
  a banner until saved or printed; backups that are verified copies of the encrypted database
  plus the stored documents, never the key; one automatic backup a day, the newest 14 kept; a
  backup folder on another drive; Test on any backup; restore swapped in at the next start with
  a safety copy; restore on a new PC from a backup and the key typed from the sheet; a lost key
  file unlocked with the sheet; the database status banner (locked, not saving, notices from
  start-up); crash reports saved on the PC only; `system.ping`, `system.info` (version, data
  folder, licence holder, platform); open the data folder; Windows file-lock retries for
  atomic writes.
- **Port:** `project/src/main/backup/*`, `project/src/main/ipc/backup.ts`, `project/tests/backup/*`.

### clients — clients, client file, registers
- **Owns:** `src/shared/contracts/clients.ts`, `src/shared/domain/references.ts`,
  `src/shared/domain/client-status.ts`, `src/main/records/clients/**`, `src/main/ipc/clients.ts`,
  migrations `0400`–`0499`, `src/renderer/src/screens/clients/**` (Clients list, Client file shell
  and its Overview, Contacts and Registers tabs, edit dialog, quick add, paste import).
- **Must (3A, 4B, 4C, 4F, L5 decisions):** list with Current / No longer clients / Everyone
  (Current by default), search across names, trading names, other names, codes and company
  numbers, with "n matches among no-longer clients — show"; filters by type, status, assignee
  ("My clients", Unassigned); bulk assign with tick boxes; client types (company, LLP,
  partnership, sole trader, individual, trust, charity); statuses (Prospect, Onboarding,
  Active, Review required, Dormant, Former client, Ceased, Dissolved); codes `CL0001` given
  automatically, changeable but never removed; references checked as typed and kept with a
  warning when a check fails, each flagged as a data issue that resolves itself when corrected;
  sensitive fields encrypted; contacts (directors, PSCs, payroll and so on, primary contact,
  Companies House personal code); services with fees; partners, LLP members and trustees with
  UTR and NI checks; payroll schemes with a line per tax year; workplace pensions with duties
  start date; Self Assessment registration and income sources; linked clients read from both
  sides; other names (found by search and Go to…); the client file with a header (status,
  assignee, key references, quick actions) and tabs other domains fill; delete refused while
  records the practice must keep exist — suggest "Former client" instead; staff scoping.
- **Port:** `project/src/main/records/{clients,client-registers,assignment,reference-flags}.ts`,
  `early-bundles/crm-import/src/shared/references.ts`, `project/src/shared/client-status.ts`,
  `project/tests/records/{clients,client-registers,no-longer-clients,reference-flags}.test.ts`.

### compliance — deadlines, HMRC, onboarding gaps
- **Owns:** `src/shared/contracts/compliance.ts`, `src/shared/domain/deadlines.ts`,
  `src/main/records/compliance/**`, `src/main/ipc/compliance.ts`, migrations `0500`–`0599`,
  `src/renderer/src/screens/compliance/**` (Deadlines, HMRC & AML shell with its HMRC tab,
  Onboarding gaps), the client file Deadlines tab.
- **Must (4B, 4C, 4F):** statutory rules from period ends — accounts (9 months after year end
  for private companies), CT600 (12 months), CT payment (9 months and 1 day), VAT (1 month and
  7 days after quarter end, by stagger), confirmation statement, Self Assessment (31 January),
  payroll year end, P11D (6 July), auto-enrolment re-declaration (within 5 months of each third
  anniversary of the duties start date); deadlines generated per client from their services and
  dates, with the basis shown; one open-deadline list used everywhere (Home, Deadlines,
  notifications, forecast, reports agree); overdue included; worklist by person, "my
  deadlines", filters and sort; Mark filed (with date and reference, optionally logging the
  HMRC submission) and Not needed (with reason), reopen; HMRC submissions log, partner-only
  delete; onboarding gaps by client type and service — individuals never asked company fields,
  no-longer clients skipped, contact records count, manual Provided / Waived (with reason)
  kept on recheck, clearing a field flags it again; practice-wide gaps worklist with chips per
  requirement and counts, Copy as table, Recheck all clients.
- **Port:** `early-bundles/crm-import/src/main/import/core/rules.ts` (due-date rules),
  `early-bundles/crm-import/src/main/onboarding/requirements.ts`, `project/src/main/ipc/compliance.ts`.

### work — tasks, work in progress, billing
- **Owns:** `src/shared/contracts/work.ts`, `src/shared/domain/money.ts`, `src/main/records/work/**`,
  `src/main/ipc/work.ts`, migrations `0600`–`0699`, `src/renderer/src/screens/work/**` (Tasks,
  Work in progress, Billing), the client file Work tab.
- **Must (3A, 4C, 4F):** tasks with assignee, due date, priority, status (open, in progress,
  done, cancelled — cancelled is never open), linked client and deadline; time and work in
  progress entries with rate and value in pence; invoices numbered automatically, open, paid or
  cancelled, VAT, lines; receipts, optionally for a particular invoice; what is owed worked out
  one way everywhere (paid counts as settled), aged receivables; partner-only delete of kept
  records; Billing with invoices, receipts and the receivables summary.
- **Port:** `project/src/main/records/{receivables,work}.ts`, `project/src/main/ipc/ar.ts`,
  `project/tests/records/{receivables,work}.test.ts`.

### aml — AML, data issues, audit log
- **Owns:** `src/shared/contracts/aml.ts`, `src/main/records/aml/**`, `src/main/ipc/aml.ts`,
  migrations `0700`–`0799`, the AML tab of the HMRC & AML screen
  (`src/renderer/src/screens/compliance/AmlTab.tsx`), the client file AML tab,
  `src/renderer/src/screens/data/IssuesScreen.tsx`, `src/renderer/src/screens/security/AuditLogTab.tsx`.
- **Must (3A, 4C, 4E):** AML checks per client (customer due diligence, risk level, enhanced
  due diligence required before a high-risk check can be saved, ID evidence type, number
  encrypted, expiry, electronic check reference, review date), kept five years after the
  relationship ends; data issue register (open, in progress, resolved, waived) with filters,
  severity and the record it concerns; the audit log browsable and filterable by person, action,
  record and date, changed fields named in words, export as CSV; the hash-chain check that names
  entries changed outside the app.
- **Port:** `project/src/main/records/{audit-seal,security}.ts`, `project/src/main/services/audit-sealer.ts`,
  `project/src/shared/audit-words.ts`, `project/tests/records/{audit-seal,security}.test.ts`.

### comms — communications, documents, templates, email
- **Owns:** `src/shared/contracts/comms.ts`, `src/main/records/comms/**`, `src/main/email/**`,
  `src/main/ipc/comms.ts`, migrations `0800`–`0899`, `src/renderer/src/screens/comms/**`
  (Communications), the client file Communications and Documents tabs,
  `src/renderer/src/screens/settings/EmailSection.tsx`.
- **Must (3C, 4C):** one Communications screen with each client's emails, WhatsApp messages,
  calls, meetings and notes as one conversation, with follow-ups; email opens in the PC's mail
  app by default (`mailto:`), with SMTP, Microsoft 365 (Graph, browser sign-in) and Resend as
  optional settings, off by default, and every email recorded with recipient and whether sent;
  WhatsApp via `https://wa.me/`; templates with merge fields, a Fee Payment Reminder among the
  defaults, and Suggest one choosing from the client's own records and saying why; documents
  stored in the documents folder per client (add, open, rename, category, partner-only delete),
  included in backups.
- **Port:** `project/src/main/email/*`, `project/src/main/ipc/{email,documents}.ts`,
  `project/src/main/records/{communications,documents,templates}.ts`, `project/src/main/startup/documents-folder.ts`,
  `project/tests/email/*`, `project/tests/records/documents-folder.test.ts`.

---

## Wave B

### references — references, authorisations, vault
- **Owns:** `src/shared/contracts/references.ts`, `src/main/references/**`, `src/main/ipc/references.ts`,
  migrations `0900`–`0999`, `src/renderer/src/screens/practice/**` (Practice details and
  references), the client file References tab, `src/renderer/src/screens/setup/VaultStep.tsx`.
- **Must:** practice identifiers (21 firm reference types with renewal countdowns: ASA agent
  codes, AML supervisor, ICO, professional body, PI insurance, the firm's own VAT, UTR, PAYE,
  ACSP…); client reference types beyond the client record (CIS, EORI, TRS URN, CGT property
  account, SDLT UTRN, charity reference, NRL, ATED…), each with its own check; agent
  authorisations per client per service (SA, CT, PAYE/CIS, VAT, MTD ITSA…) with method,
  status, dates and postal code status; a "whose reference is this?" lookup; the vault —
  passphrase never stored, scrypt-derived key, AES-256-GCM, locks after 15 idle minutes, every
  reveal audited with a "client present" tick, government sign-ins (Gateway / One Login IDs,
  passwords, recovery words, backup codes, the agent's own password) stored only after that
  client's permission is recorded, a per-firm switch off on fresh installs, withdrawal deleting
  the client's sign-ins at once (even when locked or read-only), passphrase change resealing
  everything, the passphrase sheet printed once; login flags (no user ID, no password), reuse
  accepted; loading the master workbook's passwords (preview with no password shown, permission
  in one step for waiting clients, load exactly what was previewed).
- **Port:** `early-bundles/crm-import/src/main/references/{service,vault}.ts` (and `vault.ts.new`),
  `early-bundles/crm-import/src/shared/references.ts`, `project/src/main/security/vault-sheet.ts`,
  `project/tests/references/*`.

### import — workbook import, data explorer
- **Owns:** `src/shared/contracts/import.ts`, `src/main/import/**`, `src/main/ipc/import.ts`,
  migrations `1000`–`1099`, `src/renderer/src/screens/import/**`, `src/renderer/src/screens/data/DataExplorer.tsx`,
  `src/renderer/src/screens/setup/ImportStep.tsx`.
- **Must:** the master workbook adapter (14 sheets by `CLIENT_ID`) into this schema; a dry run
  that writes nothing and reports per-table counts, matches, issues, exclusions (plain-text
  passwords and unattributed emails left out); commit only of the exact previewed plan
  (fingerprint); re-import that changes nothing and keeps CRM edits; undo of the latest import,
  refused while an imported row has since been edited (naming it); an Import screen; the setup
  step; a Data explorer showing every register by domain, searchable and sortable.
- **Port:** `early-bundles/crm-import/src/main/import/**`, `early-bundles/crm-import/src/main/ipc/import.ts`,
  `early-bundles/crm-import/src/main/data/registers.ts`, `early-bundles/crm-import/src/shared/data-model.ts`.

### insights — Home, activity, notifications, calendar
- **Owns:** `src/shared/contracts/insights.ts`, `src/main/records/insights/**`, `src/main/services/scheduler.ts`,
  `src/main/services/notifier.ts`, `src/main/ipc/insights.ts`, migrations `1100`–`1149`,
  `src/renderer/src/screens/home/**`, `src/renderer/src/screens/activity/**`,
  `src/renderer/src/screens/calendar/**`, `src/renderer/src/components/notifications/**`.
- **Must (4A, 4D):** an honest, sophisticated Home: greeting, today's priorities (overdue and due
  this week, mine first), figures that are all real (live clients with the no-longer count beside
  it, overdue, due in 30 days, unbilled work, owed, AML and engagement gaps), a deadlines-by-month
  chart, my tasks, recent activity, licence and backup status, quick actions; Activity → Today
  (imports, edits, filings, deadlines, Companies House changes, system health); the bell with a
  count, the notifications list per person, toasts, desktop notifications, one summary for many,
  marked done automatically when the subject is dealt with, deadlines from the open-deadline list,
  people not set up routed to partners and managers; Calendar of deadlines and tasks by month and
  week.
- **Port:** `project/src/main/records/{pulse,notifications,dashboard}.ts`, `project/src/main/services/notifier.ts`,
  `project/src/main/ipc/pulse.ts`, `project/tests/records/{notifications,pulse}.test.ts`, `project/tests/services/notifier.test.ts`.

### analytics — risk, forecast, reports, security
- **Owns:** `src/shared/contracts/analytics.ts`, `src/main/records/analytics/**`, `src/main/ipc/analytics.ts`,
  migrations `1150`–`1199`, `src/renderer/src/screens/risk/**`, `src/renderer/src/screens/forecast/**`,
  `src/renderer/src/screens/reports/**`, `src/renderer/src/screens/security/**` (except `AuditLogTab.tsx`).
- **Must (4D, 4E, 4F):** Risk — every client scored out of 100 from reasons that can each be
  checked and opened (overdue deadlines, open issues, missing AML or engagement letter, missing
  or expiring authorisations, Companies House red flags); Forecast — deadlines by month, kind of
  work and person, tasks and work in progress, billing expected from service fees, money
  received and falling due, with charts following the dataviz rules and the assistant's
  briefing when available; Reports — practice report with real figures and Export PDF naming
  the licensed firm; Security — overview of database, licence, backups, recovery sheet, vault and
  audit log saying first what needs a look, sign-in history, who can sign in, the audit log tab.
- **Port:** `project/src/main/records/{risk,forecast,practice-report,security}.ts`,
  `project/src/main/ipc/{oracle,fortress,reports}.ts`, `project/tests/records/{risk,forecast,practice-report,security}.test.ts`.

### integrations — Companies House and the assistant
- **Owns:** `src/shared/contracts/integrations.ts`, `src/main/integrations/**`, `src/main/ipc/integrations.ts`,
  migrations `1200`–`1299`, `src/renderer/src/screens/assistant/**`,
  `src/renderer/src/screens/settings/{CompaniesHouseSection,AssistantSection}.tsx`.
- **Must (4D, 4E):** Companies House REST (search, profile, officers, PSCs, filing history) with the
  firm's own API key, a daily check of every live client company two minutes after start, the
  optional stream with its own key that resumes after restart and sleep; updates recorded in the
  audit log as the system; the assistant — checks Ollama is installed, running and has the model,
  with the steps for this computer if not, a partner or manager can download the model in the
  app, chat with look-ups that work, briefings on Forecast and the client file, never given a
  client's tax references, NI number or codes, plain errors; reached from the title bar.
- **Port:** `project/src/main/records/ch-watch.ts`, `project/src/main/services/ch-watch.ts`,
  `project/src/main/system/{local-ai,tool-call}.ts`, `project/src/main/ipc/ai-chat.ts`,
  `project/src/main/records/ai-context.ts`, tests in `project/tests/{foundation,records,services}/*`.

### release — packaging and release documents
- **Owns:** `electron-builder.yml`, `build/**`, `scripts/release/**`, `.github/workflows/**`,
  `src/main/app/menu.ts`, `docs/{INSTALLING,RELEASING,USER-GUIDE,ADMIN-GUIDE}.md`, `docs/legal/**`.
- **Must (L5, L7):** NSIS x64 per-user installer with desktop and Start-menu shortcuts; uninstall
  keeps the data unless "remove my data" is ticked; unsigned for now with the signing step present
  and off; manual updates by full installer that keeps the data; a 1024 × 1024 PNG icon with
  `.ico` and `.icns` generated; `build/entitlements.mac.plist` and notarisation through
  environment variables, the macOS job present and off; Electron fuses (run as node off,
  NODE_OPTIONS off, inspect off, asar integrity on, only load from asar); the app menu without
  Reload or developer tools when packaged; a GitHub Actions workflow on a Windows runner (typecheck,
  test, build, installer, checksums); a Linux-hosted Windows build script for an unsigned test
  installer; the asar tamper check; release checksums; INSTALLING (SmartScreen steps), RELEASING,
  user guide, admin guide, EULA and privacy notice drafts (for a solicitor's review), Companies
  House API key instructions.
- **Port:** `project/electron-builder.yml`, `project/build/*`, `project/scripts/*`,
  `project/.github/workflows/build.yml`, `project/src/main/{app-menu,menu-template}.ts`,
  `project/docs/{INSTALLING,RELEASING}.md`, `project/tests/packaging/*`.
