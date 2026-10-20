# Level 4E — Forecast, Security and the assistant check

The fifth of Level 4's six bundles.

- **Forecast** (Practice → Forecast). Where the work falls in the months ahead, and the money with it:
  - deadlines by month, by kind of work and by person;
  - tasks and work in progress;
  - the billing the fees on clients' services add up to;
  - money received, and money falling due on invoices;
  - on request, a short briefing from the assistant on this computer.
- **Security** (System → Security), in two tabs:
  - **Overview**: the database, licence, backups, the recovery sheet, the vault and the audit log at a glance, with what needs a look said first; your own account; who can sign in; and sign-in history.
  - **Audit log** (partners and managers): every recorded action, with what changed, narrowed by date, person, kind and words, and saved as CSV for an inspection.
- **Seals on the audit log.** A hash chained over every entry, added a minute after start, every hour and as the app closes. A change made to the log outside the app now shows, and where.
- **Changing the vault passphrase** (a partner), with every stored login, password and code sealed again under the new one, all at once.
- **The assistant checks that it can run** before anything else. When Ollama isn't installed, isn't running, or hasn't got the model, it says so and shows the steps for this computer. A partner or manager can download the model from inside the app, with progress. The assistant also writes the briefings on Forecast and in the Client file.

The guides are `docs/FORECAST.md`, `docs/SECURITY.md` and `docs/ASSISTANT.md`.

## Install

Apply after Level 4D, from the repo root.

1. Close the app.
2. Delete this file. Forecast and Security replace the placeholder screen it was:
   - `src/renderer/src/screens/ComingSoon.tsx`
3. Copy `src/`, `tests/` and `docs/` from this bundle into the repo, replacing what is there. That is __CHANGED__ changed files and __NEW__ new ones.
4. Run `npm run build`. It runs typecheck, lint, all tests and the production build. No packages were added or removed, so `npm install` isn't needed.

`review/level4e-changes.patch` is the whole change as one diff, for reading. It is **not needed to install**.

### The first start afterwards

- **One database change.** Migration 0020 adds the table that holds the audit log's seals. Nothing in the practice's existing records changes.
- **The audit log is sealed a minute after the app opens.** From then on, Security → Overview shows *Intact* and the latest seal's fingerprint.

## You: nothing to do

Nothing is required. Three things are worth doing:

- **Write down the audit log's fingerprint** (Security → Overview, under the tiles) somewhere away from this computer, now and then. If the log were ever rewritten, the fingerprint you kept would no longer appear.
- **To use the assistant,** install Ollama from ollama.com/download on this computer, then open *AI assistant* in the title bar: it shows what is still to do, and a partner or manager can download the model there. The model is several gigabytes.
- **If someone who knew the vault passphrase has left,** a partner can change it in Security → Overview → Vault, then print the new passphrase sheet.

## What changed

### Forecast

- **Choices at the top** scope the whole screen, so every figure agrees:
  - *Whose work*: everyone's, mine, nobody's yet, or one person's. Staff choose between all their clients and those assigned to them.
  - *Months ahead*: 3, 6 or 12.
- **Four figures**: overdue now (with how late the oldest is), due in the months shown, the busiest month, and money owed (with how much is overdue).
- **Deadlines falling due, by month**: the same open deadlines as Compliance → Deadlines and Home, in thin columns with the busiest labelled. A tooltip gives each month's figure; *Show the figures* lists them all as a table.
- **What falls due, by kind of work** and **Who has what, by month**: tables shaded by how many fall due, the lighter the more, with overdue ones in their own column. While no client has a person, Who has what says so and links to Clients.
- **Tasks** (overdue, this month, later, no date) and **work in progress** by person (open, late, due this month).
- **Billing expected, by month**, from the fees on clients' active services, by how often each is billed:
  - monthly, quarterly and annual fees from their next date;
  - one-off fees in their month;
  - a fee with no next date, or a client's annual fee, spread evenly over the year;
  - *As needed* left out, and counted.

  Money is whole pence throughout: a yearly fee spread over the months adds up to the fee exactly.
- **Money in**: owed, overdue, held as credit, and owed with no due date, worked out exactly as in Billing; and two charts on one scale, money received by month and money falling due by month.
- **Briefing from the assistant**, with *What the assistant was given*: exactly the text it read, to check the briefing against.
- **Gaps in the records** are said where they matter, with a way to fill them: no fees recorded, no invoices yet, deadlines nobody is assigned.

The charts follow one set of rules: one colour for a single series, chosen and checked for colour-blind readers against the dark background; thin columns with rounded tops; hairline gridlines; evenly spaced axis labels; a table for every chart.

### Security

- **Overview tiles**: the database, the licence, backups, the recovery sheet, the vault and the audit log, each with a dot (in order, needs a look, needs attention now, not in use) and the way to deal with it. The sentence at the top names what needs a look.
- **The vault**:
  - *Lock it now*;
  - logins to follow up: those with no user ID, and those with no password stored. The same password on several logins is normal and is never flagged;
  - *Change the passphrase…* (a partner);
  - *Print the passphrase sheet…* (a partner): checked first, printed, not kept.
- **Changing the vault passphrase:**
  - Every stored secret and postal authorisation code is opened with the current passphrase and sealed again under the new one, in one go. Either all of it moves or none of it does, and the old passphrase stops working at once.
  - If anything can't be opened, nothing changes, and the message names the logins in the way.
  - A wrong current passphrase counts towards the pause after five, as when unlocking.
  - It works while the licence has run out; it is refused while the database isn't being saved, so it can never vanish at the next start.
  - Afterwards the new passphrase sheet can be printed straight away.
- **The audit log's seals:**
  - A seal is a SHA-256 chain over every entry: when, who, what, which record, before and after.
  - Entries are sealed a minute after start, every hour, and as the app closes. Seals, like the log, can only be added.
  - *Check now*, and opening the overview (at most every ten minutes), run the chain again from the first entry.
  - An entry changed or removed outside the app shows as *Changed outside the app*, with the stretch of entries, when it was sealed, and how many are missing.
  - The latest seal's fingerprint is shown to write down elsewhere.
- **Your account**: your last sign-in before this one, wrong passwords on your account in 30 days, the time before the app signs out, and *Change your password…*.
- **Who can sign in** (partners and managers): people by role; accounts paused, waiting for a password, or switched off; invites not used; sign-ins and failed attempts in 30 days.
- **Sign-in history**: every sign-in, sign-out (by hand or after a time without use), wrong password, unknown username, password change and reset, unpause and invite joined. Staff see their own. Narrow by days, person and *Only failed attempts*.
- **Audit log tab**:
  - newest first, a hundred at a time;
  - from and to, who (or *The app*), kind, and words;
  - each entry's client opens its file; open an entry for its values before and after;
  - *Nobody signed in* marks attempts at the sign-in screen.
- **Saving the audit log as CSV**:
  - every matching entry, in batches, so a long log never sits in memory;
  - times in UTC and on this computer's clock;
  - values that would run as formulas in Excel kept as text; very long values shortened to fit an Excel cell;
  - written in full beside the chosen name, then put in place, so a failure never leaves half a file;
  - the export itself is recorded in the log, and it works while the app is read-only.

### The assistant

- **It checks it can run, first.** The four states, each in a sentence with the steps for this kind of computer (Windows, Mac or Linux):
  - not installed (it looks where Ollama is usually installed, and along the PATH);
  - installed but not running;
  - running without the chosen model;
  - ready.

  Until it is ready, typing is off, and the screen checks again every 10 seconds, so starting Ollama shows without a click.
- **Downloading the model** (partners and managers): from the screen, with a bar, the size, and *Cancel*. The download is recorded in the audit log.
- **Briefings** on Forecast and in the Client file. A client's briefing is given its deadlines, risk, money, AML, open issues, recent contact and Companies House changes. It is never given a password, tax reference, NI number or authorisation code: the client's own references, and anything shaped like one, are withheld even when an issue or a note quotes them.
- **It speaks for the practice** as set in Settings: the firm's name, tone, email signature and disclaimer. A signature or disclaimer the practice hasn't written is left out.
- **Settings → The assistant** shows how it stands, beside the model choice, with up-to-date steps.

### Fixed in the code this replaces

- **The assistant's look-ups never worked.** A tool call with arguments was read up to its first closing brace, so it never parsed, and the raw JSON was shown as the answer. Every question also began with a forced extra round trip to read the firm's settings. Tool calls are now read properly, wherever they sit in the reply, and the practice's details are given up front.
- **The assistant called the practice "Acme Practice Configuration"** when no firm name was set in Settings, and offered "System Generated" as a signature. It now uses the firm's own name.
- **"localhost"** was used to reach Ollama. On Windows that can mean an address Ollama doesn't listen on, so it looked as if Ollama wasn't running. The app now uses 127.0.0.1 everywhere, chat and email drafting included.
- **Errors in plain words.** "Ollama is not running", "Timeout" and "Failed to parse Ollama response" are replaced by what happened and what to do. The links to ollama.ai now go to ollama.com.
- **Printing the vault passphrase sheet** always recorded key version 1.
- **The two placeholder screens** for Forecast and Security are gone.

### Found and fixed in the full review of this bundle

- **A client's briefing could have quoted an NI number** that an import's data issue had recorded ("invalid National Insurance number: …"). References are now withheld from everything the assistant is given about a client.
- **Money axes read £0, £650, £1.3K, £2.5K.** Axis labels are now evenly spaced round figures.
- **The whole amount owed showed red** when only part of it was overdue. Only the overdue part is marked.
- **Every field of a new record was listed as changed** in the audit log. Only changes to a record list fields.
- **Month headings in the shaded tables were cut off.** The year now sits on its own line above the first month and each January.
- **Saving the audit log** could have finished for someone who had signed out while the save dialog was open. The same person must still be signed in.
- **Sign-in history for one person** read only the newest 5,000 events before narrowing. It now narrows in the database.
- **"1 deadline fall due"** now reads *falls due*.

### For developers

- **New in the bridge:**
  - `forecast.get`;
  - `security.*`: overview, signIns, audit, checkAudit and exportAudit;
  - `ai.*`: status, pullModel, cancelPull, onPullProgress and summarise;
  - `vault.changePassphrase`.
- **Removed:** `analyzeWithAI` (and its `ai:analyze` channel). `ai.summarise` replaces it, for the Forecast and Client file briefings.
- **`getARSummary`** stays wired in Billing. Forecast's money figures use the same receivables rules, worked out in the main process with the rest of the forecast.
- **Shared:** `src/shared/csv.ts` (the CSV cells the screens and the main process both write) and `src/shared/audit-words.ts`.

## Verified here

- **`npm test`:** __TESTS__ of __TESTS__, including your real master workbook. That is __MORE__ more than Level 4D. The new tests cover:
  - **Forecast:**
    - months across a year end, and the choices checked;
    - deadlines by month, kind and person, with overdue ones apart, and the deadline's own person first;
    - one person's work, nobody's, your own, and staff's clients only;
    - tasks and work in progress, finished and cancelled left out;
    - fees placed by how often they are billed, in exact pence, and carried forward from a next date already past;
    - money owed, overdue, falling due and received, by month;
  - **the audit log's seals:**
    - sealing only what is new;
    - every part of an entry in the chain;
    - an entry changed, entries removed, the newest removed;
    - the seals append-only;
    - 20,000 entries sealed and checked well inside a second each;
    - the sealer's timing, and a failed seal reported;
  - **Security:** every kind of sign-in event in words; failed attempts only; one person; staff their own; the 30-day figures; who can sign in; the login flags; the audit log's pages and every filter, % and _ looked for as they are; batches for the export; the CSV;
  - **the vault passphrase:** everything sealed again and readable with the new one, the old one refused, nothing changed when an item can't be opened, the pause after wrong passphrases;
  - **the assistant, against a stand-in Ollama:** each state and its steps on Windows, Mac and Linux; downloading with progress, a missing model, Ollama gone, cancelling; answers and their errors; tool calls in prose and code fences;
  - **what the assistant is given:** no secret from the record, and references withheld from issues and notes;
  - **on screen:** chart arithmetic, Forecast's figures and rows, each Security tile's words, the audit log's choices, the assistant's states and downloads.
- **Your real master workbook:**
  - Forecast for the whole practice in __FORECASTMS__ ms. It adds up to exactly the deadlines on Compliance → Deadlines for 3, 6 and 12 months.
  - For the next 12 months: __OVERDUE__ overdue (the oldest __OLDEST__ days late) and __AHEAD__ due, the busiest month __BUSIEST__.
  - No client has a person, a fee or an invoice in the workbook, so Forecast says so where it matters, with where to fill them in.
  - The busiest client's briefing holds none of its references.
  - The log of the import seals and checks intact.
- **Typecheck and lint:**
  - Both typechecks: 0 errors.
  - Lint: 0 errors, and __LINTFEWER__ fewer warnings than Level 4D.
- **The built app in a real Electron window,** with made-up clients, people, fees, invoices and receipts, and a stand-in Ollama on this computer. __SHOTS__ screenshots, and no errors from the app:
  - **Forecast:** __FORECASTSMOKE__
  - **The assistant:** with no Ollama, the setup steps and typing off; with Ollama but no model, *Download the model here*; the download's bar, then ready; a question answered with one look-up, its result shown under the answer, the practice named in what the assistant was told.
  - **Briefings:** Forecast's, with what the assistant was given; Dana Patel's, with her NI number and UTR withheld.
  - **Security:** __SECURITYSMOKE__
  - **Staff:** Forecast for their own clients only; Security with the database, the licence, their account and their own sign-ins, no audit log tab, and the audit log refused.
  - **The next start:** the new passphrase still opens the vault and the old one doesn't; the log intact, sealed as the app closed.

## Not verified here

- **A real Ollama and model.** A stand-in that answers in the same way was used. The real download is several gigabytes, and answers take seconds to a minute depending on the computer. The briefings' quality depends on the model.
- **Windows.** In particular: finding Ollama where Windows installs it; the save dialog and Excel opening the CSV.
- **Printing** the passphrase sheet: there is no printer here.
