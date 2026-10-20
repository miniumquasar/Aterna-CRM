# Getting started — setting up, importing clients, finding your way

A new installation opens on the setup wizard. Six steps set the practice up on this computer; after that, the sidebar and Go to… (Ctrl K, or ⌘K on a Mac) reach every screen.

## 1. The setup wizard

It appears once, on a new installation. A practice that was already in use before this version never sees it.

| Step | What it does | Can it wait? |
|---|---|---|
| **Your firm** | The firm's name and contact details, for reports, exports and the recovery sheet. Only the name is needed. | No |
| **First partner** | Your own account: a username and a password of at least 10 characters. You are signed in straight away. | No |
| **Recovery sheet** | Saves or prints the encryption key, so a backup can be restored on another computer. Your password is asked for again. | Yes — a yellow reminder stays at the top of the app until it is done |
| **Vault passphrase** | Sets up the vault for clients' stored logins and codes, with its one chance to print the passphrase sheet. | Yes — set it up later in Settings → Practice details |
| **Licence** | Shows the 60-day free trial, or takes a licence key. | Yes — Settings → Licence |
| **Your clients** | Imports the master client workbook (section 2). | Yes — Settings → Import |

**Stopping part-way is fine.**
- Before the partner account exists, the wizard starts again at the step it reached. The firm's details are kept.
- After it, sign in as that partner: the wizard carries on from the first step not done.
- *Finish setting up later* opens the app for now; the wizard comes back at the partner's next sign-in until it is finished.

**Moving to a new computer?** The wizard's first screen has *Restore from a backup*. That brings the practice back from a backup and its recovery sheet, instead of setting up afresh.

### The vault passphrase sheet

The app never stores the vault passphrase — not on disk, not in any backup. Right after the vault is set up, while the passphrase is still on screen, *Print the passphrase sheet…* prints it once:
- straight to a printer, never to a file;
- checked against the vault first, so a mistyped passphrase is never put on paper;
- in groups of four, with spaces and look-alike characters pointed out.

Once you press *Continue* (or *Done* in Practice details), the app has forgotten it. Seal the sheet in an envelope in the safe, apart from the recovery sheet.

## 2. Importing the master workbook

Settings → Import, for partners and managers (the wizard's last step is the same screen).

1. **Choose the file.** The app recognises the master client workbook by its sheets. It only reads the file; the workbook isn't changed or moved.
2. **Check the report.** Nothing has changed yet. The report shows:
   - how many records would be new, changed, already the same, linked, or kept as they are;
   - how clients were matched to ones already here (by an earlier import, company number, UTR or exact name);
   - data issues found in the workbook, with examples;
   - every value here that differs from the workbook — the value here is kept;
   - due dates worked out from the statutory rules, and where the workbook differs.

   *Save the report…* keeps a copy to read or pass on.
3. **Import.** A partner presses Import. It all goes in, or none of it does.

**Authentication codes, Companies House personal codes and login IDs** are included by default. They are stored encrypted, like the rest of the database. The workbook's passwords are not part of this import: a partner or manager loads them into the vault from Settings → Practice details → *Passwords from the master workbook*.

**Undoing an import.** Earlier imports are listed under the report; the most recent one can be undone. Undoing removes every record it added and puts back every value it changed. It is refused when work has been added or changed since — a task, a document, an edited record, or an onboarding item someone marked — because undoing would lose that work too. The message lists what is in the way. The onboarding checks the app makes by itself never stop an undo.

## 3. Finding your way

### The sidebar

| Group | Entry | Inside it |
|---|---|---|
| Work | **Home** | Today's figures, the next deadlines and recent activity |
| | **Tasks** | |
| | **Calendar** | Deadlines by month |
| Clients | **Clients** | *All clients* · *Client file* (everything held about one client) |
| | **Communications** | *Messages* · *Calls and meetings* · *Templates* |
| | **Companies House** | Search the register |
| Compliance | **Compliance** | *HMRC and AML* · *Onboarding gaps* · *References and logins* |
| | **Risk** (Sentinel) | |
| Practice | **Billing** | *Invoices and payments* · *Work in progress* |
| | **Reports** | |
| | **Forecast** (Oracle) | |
| | **Activity** (Pulse) | |
| System | **Settings** | *General* · *Practice details* · *Data* · *Import* · *Licence* |
| | **Security** (Fortress) | |

About and help is at the foot of the sidebar; the AI assistant is in the title bar. Risk, Forecast, Activity and Security say what they will show; they are built in later updates.

The arrow keys move between tabs once one has focus.

### Go to… (Ctrl K, or ⌘K on a Mac)

Type part of a client's name, client code, trading name or company number, or the name of a screen ("templates", "wip", "workbook"), then press Enter. A client opens in its client file.

### Home

The figures come from the practice's own records: clients, overdue deadlines, deadlines in the next 30 days, tasks due today, work in progress, and money owed (with how much is overdue). Each figure opens the screen behind it; a deadline opens that client's file. Staff see their own clients; partners and managers see the whole practice.

### The client file

Opened from:
- a client's row in the client list (the folder button);
- the client's panel (*Client file*);
- Go to…;
- Home's deadline list.

## 4. Signing out

*Sign out* is at the foot of the sidebar. The window starts afresh on the sign-in screen, so the next person sees nothing of the last person's screens, searches or lists.
