# Activity, notifications and Risk

Three places tell you what needs attention:
- **the notifications bell** in the title bar, and the list under Activity;
- **Activity → Today**: how the app, the licence, backups and Companies House stand, the Companies House changes for your clients, and the day's changes;
- **Risk**: every client ranked by what needs attention, with the reasons.

Staff see their own clients throughout. Partners and managers see the whole practice.

## Notifications

Each person has their own list. The number on the bell, and beside *Activity* in the sidebar, is how many need attention. It turns red when one is urgent.

### What you're told about

| Kind | Who hears | When |
|---|---|---|
| **Deadlines** | The person on the deadline, or else the client's person. Partners and managers also hear about deadlines with nobody. | Once when a deadline comes within the alert window (30 days unless changed), and once when it is overdue. The overdue notice replaces the first. |
| **Companies House** | The client's person. Partners and managers also hear about clients with nobody, and about every red flag. | When a change is found, by the daily check or the stream. |
| **Follow-ups** | Whoever logged the call or meeting. | On the follow-up date. One missed by up to 30 days is still announced. |
| **Tasks** | Whoever the task is assigned to. | On the due date. One missed by up to 30 days is still announced. Completed and cancelled tasks never are. |
| **Backups** | Partners and managers. | When a backup fails, the backup folder can't be used, or there has been no backup for a week. |
| **Licence** | Partners and managers. | When the trial or licence ends within 30 days, ends, or the app becomes read-only. |

### Many at once

When more than five new deadlines, or more than five Companies House changes, come up at once, they arrive as one summary instead. This happens on the first day, or after importing the master workbook. For example: *"334 deadlines need attention: 300 overdue and 34 due within 30 days."* The summary opens Compliance → Deadlines. You aren't told about them again one by one.

### Working through them

- **Open** goes where the notification points. A deadline opens the client file, and a follow-up opens the client's conversation.
- **Done** takes a notification off your list. *Mark all done* clears them all.
- **The app marks a notification done** when the thing it was about is dealt with. This happens when a deadline is filed, not needed or moved, a task is completed or cancelled, a follow-up is done, or a backup works again. It never does so just because time has passed: a missed follow-up stays on your list until it is done. Shortening the alert window doesn't take notices away either.
- **Done notifications** stay under *Done* for 90 days. *Open again* puts one back on your list.

Marking a notification done changes no practice record. It still works when the app is read-only.

### Toasts and desktop notifications

- **Toasts.** When a notification arrives while you're working, it shows for a few seconds in the bottom corner. Toasts don't appear on the Notifications list itself, or while the bell's panel is open, and opening either clears any on screen.
- **Desktop notifications.** When the app isn't in front, new notifications also show on the desktop. Clicking one brings the app forward on the list. A partner or manager can turn desktop notifications off in Settings → *Notifications*. The licence isn't repeated there: it has its own daily desktop reminder in its last 30 days.
- **Checks.** Notifications are checked every five minutes, a few seconds after you sign in, and soon after something changes them.
- **Nobody signed in.** Nothing is shown, so the sign-in screen never shows a client's name.

## Activity → Today

### How things stand

| Tile | Shows |
|---|---|
| **This computer** | Whether the database is encrypted and being saved, its size, and how quickly the app answered. |
| **Licence** | The trial or licence, and how long it lasts. |
| **Backups** (partners and managers) | When the last backup was made and when the next is due, or what went wrong. |
| **Companies House** (partners and managers) | The last check and what it found. Companies not found there are counted, and turn the dot amber, so their numbers can be put right. Also shows how the stream is doing. *Check now* checks every client company straight away. |

A dot shows each tile's state:
- green: working;
- amber: needs a look;
- red: needs attention now;
- grey: off.

### Needs attention

The three most pressing notifications, with a link to them all.

### Companies House changes

The last 14 days, for your clients, newest first. New ones appear as they're found.

*Red flags only* shows:
- a strike-off proposal or Gazette notice;
- insolvency;
- a status other than active;
- accounts or a confirmation statement overdue at Companies House.

Opening a Companies House notification shows that client's changes. *Show every client* goes back to all of them.

### Today's changes

Everything recorded in the audit log today, newest first:
- the time;
- what was done;
- the client;
- who did it. Changes the app made itself, such as the daily check, say *The app*.

*Yesterday*, or a date, shows another day. The chips choose a kind of change: clients, compliance, billing, communications, tasks, documents, people and settings, or imports. Partners and managers can show only their own changes. Staff see their own changes and changes to their clients.

## Risk

Every client ranked by a score out of 100. Each point has a reason you can check.

| Reason | Points |
|---|---|
| Overdue deadlines | 15 for the first and 5 for each more, up to 35. Plus 10 when one is over 90 days late. |
| Strike-off proposed at Companies House | 35 |
| A status other than active at Companies House: liquidation, administration, receivership and the like | 30 |
| Accounts overdue at Companies House | 15 |
| Confirmation statement overdue at Companies House | 10 |
| Fees overdue | 10. Plus 6 when some are over 90 days. |
| No AML check | 8 |
| Customer due diligence not complete | 6 |
| AML review overdue | 6 |
| High risk (on the AML check, or the client's own rating) | 8 |
| No engagement letter recorded | 5 |
| No agent authorisation in place, and no 64-8 recorded | 3 |
| An agent authorisation expired, or a request lapsed | 6 |
| An agent authorisation expiring within 30 days | 3 |
| Open data issues | 3 for each high and 1 for each medium, up to 8 |

Bands:
- **High:** 45 or more.
- **Medium:** 25 to 44.
- **Low:** below 25.
- **Nothing found:** 0. These clients are hidden unless you ask for them.

Missing paperwork alone keeps a client low. Overdue filings, Companies House red flags and unpaid fees move it up.

**Not recorded for nearly every client.** When nine in ten clients or more have no AML check, no engagement letter, or no authorisation, Risk says so once at the top, with where to record them. Each still counts a few points towards every client's score, so recording them brings every score down.

Using the screen:
- The four figures at the top choose a band.
- *Whose*, *Reason* and *Find* narrow the list.
- Open a client's row to see every reason. *Go there* opens the place to deal with it: the client file, the AML check, the client's authorisations, or the Companies House changes.
- *Save as CSV…* keeps the list as shown.

Companies House reasons come from the daily check, once the practice's API key is saved. Before a company's first check, a strike-off action or liquidation on the client record (from the master workbook) counts instead.

## Companies House checks

### The daily check

This needs the practice's Companies House API key, entered in Settings → *Companies House API*. It is on unless a partner or manager turns it off there.

- **What is read.** Each live client company's profile, about one company a second. That is well inside Companies House's limit, so searches still work while it runs.
- **When.** The first run starts two minutes after the app opens. After that, each company is looked at again once its last check is 20 hours old. A run interrupted by closing the app carries on next time.
- **What it finds:**
  - a strike-off proposal;
  - a change of status;
  - accounts or a confirmation statement becoming overdue at Companies House;
  - new accounts or confirmation statement filings;
  - a new registered office or name;
  - insolvency history;
  - a new charge.

  At a company's first check, only red flags are reported. Everything else is how the company already was.
- **The client record.** Companies House keeps these up to date:
  - the accounts and confirmation statement due dates;
  - the company status: active, strike-off, liquidation, administration or dissolved.

  The audit log records each change, by the app, with what it was before. An empty date from Companies House never clears one the practice holds. When the date moves on after a filing, the next deadline appears in the deadline list. A company Companies House shows as dissolved leaves the deadline list, like any dissolved client.
- **Companies not found.** They are counted on the Companies House tile. Check their company numbers.
- **Read-only.** Nothing is written while the app is read-only or not saving. A check that stops for this says so on the tile.
- **Closing the app during a check.** That isn't a problem: the companies not yet reached are checked at the next run.

The *Check all client companies now* button on the Companies House screen starts the same check.

### The stream (optional)

The stream brings every change on the register as it happens: filings, officers, persons with significant control, charges and insolvency. The app keeps only those about your clients.

- **Its own key.** It needs a streaming key, which Companies House issues separately from the REST API key. The two keys aren't interchangeable. If the developer hub doesn't offer one, ask Companies House.
- **Turning it on.** Settings → *Companies House API* → *REST + Streaming*. Paste the streaming key and choose the streams. A change to the choice of streams is saved at once.
- **Closing the app.** Where the stream had got to is saved. Changes published while the app was closed come in when it reopens, as far back as Companies House keeps them.
- **Read-only.** While the app is read-only, or not saving, nothing from the stream is kept and its saved place stays put. Once the app can save again, the stream picks up from there, so nothing is missed (again, as far back as Companies House keeps). The daily check catches up on each company's status and overdue filings either way.
- **Sleep and dropped connections.** A stream that has sent nothing for two minutes, as happens after the computer sleeps, connects again from where it got to.

## Settings that matter here

- **Companies House API** (partners and managers):
  - the API key;
  - the daily check on or off;
  - the stream, its key and which streams to follow.
- **Notifications:**
  - desktop notifications on or off;
  - how many days ahead deadlines are announced (30 unless changed).
