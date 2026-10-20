# Security

**Security** (System → Security) shows in one place how the practice's data is protected, and who has been signing in. It has two tabs:
- **Overview**, for everyone;
- **Audit log**, for partners and managers.

Staff see the database, the licence, their own account and their own sign-ins.

## Overview

The sentence at the top says whether everything is in order. If not, it names what needs attention now, then what needs a look.

### The tiles

| Tile | Shows | Who sees it |
|---|---|---|
| **Database** | Whether the database is encrypted and being saved, and its size. | Everyone |
| **Licence** | The trial or licence, and how long it lasts. | Everyone |
| **Backups** | The last backup, the next one due, or what went wrong. | Partners and managers |
| **Recovery sheet** | Whether the encryption key's recovery sheet has been saved or printed for the key in use: by whom, when and how. A partner saves or prints it. | Partners and managers |
| **Vault** | Whether the vault is set up, locked or unlocked (and until when), how many logins are stored, and the logins to follow up. | Partners and managers |
| **Audit log** | Whether the audit log still matches its seals. | Partners and managers |

A dot shows each tile's state:
- green: in order;
- amber: needs a look;
- red: needs attention now;
- grey: not in use.

### The vault

- **Lock it now** locks the vault straight away. It also locks itself after 15 minutes without use.
- **Logins to follow up** are those with no user ID, and those with no password stored. The same password on several logins is normal and is never flagged.
- **Change the passphrase…** (a partner) asks for the current passphrase and the new one twice. The new one needs at least 12 characters. Every stored login, password and postal authorisation code is opened with the current passphrase and sealed again under the new one, all at once. Either everything moves to the new passphrase or nothing does.
  - The old passphrase stops working at once.
  - The vault stays unlocked until it locks itself.
  - If a stored item can't be opened, nothing changes. The message names the item, so it can be removed or entered again first.
  - A wrong current passphrase counts towards the pause after five wrong passphrases, as when unlocking.
  - It works while the licence has run out. It is refused while the database isn't being saved, so the change can never vanish at the next start.

  Afterwards, *Print the new passphrase sheet…* prints the new passphrase, to replace the old sheet in the safe.
- **Print the passphrase sheet…** (a partner) prints the sheet again. The passphrase is typed in and checked first, so a mistyped one is never put on paper, then printed and not kept.

### The audit log's seals

The audit log can only be added to: the database refuses any change to an entry, and any removal. Someone could still go round the app and edit the database file with another tool. The seals make that show.

- **A seal** is a SHA-256 hash run over every audit entry in order. Each step takes the whole entry: when, who, what, which record, before and after. Changing, removing or inserting any entry changes every value after it.
- **When entries are sealed:** a minute after the app starts, every hour, and as the app closes. Seals, like the log, can only be added.
- **Checking** runs the hash again from the first entry, and compares it with every seal. It happens when the overview opens (at most every 10 minutes), and when you choose *Check now*.
- **Changed outside the app** means entries no longer match their seal. The tile says which stretch of entries, when it was sealed, and how many entries are missing. Keep a copy of the database as it is, and speak to whoever looks after the computer.
- **The fingerprint** under the tiles is the start of the latest seal. Write it down somewhere away from this computer now and then. Someone with full control of this computer could rewrite the log and work out new seals. The fingerprint you kept would then no longer appear.

### Your account

- Your last sign-in before this one.
- Wrong passwords typed for your account in the last 30 days.
- How long the app waits without use before it signs out.

If a sign-in wasn't you, change your password and tell a partner. *Change your password…* is here and at the foot of the sidebar.

### Who can sign in

For partners and managers:
- how many people can sign in, by role;
- accounts paused after wrong passwords;
- people still to choose their own password, or with no password yet;
- accounts with access switched off;
- invites not used yet;
- sign-ins and failed attempts in the last 30 days.

*People* opens Settings → People.

### Sign-in history

Every sign-in, sign-out, wrong password and unknown username, newest first. Also:
- signing out after a time without use;
- password changes and resets;
- accounts unpaused;
- joining with an invite;
- a password typed wrongly when confirming an action.

Partners and managers see everyone's; staff see their own. Choose how far back to look (up to a year), whose (partners and managers), and *Only failed attempts*.

## Audit log

Every change made in the app, and every time a secret was shown, newest first. Partners and managers only.

- **Choices:** from and to (days on this computer's calendar), who (a person, or *The app* for what the app did by itself), the kind (clients, compliance, billing, communications, tasks, documents, people and settings, imports, other), and words to find in the action, the names or the values.
- **Each entry** shows when, who, what, the fields it changed (in words), and the client it was about (which opens the client file). Open an entry to see the values before and after, exactly as recorded. *Nobody signed in* marks attempts made at the sign-in screen.
- **Show the next 100** reads further back.

**Save as CSV…** (or *Save these as CSV…* with choices made) asks where to save, then writes every matching entry for Excel. Each row has:
- the entry's number;
- the time in UTC, and on this computer's clock;
- who, the action, the register, the record, and the client's code and name;
- the fields changed, and the values before and after.

A value that would run as a formula in Excel is kept as text. A value longer than 20,000 characters is shortened, so it fits in an Excel cell. The file is written in full beside the chosen name, then put in place, so a failure never leaves half a file. Saving the log is itself recorded in the log. It works while the app is read-only.
