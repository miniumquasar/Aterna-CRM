# Level 4F — the client file's registers, and the app made consistent

The last of Level 4's six bundles.

- **The client file now changes its registers.** Payroll (PAYE schemes and a line for each tax year), workplace pensions, the Self Assessment registration and sources of income, linked clients and other names, each with its own panel and a jump link at the top of the file.
- **A workplace pension's duties start date adds its re-declaration deadlines** to the client's deadlines. Changing the date moves them; removing the pension archives them.
- **Other names find clients** in Go to… and in every client picker.
- **One count of deadlines everywhere.** Reports, the client file and the assistant now count the same open deadlines as Home, Deadlines, Calendar and Forecast.
- **Calendar and Tasks rebuilt**: a month worked from the keyboard, and tasks grouped by when they are due.
- **A consistency pass over every screen**:
  - the app's own question dialog in place of the 47 plain browser boxes;
  - every dialog keeps the keyboard inside while it is open and gives it back when it closes;
  - a name for every button and field, read by screen readers;
  - text raised to readable contrast;
  - a "Skip to the screen" link;
  - movement that follows the computer's setting while the app is open;
  - a message and *Try again* wherever a screen couldn't read what it needs, instead of "Loading…" for ever.
- **About and help** has short guides, *What's new*, and a support form that writes an email for your mail app.

The guides are `docs/RECORDS.md` (a new section on the client file's registers), `docs/ACCESSIBILITY.md` (new) and `docs/GETTING-STARTED.md`.

## Install

Apply after Level 4E, from the repo root.

1. Close the app.
2. Copy `src/`, `tests/` and `docs/` from this bundle into the repo, replacing what is there. That is 98 changed files and 20 new ones. Nothing is deleted.
3. Run `npm run build`. It runs typecheck, lint, all tests and the production build. No packages were added or removed, so `npm install` isn't needed.

`review/level4f-changes.patch` is the whole change as one diff, for reading. It is **not needed to install**. `review/screenshots/` has the 24 screenshots from the run described below.

### The first start afterwards

No database change: the registers' tables have been there since the data model. Nothing in the practice's records changes.

## You: nothing to do

Nothing is required. Two things are worth a look:

- **Client statuses.** The client dialogs now offer the practice's statuses (Active, Prospect, Dormant, Review required, Former client). A client given an older status by an earlier version (Onboarding, Inactive, Ceased) keeps it, marked *(older status)*, and can be filtered on. A client marked *Ceased* still counts as a live client for deadlines and risk. Changing those clients to *Former client* (or *Dormant*) takes them out. See "Kept in mind" below.
- **Workplace pensions.** The re-declaration dates follow the duties start date, as The Pensions Regulator recommends. Where a client moved its re-enrolment date, change the deadline's due date on the client file.

## What changed

### The client file's registers

- **Payroll.** Add a PAYE scheme: the employer PAYE reference, the Accounts Office reference, how often they pay, where it stands, and the payroll contact, chosen from the client's contacts. Both references are checked as they are typed. Then add a line for each tax year: employees, CIS subcontractors, RTI and the payroll file. The first PAYE reference fills the client record's, when it is empty; it never overwrites one.
- **Workplace pensions.** The provider, the letter code (10 digits; one employer's code can't be recorded for a second client), the duties start date, the last declaration and the last payment.
  - With a duties start date, the next re-declaration is added to the deadlines, due within five months of the third anniversary. One whose date passed in the last six months is added too, as *not known*, to confirm it was made. The panel says what was added: "due 31 Aug 2026 (passed: confirm it was made) and 31 Aug 2029".
  - Changing the date archives the open deadlines made from the old one, with a note, and adds the new ones. Changing it back brings the archived ones back. Removing the pension archives them. Filed deadlines are never touched.
- **Self Assessment.** One registration per client: the UTR (checked as it is typed; the panel says if it differs from the client record's), what the business does, how the return is filed (more than one route can apply), the years on file and where it stands. Then a line for each source of income.
- **Linked clients.** *Director of*, *shareholder of*, *connected to*, *spouse / partner*, *group member*, read from both sides: "Director of Alpha Ltd" here is "Jo Bloggs is a director of this client" there. Staff see a link to a client they don't work on with its code, not its name.
- **Other names**: *also known as*, *trading as*, *former name*.
- **Every change is in the audit log**, with the values before and after and the client it belongs to: 21 new kinds of entry, from *Added PAYE scheme* to *Removed other name*.
- **Jump links** at the top of the file move to each part, and the keyboard with them.

### Deadlines, Calendar and Tasks

- **Reports** counted deadlines from the deadline register alone, so it could show fewer than Home and Deadlines. It now counts the same list, due dates on client records included. So do the client file's figures and the assistant's look-ups.
- **Calendar** (Work → Calendar): each month's open deadlines by day, overdue ones marked on the day they were due. Arrow keys move a day or a week, Home and End to the ends of the week, Page Up and Page Down a month; Enter lists the day's deadlines, each opening its client file.
- **Tasks** (Work → Tasks): overdue, due today, the next 7 days and later, with done and cancelled ones tucked away below. Everything I can see, Given to me, or Nobody's yet. A task's client is chosen by name, code or other name.

### Dialogs and questions

- **The app's own question dialog** replaces all 47 browser confirm and alert boxes. For anything that can't be undone the safe answer has the keyboard first, and the danger button is red.
- **Every dialog** — the client dialogs, Paste from a spreadsheet, the send-email dialog, the recovery sheet, the two restore dialogs, the Companies House update picker, the email templates' client picker — now:
  - takes the keyboard when it opens and keeps Tab inside;
  - makes the screen behind unreachable, by the keyboard or a screen reader;
  - closes on Escape, unless it is busy saving;
  - gives the keyboard back where it was.

### Reading the screen, and the keyboard

- **Contrast.** 314 faint text and icon colours raised (text at least 4.5 to 1 on the app's dark surfaces, meaningful icons 3 to 1), and the greys of the email templates and the assistant with them.
- **Names.** 241 decorative icons hidden from screen readers; every icon-only button named ("Close", "Hide the key", "Delete the conversation…"); 112 fields given labels a screen reader reads.
- **Screen titles.** Every screen has one main heading, which names the tab too for screen readers ("Clients: Client file"). *Skip to the screen* is the first thing Tab reaches, and lands on it.
- **The client list from the keyboard.** Each name is a button that opens the details; the row's buttons appear when the row has focus; the sortable headings are buttons that say how they sort.
- **Movement** follows the computer's reduce-motion setting live, not only when the app starts.
- **Screens that couldn't read** what they need (Reports, Settings, Data, the email templates, About) said "Loading…" for ever. They now say what couldn't be read, with *Try again*.

### About and help

- **Guides**: finding your way; the client file; deadlines, the calendar and tasks; the keyboard, screen readers and movement; backups; security; the assistant. Each opens to a few points and a button to the screen.
- **Ask for help**: email, phone, and a form: what it's about, what happened, and, if wanted, this copy's details (version, system, licence, machine code). *Write the email* opens the mail app with it ready to check and send; nothing is sent from the app. A message too long for a mail link goes on the clipboard, and the email says to paste it.
- **What's new**, newest first.

## Fixed in the code this replaces

- **Cancel saved the client anyway.** In the client edit dialog, Cancel closed it and saved the changes; in Quick add, Cancel added the client when a name had been typed. The dialogs' buttons all submitted the form. Buttons are now plain buttons unless they are the save.
- **The client dialogs' tick boxes couldn't be reached from the keyboard** (engagement letter, 64-8, dormant, audit), and none of their fields was tied to its label.
- **The client dialogs and the new-client wizard offered statuses the rest of the app doesn't know** (Onboarding, Inactive, Ceased) and not the practice's (Prospect, Review required, Former client). The client list's status filter did the same, so clients with a register status couldn't be filtered.
- **Pasting from a spreadsheet:**
  - a name with a comma in it ("Smith, Jones & Co") was split across columns;
  - an empty heading was taken as the client name;
  - any heading with "reg" in it ("Registered office") was taken as the company number;
  - a result message was dark red on the dark background.
- **The active filter on the client list** was white on bright cyan (1.4 to 1). It is now dark text.
- **The postal code box under References and logins** stretched across the row.
- **HMRC's sandbox switch** in Settings had no name a screen reader could read; the show-key buttons were 14 pixels across.

## Found and fixed in the review of this bundle

- **Go to didn't find a newly added other name** until the client list was next refreshed. The list is refreshed when an other name is added, changed or removed.
- **Calendar keys pressed in quick succession** each started from the day before the last, when the next key came before the screen had drawn.
- **The pension's new deadlines** were listed latest first.
- **The Reports pie chart's slices** had no names for a screen reader. Each now says its kind of deadline and how many.
- **The Companies House screen's empty heading** was faint grey (4.4 to 1).

## For developers

- **New in the bridge** (`window.api.registers`): save and delete for payroll schemes, payroll years, pensions, the Self Assessment registration, sources of income, links and other names; and `getIncomeSources`. 222 channels in all; save-* and delete-* are writes for the licence gate.
- **New shared pieces:**
  - `components/ui/Confirm.tsx`: `confirmAction()` and `showNotice()`, the app's own question and notice;
  - `components/ui/LoadState.tsx`: `Loading` and `LoadProblem` (with *Try again*);
  - `components/forms/client-status.ts`: the practice's statuses, with a client's older one kept;
  - `components/forms/reference-note.ts`: the gentle note under a reference field;
  - `components/clients/glass-fields.tsx`: labelled fields and keyboard tick boxes for the glass dialogs;
  - `lib/paste-cells.ts`: reading cells pasted from a spreadsheet, quotes and all;
  - `screens/crm/clientfile/panel-kit.tsx`: the register panels' list, row buttons and messages.
- **Changed:**
  - `Modal` takes `padded` and `className`, and counts open dialogs so the app stays inert until the last closes;
  - `GlassModal` is built on `Modal`;
  - `GlassButton` is `type="button"` unless told otherwise;
  - `useMotionLevel` reads the computer's reduce-motion setting live (`usePrefersReducedMotion`), and `MotionConfig` is told the result.
- **Lint:** 26 warnings, from 78 at Level 4E: 27 unused imports and the Clients screen's dead code removed.

## Verified here

- **`npm test`:** 533 of 533, including your real master workbook. That is 46 more than Level 4E. The new tests cover:
  - **the registers' rules**: each save and removal, the references checked, one registration per client, a letter code on two clients refused, links read from both sides and kept to the client's file, other names unique and not the client's own, staff kept to their own clients, and the audit entries;
  - **re-declaration deadlines**: added from the duties start date, the passed one to confirm, moved and archived when the date changes, brought back when it changes back, archived with the pension, filed ones untouched;
  - **one count of deadlines**: Reports, the client file and the assistant's look-ups against the deadline list;
  - **on screen**: links in words, the pension's deadline message, filing routes, the tax year a payroll year starts at, the calendar's weeks and day names, screen titles, the Tasks groups and due words (across the clocks changing), pasted cells, the statuses offered, the reference notes, the guides and the support email.
- **Your real master workbook:** 940 clients; Reports and the deadline list agree (337 overdue, 198 due in the next 90 days); every client's file agrees with the list; all 42 other names in the workbook find their client as Go to does, in about 3 ms a search; the five register panels read in under 9 ms a client.
- **Typecheck and lint:** both typechecks 0 errors; lint 0 errors and 26 warnings.
- **The built app in a real Electron window**, with the made-up workbook and three people. 20 checks, 24 screenshots, and no errors from the app:
  - **the client file**: opened with Go to; a PAYE scheme typed as "123 ab45678" saved as 123/AB45678 and copied to the empty client record, with a 2026-27 year; a pension from April 2023 adding 31 Aug 2026 (to confirm) and 31 Aug 2029, and the same letter code refused on another client; a UTR flagged as it was typed, then saved; a property income; a link to Cedar Family Trust, read the other way on Cedar's file; an other name added, kept when Escape answered the question, removed when Remove did, and found by Go to once added again;
  - **the question dialog**: the keyboard starts on Cancel, Tab stays between its two buttons, and goes back to the Remove button afterwards;
  - **deadlines**: Reports and the list both 3 overdue and 3 due in 90 days; the client file 4 open, 2 overdue, next 1 Nov 2026, the same as the list;
  - **Calendar** from the keyboard, each key landing where it should; **Tasks** added for a client, marked done, and deleted through the question dialog;
  - **the client list**: Cancel in Quick add added nothing, and in the edit dialog changed nothing; a tick box ticked with Space; the statuses offered; the details opened from the keyboard; sorting by the Client heading;
  - **pasting** "Smith, Jones & Co" and "Oak & Ash Ltd", both imported whole;
  - **About and help**: a guide opened; the support form refusing an empty message, then opening the mail app with the topic, the message and this copy's details;
  - **Skip to the screen** first on Tab, landing on the screen's title; **movement** off and back on with the computer's setting;
  - **axe-core 4.10** (WCAG 2.0, 2.1 and 2.2, levels A and AA) on all 29 screens: no violations;
  - **staff**: a link to a client they don't work on shows its code, not its name.

## Not verified here

- **A person using a screen reader.** axe-core finds what can be checked automatically. NVDA or Narrator on Windows is the real test: the client file, a dialog and the calendar are the places to try.
- **Windows.** In particular the mail app opening from the support form, and Windows' own reduce-motion setting (Settings → Accessibility → Visual effects → Animation effects).

## Kept in mind for later

Found during this level and left on purpose, each with where it goes:

1. **One rule for a reference that fails its check** (your decision). The register panels refuse a PAYE reference, Accounts Office reference or UTR that fails its check; the client edit dialog saves it with a note. Choose one: refuse everywhere, or save and flag everywhere (as the import does, as a data issue). Until then both stay as they are.
2. **Older client statuses** (your decision). Clients given Onboarding, Inactive or Ceased by earlier versions keep them, and Ceased ones still count as live. A one-off tidy could map them (Ceased → Former client, Inactive → Dormant, Onboarding → Prospect), recorded in the audit log. Level 6, with the pilot data.
3. **The older screens' own look.** Settings → General, the email templates editor, the assistant and Companies House still use their own colours and panels. Their text now meets the contrast level and every control is named, but they don't look like the newer screens. A restyle onto the app's colours, after the pilot.
4. **The Reports charts** cycle eight colours not checked for colour-blind readers, and have no table view. Bring them to Forecast's rules (one checked palette, a legend, *Show the figures*). Level 6.
5. **Pasting clients** adds them without the import's checks (no data issues raised, no duplicate check beyond the client code). Route pasted rows through the same checks, or keep it for small lists only. Level 6.
6. **The application menu** is Electron's default, with *Reload* and *Toggle Developer Tools* in the packaged app. Level 5 replaces it.
7. **Your workbook's data**: 337 overdue deadlines (the oldest 651 days late) and no person, fee or invoice on any client. To work through in the pilot (Level 6).
8. **26 lint warnings** left in the older files (unused values, `any` in the older settings handlers, hook dependencies in three panels). Cleared as those files are next changed.
9. **axe-core in the build checks.** It runs in the smoke test only; Level 6 adds it to the checks on every change.
10. **The Clients screen** is one file of 1,500 lines. Split it into parts when it is next changed.
