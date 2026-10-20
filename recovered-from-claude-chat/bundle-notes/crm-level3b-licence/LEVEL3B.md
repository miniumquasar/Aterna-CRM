# Level 3B — licence hardening

This bundle makes the licence usable and hard to abuse. Each key names your firm and says which days it covers. The firm's name shows throughout the app and on reports. A licence that ends gets 3 days' grace, then the app becomes read-only. The installed app refuses to start if its code has been edited.

How licensing works, and the vendor runbook for issuing, renewing, replacing and withdrawing keys, are in `docs/LICENSING.md`.

## Install

Apply after Level 3A, from the repo root. There are no files to delete.

1. Close the app.
2. Copy `src/`, `tests/`, `tools/`, `scripts/`, `docs/`, `electron-builder.yml` and `package.json` from this bundle into the repo, replacing what is there. That is 33 changed files and 8 new ones.
3. Run `npm install`. No packages were added or removed; `package.json` lost its `build` section and gained the product name.
4. Run `npm run build`, which runs typecheck, lint, all tests and the production build.

`review/level3b-changes.patch` is the whole change as one diff, for reading. It is **not needed to install**.

### The first start afterwards

**The data folder becomes "AETERNA CRM"** (on Windows, `%APPDATA%\AETERNA CRM`).
- On the first start, the database, its key file, the backups and the stored documents are **copied** there from `companies-house-crm`.
- Records of stored documents are pointed at the new copies.
- The old folder stays as it was, with a note saying where the data went. Delete it once you're happy.

Your trial or licence carries over.

This was planned for Level 5. It is done now so the copy you run while developing and the installed app use the same folder.

## You: set up licence keys (once)

Do this on the computer you will issue licences from. Until it is done, the app can't check licence keys; the Licence screen says so.

1. `npm run licence -- init`, and choose a passphrase of at least 12 characters.
2. **Back up the folder `~/.aeterna-licensing`.** Put copies in two offline places, such as two USB drives kept apart. Keep the passphrase separately, in a password manager and on paper. Without both you can't issue keys the app accepts.
3. `npm run licence -- trust-file --write src/main/licence/public-keys.ts`. This puts your public key into the app. Commit it, then build.
4. Try it on a test firm:
   1. `npm run licence -- issue --firm "Test Firm Ltd"`.
   2. Enter the key on a test PC.
   3. `npm run licence -- revoke --serial 1 --reason "test"`.

Before every release, run step 3 again. That ships the current list of withdrawn keys.

## What changed

### Keys
- **Each key names the firm.** It is about 170 characters, depending on the name; dashes, spaces and line breaks don't matter. The firm's name, the dates and every other field are signed, so changing one character breaks the key.
- **Each key says which days it covers.** A renewal starts the day after the current licence ends, so renewing early loses nothing. A new PC needs only the current key, and the same key gives the same answer on every PC. (Before, a key's start depended on the other keys on that PC.)
- **Replacing a key for a change of name** gives the same dates and no extra time. The old key is withdrawn at the next release.
- Keys in the first format (128 characters, no firm name) are refused with a message asking for a replacement. None were issued: the app had no public key until now.

### Grace and read-only
- **3 days' grace after a licence ends.**
  - Everything keeps working.
  - A banner and a daily desktop notification give the date it becomes read-only.
  - The Licence and About screens say the same.
- **After the grace, the app is read-only**, as before: everything stays viewable and exportable. The free trial still has no grace.

### The licence state
- **One more copy, outside every app folder.** The licence state is now also kept in:
  - Windows: the registry (`HKCU\Software\Bitopi\AETERNA CRM`)
  - macOS: the Library
  - Linux: the state folder

  Deleting the app's data, or reinstalling, doesn't restart the trial.
- **Copies are written only when they change.** Before, every check rewrote them; now the latest time seen is kept to the hour.

### The firm's name, everywhere
- **Where it shows:**
  - the title bar, the window's title and the sidebar ("Licensed to Firm Ltd", or "Free trial");
  - the About and Licence screens;
  - every page of the practice report PDF;
  - the client export's file name.

  Another firm using your key would see your name everywhere.
- **About** is a new screen, opened from the version line at the foot of the sidebar. It shows:
  - the version;
  - whose licence it is and until when;
  - the machine code;
  - the support email and phone;
  - a button that copies these details for a support message.

### Reports
- **Reports shows real figures only:** clients, deadlines in the next 90 days, money owed by days past due, the clients owing most, and open work. Staff see their own clients.
- **Before, it showed made-up numbers.** The onboarding trend, "Avg Completeness 78%" and "Staff Capacity 62%" were invented, and the Export PDF button did nothing.
- **Export PDF** saves the same figures as an A4 report. It has your practice's name, and "AETERNA CRM · Licensed to …" and page numbers on every page. Exporting works in read-only mode too.

### The vendor tool
- **New commands:**
  - `renew --serial N` — starts the day after the current licence ends;
  - `replace --serial N --firm "New Name"` — for a change of name;
  - `revoke --serial N --reason …`;
  - `show --serial N` — the key and the message again, for a firm that lost it;
  - `trust-file` — writes `public-keys.ts`.
- **Every key comes with a message to email the firm**, with the instructions.
- **The register** links a firm's keys together, so renewals keep their date after a change of name. Lines written by the first version are still read and checked.

### Tamper protection
- **One packaging configuration.** `package.json` had a `build` section that made electron-builder ignore `electron-builder.yml`, so the anti-tamper switches there never reached a build. The section is gone. `electron-builder.yml` is now the only configuration:
  - name AETERNA CRM, app ID `uk.co.bitopi.aeternacrm`;
  - all the switches on, including the archive integrity check;
  - only the built app packed: no sources, tests, documents or vendor tool;
  - no `example.com` update address.
- **`scripts/asar-tamper-check.mjs` checks a real build.** It starts the untouched app in a test mode that stops before any data is opened. Then it edits one byte of a copy and confirms the copy refuses to start.

## Verified here

- `npm test`: 241 of 241, including the real workbook. There are 28 new tests, covering:
  - the key format;
  - the dates each key covers;
  - renewals, replacements, grace and expiry;
  - the copy outside the app's folders, including in the registry;
  - writes only on change;
  - the vendor tool end to end: init, issue, renew, replace, revoke, show, list and trust file, with the app accepting the keys and refusing withdrawn ones;
  - the practice report figures for partners and for staff, with everything escaped on the page;
  - the packaging settings, and the tamper script's archive edit.
- Both typechecks: 0 errors. Lint: 0 errors (82 warnings).
- A build with these settings has every switch set.
  - **Linux build:** the fuses are flipped as configured, and the untouched app starts.
  - **Windows build, made here:** `AETERNA CRM.exe` has the integrity check switched on. It carries the archive's fingerprint, which matches the archive. The archive holds only the built app.
- The built app, run in a real Electron window on Linux, against a data folder left by the Level 3A build:
  - the data was copied into "AETERNA CRM" and the old folder kept, with its note;
  - the earlier partner signed in, with clients and documents intact, and the documents were pointed at the new folder;
  - the title showed "Free trial";
  - a key from the vendor tool was entered, and the title, title bar, About and Licence screens showed "Licensed to Made Up Accountants Ltd";
  - the copy outside the app's folders was written;
  - Export PDF saved a one-page A4 report with the licensed firm in the heading and the footer;
  - the Level 3A checks all still passed.

## Not verified here

- **The tamper test on Windows.** Linux has no archive integrity check, so the edited copy can't be refused here. Please run on Windows:

  ```
  npm run build:unpack
  node scripts/asar-tamper-check.mjs release/win-unpacked
  ```

  It should end with `PASS`.
- The registry copy on a real Windows PC. It is tested here against a stand-in for `reg.exe`.
- The upgrade on your own data folder, and running on Windows.

## Moved in the plan

- **Done early, from Level 5:**
  - the rename and its data move;
  - the single packaging configuration;
  - the removal of `example.com`.
- **Added to Level 4's consistency pass: styling on the older screens.** Many of them use colour names (card, muted, primary) that the app's theme doesn't define, so those styles do nothing. The new Reports screen uses the theme's own colours.
