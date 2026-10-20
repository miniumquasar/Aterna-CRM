# CRM v5 — release plan

Oct 6, 2026 · @Arif

## How to use this plan

Seven levels stand between today's code and a public Windows release, with Mac set up but not built. I build Levels 1 to 4 and 7 in thirteen bundles; Level 5 needs a Windows PC or runner for the build, and Level 6 is a pilot at your practice.

Tick a task when its bundle is installed and its check passes. Tasks starting **You:** need you: a purchase, a decision, or a test on real hardware.

Already done: the import engine, licensing, database safety, packaging fuses, foreign keys, onboarding gaps, references and the vault, the workbook passwords, and the data model (143 tests passing).

## Decisions recorded

Your answers to the audit, item by item, and what each means for the build.

| Item | Your answer | What happens |
| --- | --- | --- |
| `index.ts`, `ipc/auth.ts`, `ipc/backup.ts` (never uploaded) | Build them from scratch | Written new against the current preload contract |
| Encryption service | Rewrite on Node's built-in crypto; convert existing values | AES-256-GCM, key wrapped by the OS keychain; one-time conversion of old values |
| 17 channels with no handler | Build anything not found | Handlers for users, sign-out, passkeys, backups, system, crash reports, development and AI analysis |
| Main-process typecheck | Yes | Fix `settings.ts`; delete `did-manager` and `vc-issuer` |
| `index.ts` start-up | Yes | Single-instance lock, Windows app ID, every real handler group registered |
| Phase-9 experimental code | Remove DID and ZK handlers | DID and ZK go first; on 6 October you chose to remove the rest too, with all six tables |
| Pulse, Sentinel, Oracle, Fortress | Implement them | Live activity, risk, forecast, and security centre screens |
| Dead and heavy UI | Remove | Unused files and 3D packages go; short splash; hardware tier moves to Settings |
| 26 unused API members | Keep and plan their use | Each mapped to a screen (section below) |
| Silent events | User checks periodically; eye-catching highlight | Periodic checks raise a highlighted badge, a toast and a notification centre |
| Level 3 | Fix all; licence usable and loophole-resistant | Seven tasks plus a licence policy |
| Level 4 | Fix all | Twelve tasks |
| Level 5 | Build for Windows now; keep Mac provisioned | Windows installer pipeline now; Mac configured, not built |
| Level 7 | Build them | Every release document drafted |
| This plan | Yes, plan first | This doc |

## Release decisions

All eight are made (6 October); the rest of the plan follows them. One is still open inside them: the refund policy.

- [x] **Name:** AETERNA CRM, app ID `uk.co.bitopi.aeternacrm` (from your bitopi.co.uk domain; say if you want another). The data folder becomes "AETERNA CRM".
- [x] **Signing:** none for now. Windows will show a SmartScreen warning ("More info", then "Run anyway"); the user guide explains it, and the signing step stays ready for later.
- [x] **Updates:** manual download. Each release is a full installer that replaces the app and keeps the data.
- [x] **Licence:** one per firm, on any number of the firm's PCs; £175 a year; 3 days' grace after expiry, then read-only. Refunds not yet set.
- [x] **Email:** opens in the PC's mail app by default. SMTP, Microsoft 365 and Resend stay as optional settings, off by default.
- [x] **Experimental features:** all removed (singularity, VC plugins, homomorphic analytics, CoreML, Merkle ledger, vision), as well as DID and ZK, with all six experimental tables.
- [x] **Support:** info@bitopi.co.uk, 07555 221010, and a support form in the app and on the download page.
- [x] **Legal texts:** I draft the EULA and privacy notice as fully as I can; you review them with a solicitor later.

## Build order

Thirteen bundles, in this order, then the pilot; each bundle ships with tests and install steps like the ones so far.

1. **Foundation**: `index.ts`, `auth.ts`, `backup.ts`, the encryption rewrite, conversion and recovery sheet, the 17 missing handlers, DID and ZK removal, typechecks at zero, tests and lint inside the app. (Level 1; Level 2 removals)
2. **Shell clean-up**: dead UI and 3D packages removed, short splash, hardware tier in Settings. (Level 2; the grouped sidebar came in 4A, the notification centre came in 4D)
3. **Access and integrity**: staff scoping, role checks on deletes, audit with previous values, client assignment, money in pence, logins into the vault, the NINO kept once. (Level 3)
4. **Licence hardening**: the policy, loophole defences, vendor key set-up and revocation workflow. (Level 3 licence)
5. **Email and backups**: SMTP, Microsoft 365 and mail-app sending; backup and restore end to end, with scheduled backups. (Level 3)
6. **Navigation, Home and first run**: the grouped sidebar with tabs, an honest Home, Go to…, the setup wizard and the Import screen. (Level 4, bundle 4A)
7. **People and assignment**: inviting, changing roles and removing people, signing out after a chosen idle time, assigning clients in bulk, "My clients", and the deadline list by person. (Level 4, bundle 4B)
8. **Edit flows and communications**: invoices, work in progress, HMRC submissions and AML checks changed after they are made; deadlines marked filed; the Client file's deadlines, contacts and issues; services, partners and trustees; one Communications screen for messages and calls. (Level 4, bundle 4C)
9. **Pulse, Sentinel and notifications**: the bell, the notifications list, toasts and desktop notifications; every client scored for risk, with its reasons; Companies House kept up to date by a daily check and the stream. (Level 4, bundle 4D)
10. **Oracle, Fortress, and the AI assistant check**: Forecast, for the deadlines, work and money in the months ahead; Security, with the audit log sealed against changes and the vault passphrase changeable; and the assistant checking it can run, with the steps when it can't. (Level 4, bundle 4E)
11. **Registers, consistency and help**: the Client file's payroll, pensions, Self Assessment, links and other names edited; one count of deadlines everywhere; Calendar and Tasks; the app's own dialogs, labels, contrast and keyboard use throughout; guides and a support form. (Level 4, bundle 4F)
12. **Windows packaging**: name, icons, `build/` folder, unsigned installer (signing step ready for later), Windows CI; Mac configured. (Level 5)
13. **Release documents**: EULA, privacy notice, sales and renewal process, download page, support, guides, Companies House key instructions. (Level 7)

Then the pilot at your practice (Level 6) gates the public release.

## Level 1: build from a clean checkout

This level makes `npm ci` followed by `npm run build` succeed; nothing else can be tested on a real build until it does.

- [x] Write `src/main/index.ts`: single-instance lock, Windows app ID, and a locked-down window (context isolation, sandbox, no Node in the page, blocked navigation and pop-ups, external links only to an allow-list).
- [x] One fixed start-up order for everything, each step logged, with a clear message on screen if a step fails:
  1. Single-instance lock and app ID.
  2. Data folder, moving any data left by earlier builds.
  3. Database: key, open, migrations.
  4. One-time conversion of old encrypted values.
  5. Licence.
  6. Every handler group.
  7. Wiring report: any channel without a handler.
  8. Main window.
  9. Background jobs: deadline checks, Companies House checks, scheduled backups, licence reminders.
- [x] Write `src/main/ipc/auth.ts`: username and password sign-in only; sign-out, sessions, roles, invites, and the four `users:*` channels; lockout after repeated failures. Passwords hashed with scrypt (Node's built-in crypto) instead of argon2: no native module to build for each platform.
- [x] Remove the passkey channels (`auth:webauthnRegister`, `auth:webauthnLogin`), and `speakeasy` if nothing else uses it.
- [x] Write `src/main/ipc/backup.ts`, and rewrite `services/backup.ts` without `age-encryption`: create, list, restore, delete and stats.
- [x] Rewrite `services/encryption.ts` on Node's built-in crypto (AES-256-GCM) with nothing tied to the OS keychain or Windows Hello. The key lives in the app's key file beside the database, as the database key already does. Remove `@noble/post-quantum`, `snarkjs`, and the keychain-wrapped key kept in `electron-store`.
- [x] Convert values encrypted under the old scheme, once, at start-up, with a log entry and a rollback copy.
- [x] Recovery sheet for the encryption key: save it as a PDF and print it. Partners only, with their password re-entered; the key never appears in any log.
  - Offered the moment the first partner account exists, at a partner's first sign-in after an upgrade, and again whenever the key changes. A banner stays until it is saved or printed.
  - The sheet shows the firm, this install, the date, and the key in short groups with check characters, so a typing mistake is caught.
  - A restore on a new PC accepts the key typed from the sheet, printed or saved as a PDF; the same key unlocks a database whose key file was lost. Built in Level 3C.
- [x] Build `system:ping`, `system:get-app-version`, `crash:send` (saved on the PC; nothing sent anywhere), `dev:get-first-user` (development builds only) and `ai:analyze` (local Ollama).
- [x] Fix the type error in `settings.ts`; delete `did-manager` and `vc-issuer`; both typechecks at zero.
- [x] Every test in the app: the 25 files (143 tests) as `npm test`, new tests with each bundle, and a lint step, all run inside `npm run build`. The real-workbook tests run when you give the workbook's path; the workbook itself never goes in the repository.
- [ ] **You:** run `npm ci` then `npm run build` on your Windows PC and confirm it completes, with Level 2 applied: it adds two packages Level 1 missed.

## Level 2: remove what shouldn't ship

Every experimental feature goes with its tables, and so does the dead and heavy UI.

- [x] Remove the DID and ZK handlers (`user:didCreate`, `user:zkPresentCredential`) and the `did-manager`, `vc-issuer` and `zk-oracle` services. Done in Level 1.
- [x] Remove `user:vcIssue`, which needs `vc-issuer`; check `user:revokeAccess` and remove it if it only revokes credentials. Done in Level 1, with the rest of the user handlers.
- [x] Remove singularity, VC plugins, homomorphic analytics, CoreML, Merkle ledger and vision: their handlers, services and anything on screen that calls them.
- [x] Drop all six experimental tables in one migration: `dids` (it has a plain-text private-key column), `zk_sessions`, `verifiable_credentials`, `verifiable_plugins`, `homomorphic_shares` and `merkle_dag`.
- [x] Delete `SpatialDashboard` and `AetherDataLakeModal`, which render nowhere.
- [x] Replace the full-screen launch animation with a short splash: under a second, skippable, and off under reduced motion.
- [x] Move the hardware-tier toggle into Settings, under Appearance.
- [x] Remove `three`, `@react-three/drei` and `@react-three/fiber` and the effects that need them; keep light 2D effects with a low-power fallback. Eleven other unused packages went too, including electron-webauthn-mac, which could stop a Windows install.

## Level 3: security, data integrity and the licence

Real client data goes in only after these tasks. The licence policy closes what an offline key can close, and says plainly what it can't.

- [x] Staff scoping on `clients:get` and the shared handlers for tasks, invoices, WIP, interactions and HMRC submissions: staff see and change only their own clients' records.
- [x] Role checks: only partners delete records the practice must keep (invoices, receipts, HMRC submissions, AML records, documents, WIP).
- [x] Every update logged with its previous values, not only the new ones.
- [x] Client assignment: assign one client or many, with their deadlines and services, to a member of staff.
- [x] Money in whole pence across the five decimal columns, with the invoicing code changed in the same bundle.
- [x] Move the older `logins` rows into the vault as flagged logins, then retire the table; keep the NINO once, encrypted.
- [x] Email opens in the PC's mail app by default; SMTP, Microsoft 365 and Resend are optional settings, off by default. Done in 3C: Microsoft 365 sends through Microsoft Graph after a browser sign-in, since Microsoft is retiring password sign-in for SMTP; every email to a client is recorded with who it went to and whether it was sent.
- [x] Backup and restore end to end: encrypted database and key file, scheduled backups, a test restore, and guidance on storing the vault passphrase. Done in 3C: every backup holds the stored documents too, never the key; a new PC restores from the backup and the recovery sheet, and a lost key file is unlocked with the sheet.

### Licence policy

- **Who:** one licence per firm, on any number of the firm's PCs.
- **Price:** £175 a year.
- **Trial:** 60 days, every feature, from first run.
- **Keys:** offline and signed (Ed25519); each names the firm and its term, and changing one character breaks the signature. The firm's name shows in the app and on every report and export, so a shared key is visible.
- **Renewal:** adds a full year from the current expiry, never from the payment date, so renewing early loses nothing.
- **Warnings:** a reminder banner from 30 days before expiry.
- **After expiry:** 3 days' grace with a banner, then read-only. Everything stays viewable and exportable; nobody is locked out of their own data.
- **New or extra PCs:** the firm enters the same key; nothing to transfer.

### Loophole defences

| Loophole | Defence | What it can't stop |
| --- | --- | --- |
| Setting the clock back | The latest time ever seen is sealed; an earlier clock freezes the licence until corrected | A clock set back before the first install |
| Deleting app data or reinstalling to restart the trial | Trial state sealed in three places, plus a marker outside the data folder | A new PC or a fresh operating system |
| One firm's key used by another firm | The licensed firm's name shows throughout the app and on every report and export; revocation when found | An offline app can't tell who is using it; enforcement is by contract |
| Forging or editing a key | Every field is covered by the signature | Nothing, while the signing key stays private |
| Patching the app or swapping its public key | Asar integrity check and loading only from the app's own archive (code signing adds more, once used) | A determined cracker can still patch an offline binary; this raises the cost |
| Leaked or refunded keys | Revocation list shipped in every release | PCs that never install a new release |
| Rewinding a virtual-machine snapshot | Nothing offline can detect it | Accepted risk |
| Debugger or injected Node options | Electron fuses already block them | Nothing further needed |

- [x] Trial marker outside the app's data folder (Windows registry; macOS Library).
- [x] Asar integrity validation on, with a test that a modified archive refuses to start. Done in 3B; the check needs one run on Windows (docs/LICENSING.md §7).
- [x] The firm's name from the key shown in the title bar, About, reports and exports.
- [x] Replacement keys in the vendor tool for a firm that changes its name, with the old key revoked in the next release.
- [x] 3 days' grace after expiry, then read-only.
- [ ] **You:** run the vendor `init`, paste the public key into the app, and keep two offline backups of the signing key. The tool is ready; the steps are in docs/LICENSING.md §4.
- [x] Vendor runbook: issue, renew, transfer, refund and revoke; back up and rotate the signing key.

## Level 4: the UX a practice needs

Fourteen tasks turn the screens into a working practice tool, with Pulse, Sentinel, Oracle and Fortress built as real screens instead of placeholders.

- [x] First-run setup, in this order: firm details, first partner account, the recovery sheet (save and print the encryption key), the vault passphrase with its one chance to print (it is never stored), trial or licence key, and the master workbook import; it resumes if closed halfway. Done in 4A, with an Import screen (Settings → Import) and undo for the latest import.
- [x] User management: invite, change role and remove; a visible sign-out; automatic sign-out after a chosen idle time. Done in 4B: Settings → People (invites with cancel, roles, access off, unlock, reset, remove), sign-out after 30 minutes by default with a warning, and Change password for everyone.
- [x] Client assignment screens: bulk assign from the client list, a "My clients" filter, and the deadline worklist by person. Done in 4B: tick boxes and an assign bar, "Looked after by", and Compliance → Deadlines; Home's deadline figures now use the same list.
- [x] Edit flows: update invoices, WIP and HMRC submissions; screens for partners and trustees; save AML records; remove a client service. Done in 4C: invoices (numbered, then open, paid or cancelled), work in progress, HMRC submissions and AML checks change from their screens, and logging a submission can close the deadline it files; deadlines are marked filed or not needed; the Client file edits deadlines, contacts and data issues; the client's panel edits services, partners, LLP members and trustees; the main process checks each kind of record before saving.
- [x] Register editing on the Client file: payroll and pension schemes, the self assessment registration, linked clients and other names. Done in 4F: PAYE schemes and a line for each tax year; workplace pensions, whose duties start date keeps the re-declaration deadlines in step (added, moved, archived and brought back); the Self Assessment registration and sources of income; links read from both sides; and other names, which Go to… and every client picker find. Every change is in the audit log.
- [x] Wire the unused API members to their screens in "Unused API: where each goes" below, as each screen is built here. Moved from Level 2, which wired crash reports. Level 3 wired the app version (sidebar and About) and the receivables summary (Payments); 4A and 4B wired sign-out, the session and people; 4C wired the registers, partners and trustees, the three updates, AML saving, removing a service, and templates and suggestions. 4D wired ping and setStreamEndpoints, and replaced onDeadlineAlert and onCHStreamEvent with notifications and the Companies House changes. 4E replaced the last, analyzeWithAI, with ai.summarise for the briefings on Forecast and in the Client file, so none is left.
- [x] Notifications: the deadline scheduler and Companies House checks run periodically and raise alerts as a highlighted sidebar badge, a toast, and a notification centre the user works through and marks done. Done in 4D: a bell and Activity → Notifications for each person, with toasts, desktop notifications and one summary for many. Deadlines come from the open-deadline list of 4B, so they match Home and Deadlines, and the app marks a notification done when its subject is dealt with. The old deadline scheduler, whose alerts reached no screen, is gone.
- [x] Navigation: about 12 plain-language entries in groups (Work, Clients, Compliance, Practice, System); Interactions and Comms Hub merged into Communications; the Client file opened from the client list and record. Done in 4A with 14 entries and Go to… (Ctrl K); Interactions and Comms Hub were tabs under Communications until 4C made them one screen, Conversations, beside Templates.
- [x] AI assistant: check whether Ollama is installed and running; if not, explain how to install it instead of failing. Done in 4E: before anything else the assistant checks that Ollama is installed, running and has the model, and says what to do on this kind of computer; a partner or manager can download the model from inside the app. It also writes the briefings on Forecast and in the Client file, which are never given a client's tax references, NI number or codes.
- [x] Consistency pass: empty, loading and error states everywhere; full keyboard use; screen-reader labels; reduced motion; updated help. Done in 4F: the app's own question dialog in place of 47 browser boxes; every dialog keeps the keyboard inside and the screen behind out of reach; a name for every button and field; text raised to readable contrast (axe-core finds no WCAG 2.2 A or AA problem on any of the 29 screens); a skip link; movement that follows the computer's setting while the app is open; a message and Try again wherever a screen can't read what it needs; About and help with guides, What's new and the support form. Reports now counts the same deadlines as Home and Deadlines, and the postal-code box sits beside its buttons. Calendar and Tasks were rebuilt on the way.
- [x] **Pulse** (live activity): today's changes (imports, edits, filings, deadlines), Companies House changes for your clients (filings, officers, PSCs, status), and system health (database, backups, licence). Done in 4D as Activity → Today, with a daily Companies House check of every client company and the optional stream, which needs its own key.
- [x] **Sentinel** (risk): clients ranked by risk from overdue deadlines, open data issues, missing AML or engagement letter, missing or expiring authorisations, and Companies House red flags such as strike-off notices. Done in 4D as Risk: a score out of 100 from reasons that can each be checked and opened, with gaps across the whole practice shown once.
- [x] **Oracle** (forecast): deadlines and workload by month and by person, expected fees and WIP, a cash view from invoices and receipts, and an optional summary from the local AI. Done in 4E as Practice → Forecast: deadlines by month, kind of work and person; tasks and work in progress; billing expected from the fees on clients' services, to the penny; money received and falling due, worked out as in Billing; and the assistant's briefing, with exactly what it was given.
- [x] **Fortress** (security centre): users and roles, sign-in history, the vault (change passphrase, lock), the encryption key's recovery sheet (save or print again), backups, the audit log, and licence status. Done in 4E as System → Security: an overview of the database, licence, backups, recovery sheet, vault and audit log that says first what needs a look; changing the vault passphrase, with every stored secret sealed again at once; who can sign in and sign-in history; and the audit log, now sealed with a hash chain so a change made outside the app shows, with filters and a CSV export.

## Unused API: where each goes

21 of the 26 stay and each lands on a screen in Levels 3 and 4. Passkey registration goes, since sign-in is username and password only; getEmailTemplate went in 4C as a duplicate of templates.get; onDeadlineAlert and onCHStreamEvent went in 4D, replaced by notifications.onChanged and pulse.onCompaniesHouseChange; and analyzeWithAI went in 4E, replaced by ai.summarise.

| API member | What it does | Where it will be used |
| --- | --- | --- |
| `logout`, `auth`, `user` | Sign-out, session, current user | Sign-out in the sidebar footer (4A); Change password and the sign-out notice (4B); user replaced by people, wired to Settings → People (4B); Security → Overview, your account and who can sign in (4E) |
| `webauthnRegister` | Register a passkey | Removed: sign-in is username and password only |
| `devGetFirstUser` | First user in development | Development builds only |
| `getAppVersion`, `ping` | Version and health check | Version: the sidebar and About (wired in Level 3); ping: Activity → Today, the This computer tile (wired in 4D) |
| `sendCrashReport` | Crash report | Error screens: saved on the PC, "copy for support" |
| `analyzeWithAI` | Local AI analysis | Replaced in 4E by ai.summarise: the briefings on Forecast and in the Client file |
| `getARSummary` | Receivables summary | Payments (wired in Level 3). Forecast's Money in (4E) uses the same receivables rules, worked out in the main process with the rest of the forecast |
| `onDeadlineAlert` | Deadline events | Replaced in 4D by notifications.onChanged: the bell, the list and toasts |
| `onCHStreamEvent`, `setStreamEndpoints` | Companies House changes | onCHStreamEvent replaced in 4D by pulse.onCompaniesHouseChange (Activity → Today); setStreamEndpoints wired in Settings → Companies House API (4D) |
| `registers` | Practice registers | Client file: deadlines, contacts and data issues edited (4C); payroll, pensions, self assessment, links and other names (4F). getWorklist went in 4C; deadlines.list replaces it |
| `getPartnershipMembers`, `savePartnershipMembers` | Partners | Client's panel, Partners or Members tab (wired in 4C) |
| `getTrustMembers`, `saveTrustMembers` | Trustees and beneficiaries | Client's panel, Trustees tab (wired in 4C) |
| `updatePayment`, `updateWipItem`, `updateHmrcSubmission` | Edit existing records | Invoices, Work in progress and HMRC screens (wired in 4C) |
| `upsertAmlRecord` | Save an AML record | AML checks, Compliance → HMRC and AML (wired in 4C) |
| `deleteClientService` | Remove a service | Client's panel, Services tab (wired in 4C) |
| `getEmailTemplate`, `templates`, `comms` | Templates and messages | Communications (wired in 4C). getEmailTemplate went as a duplicate of templates.get; comms.suggestTemplate now works from the client's records |

## Level 5: Windows build now, Mac ready

The Windows installer is built and signed on a Windows machine or runner; Mac stays configured, ready to build once you have an Apple developer account.

- [x] Rename to AETERNA CRM (`uk.co.bitopi.aeternacrm`); the first run moves any data left by earlier builds into the new folder. Done early, in Level 3B; the package name and author in package.json still say Companies House CRM, for this level.
- [ ] App icon as a 1024 by 1024 PNG (today's file is a JPEG), with `.ico` and `.icns` generated from it.
- [ ] `build/` folder: Windows installer images, `entitlements.mac.plist`, and notarisation settings.
- [ ] Windows installer (NSIS, x64): per-user install, desktop and Start-menu shortcuts; uninstall keeps the data unless the user ticks "remove my data".
- [ ] Unsigned for now: the signing step stays in the build, switched off, and the user guide shows the SmartScreen steps.
- [ ] Manual updates: each release is a full installer that upgrades in place and keeps the data. The `example.com` update address goes (gone since Level 3B); Help shows the version and links to the download page.
- [ ] Build script and a GitHub Actions workflow on a Windows runner (the native modules can't be built for Windows from Linux or Mac).
- [ ] **You:** install, upgrade and uninstall on Windows 10 and 11, confirming the data survives an upgrade.
- [ ] Mac provisioned: hardened runtime, entitlements, notarisation through environment variables, and a macOS job in the workflow, switched off until needed.
- [ ] Later, optional: a code-signing certificate to remove the SmartScreen warning.

## Level 6: prove it

A pilot on your own practice's data gates the public release.

- [ ] Checks on every change: typecheck, tests, lint, the Windows build, and a launch smoke test (Playwright for Electron).
- [ ] Performance with 940 clients on a modest PC: start-up time and the largest lists measured, and fixed where slow.
- [ ] Drills: restore on a new PC from only a backup and the printed recovery sheet, licence expiry and renewal, and a lost vault passphrase (the documented outcome).
- [ ] **You:** two to four weeks of pilot use at Dynamic Accountants on the real workbook, with the issues found fixed before release.

## Level 7: release essentials

I draft every document; the EULA and privacy notice need a solicitor's review before release.

- [ ] EULA.
- [ ] Privacy notice: everything stays on the PC; company searches go to Companies House; email goes through the provider the firm chooses; the AI runs locally through Ollama.
- [ ] Licence sales and renewal process: quote, payment, key issue, renewal reminders, transfers, refunds and revocation.
- [ ] Download page (a static site): versions, checksums, system requirements and release notes.
- [ ] Support: info@bitopi.co.uk and 07555 221010, with a support form in the app (done in 4F: About and help writes the email, with this copy's details if wanted, for the PC's mail app) and on the download page.
- [ ] User guide and admin guide: installation, backups, users, the vault and the licence.
- [ ] Companies House API key instructions: how a firm creates its own key and enters it in Settings.
- [ ] **You:** solicitor review of the EULA and privacy notice, later, before the public release.

## Kept in mind for later

Found while building and left on purpose, each with where it goes. Tick one when it is dealt with.

- [ ] You: one rule for a reference that fails its check. The Client file's registers refuse a PAYE reference, Accounts Office reference or UTR that fails; the client edit dialog saves it with a note. Refuse everywhere, or save and flag everywhere as the import does.
- [ ] You: older client statuses. Clients given Onboarding, Inactive or Ceased by earlier versions keep them, marked as older, and Ceased ones still count as live. A one-off tidy could map them (Ceased to Former client, Inactive to Dormant, Onboarding to Prospect), in the audit log. Level 6, with the pilot data.
- [ ] The older screens' own look: Settings → General, the email templates editor, the assistant and Companies House meet the contrast level and name every control, but keep their own colours and panels. Restyle after the pilot.
- [ ] The Reports charts: eight cycled colours not checked for colour-blind readers, and no table view. Bring them to Forecast's rules. Level 6.
- [ ] Pasting clients from a spreadsheet skips the import's checks. Route pasted rows through them, or keep it for short lists. Level 6.
- [ ] The application menu is Electron's default, with Reload and Toggle Developer Tools in the packaged app. Level 5.
- [ ] Your workbook's data: 337 overdue deadlines (the oldest 651 days late), and no person, fee or invoice on any client. The pilot (Level 6).
- [ ] 26 lint warnings in older files, cleared as each is next changed.
- [ ] axe-core runs in the smoke test only; add it to the checks on every change. Level 6.
- [ ] The Clients screen is one file of 1,500 lines; split it when it is next changed.

## What can't be verified here

Five things need real hardware, accounts or a first run; everything else ships with tests.

- **Real builds:** Windows and Mac builds can't run in my sandbox, because the native modules must be built on each operating system. Your PC or the CI runner does that.
- **Signing:** none for the first release, so Windows shows a SmartScreen warning; a certificate can be added later without other changes. Mac notarisation needs an Apple developer account.
- **Cracking:** an offline licence can still be cracked by patching the binary; the defences raise the cost, they can't make it impossible.
- **Passkeys:** not used. A risk to watch instead: with no OS keychain, the encryption key sits in a file beside the database, readable by anyone signed in to that Windows account. The locked office and PC are what protect it, and the printed recovery sheet is just as sensitive: keep it sealed and locked away.
- **Old encrypted values:** reading them may need the old libraries once. Anything that can't be read is listed for re-entry, never dropped silently.

One version risk to watch: `vite` 8 with `electron-vite` 5 is confirmed only by a clean install and build (the first "You" task in Level 1).
