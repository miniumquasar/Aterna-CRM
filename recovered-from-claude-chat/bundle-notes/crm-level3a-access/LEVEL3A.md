# Level 3A — access and integrity

Level 3 has three bundles: this one (who can see and change what, money and the audit trail), 3B (licence hardening) and 3C (email and backups). Install them in order.

This bundle closes the gaps between "signed in" and "allowed". Staff now see only the clients assigned to them, everywhere in the app. Records the practice must keep can only be deleted by a partner. Every change goes into the audit log with its previous values. Money is held in whole pence, and what clients owe is worked out the same way on every screen.

## Install

Apply after Level 2, from the repo root. There are no files to delete and no package changes.

1. Close the app. The app makes a backup every day; to make one now, use Settings → Database Backups → Create Backup Now.
2. Copy `src/`, `tests/` and `scripts/` from this bundle into the repo, replacing what is there. That is 54 changed files and 26 new ones.
3. `npm run build`, which runs typecheck, lint, all tests and the production build.

The first start afterwards upgrades the database once (migration 0015): money moves to pence, the old logins list moves into stored logins, the NINO is kept once, and the audit log becomes append-only. Afterwards, open **Data → Data issues** and filter by source "migration 0015". Any value it could not read is listed there with the original text.

`review/level3a-changes.patch` is the whole change as one diff, for reading. It is **not needed to install**.

## What changed

### Who sees what
- **Staff see only their own clients.** This covers client lists, the dashboard figures, payments and receipts, tasks, WIP, HMRC submissions, interactions, documents, messages, email templates, the onboarding worklist, Companies House sync, deadline alerts and the AI assistant's searches. Partners and managers see the whole practice. Opening another person's client by its code says "You can only work on clients assigned to you."
- **Signed out means nothing shows.** The onboarding worklist and deadline alerts need someone signed in. Desktop deadline alerts cover only the signed-in person's clients, once a day per person. The old check that randomly skipped one alert in five is gone.

### Who changes what
- **Only a partner deletes records the practice must keep:** invoices, receipts, HMRC submissions, AML checks, documents and WIP. For staff, the delete buttons are hidden.
- **Partners and managers do these:**
  - delete clients;
  - assign clients;
  - change client codes;
  - change the practice's settings and the firm's details.
- **Everyone** can change their own theme and style.
- **A client with kept records can't be deleted.** The app explains why and suggests setting their status to Former client.
- **Settings shows when something is refused** and why, instead of seeming to save. Values are checked: an unknown theme, or deadline alerts more than 365 days ahead, are refused.
- **Sample clients** are for partners only, and only in a practice with no clients yet. Nothing is deleted. (The old wording said it would overwrite clients; it no longer does.)

### Assigning clients
- The client panel's **Assigned To → Change** picks from the people with an active account. A name nobody signs in with can't be chosen, because no member of staff could see the client.
- Moving a client also moves these, if they were with the previous person or with nobody:
  - its services;
  - its open deadlines;
  - its open tasks;
  - its work in progress.

  Anything deliberately given to someone else stays with them. Each move can be switched off.
- The audit entry lists every record moved and who had it before, so a move can be traced and undone.

### People
- **Names must be unique**, ignoring capitals and spaces, because a member of staff's clients are the ones assigned to their name. Upgrading lists any existing accounts that share a name.
- **When someone leaves, turn off their access.** Removing an account is refused while anything is still assigned to the name, past work included. Otherwise the next person to join under that name would see their clients and history.

### Client codes
- **New clients get a code automatically** (CL0001, CL0002, …) when none is given, both in the app and from a pasted import.
- **A code can be changed but not removed.** Invoices, documents and history are kept under it.

### Money in pence
- **Six money columns now hold whole pence** instead of decimal pounds:
  - client annual fee;
  - service fee;
  - invoice amount and invoice VAT;
  - receipt amount;
  - partners' capital.

  The database refuses anything else. Partners' capital and receipts can be below zero; a negative receipt is a refund.
- **Converting never guesses.** A value it can't read as money is left empty and listed with the original text. A value with fractions of a penny is rounded and listed too.

### What clients owe
- **One set of rules, used on every screen:**
  - Cancelled invoices don't count.
  - A receipt linked to an invoice pays that invoice first.
  - An invoice marked paid is settled, and takes no share of other money.
  - Receipts not linked to an invoice pay the open invoices, oldest first.
  - A refund puts the amount back on its invoice, or on the newest open invoices.
  - What is left is aged by days past due: not due, 1–30, 31–60, 61–90 and over 90.
  - Money beyond everything owed is shown as a credit.
- **Payments** shows Invoiced, Received and Owed, with the overdue amount. Each invoice shows paid, part paid, overdue or pending, and how much is still owed on it.
- **Recording a receipt** on the client's AR tab now has **For invoice**. Choose the invoice, or leave it on "Oldest invoices first". This links the money to the invoice it pays.

### Records and the audit log
- **Every change records who made it and what it was before**, only the columns that changed. Secrets are masked; hidden values are recorded as hidden.
- **The audit log is append-only:** entries can be added, never changed or deleted.
- **A change and its audit entry are saved together, or not at all.** This covers settings, firm details, Companies House streams, references and stored logins. Unlocking the vault and revealing a secret are left out on purpose, so a failed attempt is still recorded.
- **Deleting a client records how many records went with it**, by kind, and what was only unlinked.

### Stored logins and the NINO
- **The older logins list moves into stored logins**, with account IDs and notes kept and no passwords; those logins are flagged "No password".
- An HMRC or GOV.UK sign-in for a client with no permission on record is moved too, never dropped, and listed so the practice can record the permission.
- **The National Insurance number is kept once**, on the client record, in the encrypted database and masked on screen.
  - A second copy that matched is dropped.
  - A second copy that differed is kept in the client's identity-details notes, and listed. The audit log only ever holds it masked.

### Documents
- **Storing a document works again.** Electron 41 removed the way the app read a dropped file's location.
- **Files stay inside the app's documents folder**, one folder per client, with names cleaned so they can't step outside it.
- **Opening is by document, not by path.** Only document types open in their app: PDFs, Office files, text, pictures, emails and zip files. Anything else, a program for example, is shown in its folder instead of being run.
- **Documents saved by an earlier build** under its own data folder are copied into the current one and their records pointed there. This matters when the app's folder name changes. The originals are left where they were.

### The AI assistant
- Searches, client details and the changes it makes all follow the same rules: staff's own clients only, secrets masked, every change audited, and no changes while the app is read-only.

## Decisions to know about

- **The NINO isn't encrypted a second time.** The whole database is already encrypted. A separate key for one field would come from the same database key, so it would add nothing, and it would break search and matching.
- **"Paid" wins.** An invoice marked paid counts as settled even with no receipt recorded. To keep a receipt with a particular invoice, choose that invoice when recording it.
- **Unassigned clients are not visible to staff.** A partner or manager assigns them.

## Corrections to earlier notes

- Level 2 was packaged and delivered as `crm-level2-cleanup`.
- Restoring a backup on a new PC from the recovery sheet is **not built yet**. It comes in 3C (email and backups).

## Verified here

- `npm test`: 223 of 223, including the real workbook. There are 57 new tests, covering:
  - access for each role;
  - the audit entries;
  - the pence conversion and the money rules;
  - the receivables rules, including the review's case of a large paid invoice and refunds;
  - assignment moves;
  - removing people;
  - document folders;
  - deadline alerts by person.
- Both typechecks: 0 errors. Lint: 0 errors (82 warnings, down from 89). The production build passes.
- An independent review of this level found no critical or high issues. All 10 of its medium and low findings are fixed in this bundle.
- The built app, run in a real Electron window on Linux with a virtual display:
  - the first partner was set up and created a client, which got code CL0001;
  - an invoice and a receipt were recorded, and an invoice with half a penny was refused;
  - the client's AR tab and the Payments summary showed the right figures, and the receipt form offered the open invoice;
  - a member of staff who joined by invite saw only their own client;
  - staff were refused practice settings and assignment, but could change their theme;
  - signed out, nothing about clients was shown;
  - the partner assigned the client, and deleted the invoice;
  - clearing a client code was refused;
  - removing someone with clients was refused, with the reason;
  - a stored `.exe` was shown in its folder instead of run;
  - the audit trail was complete.
- Copying this bundle onto the Level 2 state gives exactly the tree that was tested.

## Not verified here

- Running on Windows, and the upgrade on your own database. The upgrade is tested on made-up data in every older shape, including text amounts such as "1,250.50" and "n/a".
