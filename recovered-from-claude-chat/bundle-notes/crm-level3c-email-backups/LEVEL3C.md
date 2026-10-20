# Level 3C — email and backups

This bundle finishes Level 3.

**Backups** now hold the database and every stored document, encrypted. They run on a schedule, can go to another drive, and can be test-restored without touching anything. They restore on the same computer or on a new one from the backup and the printed recovery sheet.

**Email** still opens in the computer's mail app by default. SMTP, Microsoft 365 and Resend can be switched on in Settings. Every email to a client is recorded.

The guides are in `docs/BACKUPS.md` and `docs/EMAIL.md`.

## Install

Apply after Level 3B, from the repo root.

1. Close the app.
2. Delete these two files. They are replaced, not edited:
   - `src/main/services/backup.ts`
   - `tests/foundation/backup-startup.test.ts` (now `tests/foundation/startup.test.ts`)
3. Copy `src/`, `tests/`, `docs/`, `package.json` and `package-lock.json` from this bundle into the repo, replacing what is there. That is 30 changed files and 28 new ones.
4. Run `npm install`. It adds `nodemailer` (sending by SMTP), and `smtp-server` for the tests only.
5. Run `npm run build`. It runs typecheck, lint, all tests and the production build.

`review/level3c-changes.patch` is the whole change as one diff, for reading. It is **not needed to install**.

### The first start afterwards

- The database is upgraded (migration 0016). Backups record more about themselves; a cache of document fingerprints is added; the message log records recipients, method, the full text and any error.
- Earlier backups stay in the list as "database only" and can still be restored.
- Scheduled backups start: every day at 12:30 unless you change it. A missed one is made at the next start.

## You: three things to do once

1. **Print the recovery sheet,** if the yellow banner is still asking: Settings → Backups → *Save or print it now…* Without it, no backup can be restored on another computer.
2. **Choose a backup folder on another drive** (a NAS or a USB drive kept away from the PC): Settings → Backups → *Choose a folder…* Or use *Copy…* on the newest backup now and then. Then press *Test* on a backup.
3. **The vault passphrase,** if the vault is set up: write it down and seal it in the safe, apart from the recovery sheet, or keep it in the partners' password manager. It is never in a backup.

Email needs nothing unless you want the app to send directly; see `docs/EMAIL.md`. For Microsoft 365, an administrator registers the app once; the steps are in the guide and in Settings.

## What changed

### Backups
- **What's in a backup:** the database and every stored document.
  - **Encrypted** with keys derived from the database key. The key itself is never in a backup.
  - **Each document is kept once** in the backup folder and shared by every backup there, so a daily backup adds little more than the database.
  - **Checked as it is made:** the database copy is opened and checked; each new document and the backup file are read back. A failing drive shows up then.
- **Schedule:** every hour, every 4 hours, daily at a time, weekly on a day, or off. A backup missed while the PC was off is made at the next start.
- **Keeping:** every scheduled backup from the last 2 days, then one a day for 2 weeks, one a week for 8 weeks and one a month for a year. Ones made with *Back up now* are kept until deleted.
- **Folder:** the app's own, or one you choose on another drive. If the chosen drive isn't there, the backup goes to the app's folder and says so.
- **Test:** a full trial restore that changes nothing. It opens the database with the key, runs the full integrity check, and decrypts and checks every document. The result is shown on the backup and kept in the audit log.
- **Copy…** puts a backup and its documents in another folder, such as a USB drive, comparing every file with the original.
- **A failed scheduled backup** shows in Settings and as a desktop notification, and is retried an hour later.

### Restoring
- **On the same PC:**
  - Settings → Backups → *Restore…*, with the partner's password typed again.
  - Prepared and checked first, then swapped in when the app restarts.
  - The database as it was is kept as a safety copy. A document that changed since is moved aside, never overwritten.
- **On a new PC:**
  1. The first screen now offers *Restore from a backup*.
  2. Choose the backup file, then type the key from the recovery sheet.
  3. A key from the wrong sheet is named by its fingerprint.
  4. After the restart, sign in as usual and enter the licence key again.
- **A lost key file:** the database can't be opened, so the sign-in screen offers *Unlock* with the recovery sheet's key, or a restore. The app no longer stops at start-up with an error box.
- **Restore from a file…** in Settings takes a backup from anywhere, such as a USB drive.
- **The swap at start-up is safe:**
  - if the restored database won't open, everything is put back;
  - if a start is cut off part-way, the next one finishes the job;
  - a document that can't be put in place is kept in its own folder and named.

### Email
- **The mail app stays the default.** The message opens there, ready to check and send. A message too long for a mail link opens with a note, and the whole text goes on the clipboard.
- **Optional, off until set up in Settings → Email:**

  | Method | How it sends |
  |---|---|
  | SMTP | The connection must be encrypted, with a certificate the PC trusts. |
  | Microsoft 365 | Through Microsoft Graph, after a browser sign-in. Microsoft is switching off password sign-in for SMTP. |
  | Resend | Through Resend's service. |

  Passwords, keys and the Microsoft 365 sign-in are encrypted with the practice key and never shown again. *Send a test* checks the set-up.
- **One way to send:** the Comms Hub, the templates on a client's page and the template editor all send the same way.
  - The client's details and your name are filled into templates.
  - When the app sends directly, a dialog shows who it is from and to, and lets you edit it. It lists blanks still to fill in, such as `{deadline_date}`.
- **Every email to a client is recorded:** who to, how, the full text, and *Sent*, *Not sent* (with why) or *Opened in mail app*. It is recorded as *Sending* before it goes, so a crash still leaves a record. WhatsApp messages are recorded as *Opened in WhatsApp*.
- **Comms Hub:**
  - *Send All* is now *Email and WhatsApp*: WhatsApp opens once the email has gone.
  - The random 10–30 second wait is gone.
  - Each send makes one entry in the log, not two.
- **The Resend section** of Settings is now part of Settings → Email. Any API key already saved carries over.

## Verified here

- `npm test`: 269 of 269, including the real workbook — 28 more than Level 3B. The new tests cover:
  - the backup encryption at every chunk boundary, and refusal of anything changed, cut short, added to or under another key;
  - making, testing, copying and cleaning up backups;
  - restoring:
    - on the same PC, with changed documents kept aside;
    - on a new PC with the recovery sheet's key;
    - rolling back when the restored database won't open;
    - resuming a cut-off start;
    - a document that can't be put in place;
    - requests and backups from earlier versions;
    - refusing a newer version's backup;
  - the schedule and keeping rules, a failed backup waiting an hour, one job at a time;
  - SMTP against a real local mail server: encrypted, authenticated, refusals explained, nothing sent without TLS or with an untrusted certificate;
  - Resend, and Microsoft 365's sign-in, refresh and sending, against stand-ins;
  - the message log, staff limits, and secrets never stored or logged in plain text.
- Both typechecks: 0 errors. Lint: 0 errors (80 warnings, 2 fewer than before).
- The built app in a real Electron window, on the data folder from the Level 3B run:
  - **A backup:** the database and 2 documents. *Test* passed; *Copy* to a "USB" folder.
  - **Email:**
    - opened in the mail app (the `mailto:` link checked) and recorded as opened;
    - SMTP set up against a local server, with a test email received over TLS;
    - a template sent from the Comms Hub through the check dialog, received, and shown as *Sent* in the history.
  - **Restore on the same PC:**
    - a wrong password refused;
    - the right one restored after the restart, with the safety copy kept.
  - **Restore on a "new PC"** through the sign-in screen, from the USB copy:
    - a key from the wrong sheet refused, naming both fingerprints;
    - the right key restored the clients and both documents into the new folder, and wrote the key file;
    - sign-in worked.
  - **The key file deleted:** the sign-in screen showed the database as locked. *Unlock* with the sheet's key, after the restart, signed in with everything there.

## Not verified here

- **A real Microsoft 365 tenant, and a real Resend account.** Both were tested against stand-ins that follow their published APIs. Please set one up and press *Send a test*.
- **Windows:**
  - the mail app opening from the link (Outlook, New Outlook or Windows Mail);
  - the restore swap;
  - a backup folder on a NAS share (`\\server\share`).
- **A large documents folder.** It was tested with a handful of files; the design reads only changed documents.
- The upgrade on your own data folder.

## Moved in the plan

- **The recovery sheet's instruction "choose Restore from a backup"** now exists. The plan's recovery-sheet sub-item can be ticked.
- **Level 6 drills:** the restore drill can now be run as written — a new PC, from only a backup and the printed sheet. `docs/BACKUPS.md` §8 describes it.
