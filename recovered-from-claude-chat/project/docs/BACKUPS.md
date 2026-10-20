# Backups — what is kept, where, and how to restore

A backup holds the practice database and every stored document, encrypted with the practice's key. To restore one on another computer you need three things: the backup folder, the recovery sheet, and — for stored logins only — the vault passphrase.

## 1. What a backup holds

| In a backup | Not in a backup |
|---|---|
| The practice database: clients, work, money, messages, the audit log, people's accounts | The encryption key. It is on the recovery sheet, printed or saved by a partner. |
| Every stored document | The vault passphrase. Nobody's copy is kept anywhere by the app. |
| What it holds: when it was made, by which version, how many clients and documents | Settings that belong to this computer only, such as the screen's look |

Everything in a backup is encrypted. Without the key it can't be read, so a lost USB drive gives nothing away.

## 2. Where backups go

- **By default, the app's own folder**, under `backups` in the data folder. A failed disk or a stolen PC takes those too, so Settings → Backups marks this with a warning.
- **A folder you choose**: another drive, a NAS or a USB drive (Settings → Backups → *Choose a folder…*). The app makes a subfolder named after the key's fingerprint, such as `AETERNA CRM backups 4415-DECD`, so two computers backing up to the same place never mix their files.
- **If the chosen folder isn't there** when a backup is due (a drive unplugged), the backup goes to the app's own folder instead. Settings says so, and a desktop notification appears.

**Keep a backup folder together.** Each `.aeterna-backup` file holds the database and the list of documents. The documents themselves are in the `documents` folder beside it, each kept once and shared by every backup there. Copy the whole folder, never one file on its own. Each folder has a `README.txt` that says this.

## 3. When backups are made

- **The schedule:** every hour, every 4 hours, every day at a set time (the default is 12:30), every week on a set day and time, or off. Change it in Settings → Backups.
- **A missed backup is made at the next start.** This covers a PC that was off at the set time.
- **Which scheduled backups are kept:**
  - every one from the last 2 days;
  - then the newest of each day for 2 weeks;
  - then the newest of each week for 8 weeks;
  - then the newest of each month for a year.

  That is about 36 backups on a daily schedule. The newest is always kept.
- **Backups made with "Back up now" are kept until a partner deletes them.**
- **Space:** an unchanged document is stored once, however many backups there are, so a daily backup adds little more than the database each day. Settings shows the total.

Backups made before this version were copies of the database only, without documents. They are still listed as "database only" and can be restored. Scheduled ones are thinned out like the rest.

## 4. Checking backups

- **Every backup is checked as it is made.** The database copy is opened with the key and checked. Each document written is read back and compared, and so is the backup file, before it gets its real name. A failing drive shows up then, not on the day you need it.
- **"Test" in the list is a full trial restore that changes nothing.** It copies the database out, opens it with the key, runs SQLite's full integrity check and compares the counts. It then decrypts every stored document and checks each against its fingerprint. The result is recorded against the backup and in the audit log.
- **Test a backup once a month,** and always the copy you keep away from the office.

## 5. Copying a backup to a USB drive

In the list, *Copy…* on a backup asks for a folder and copies the backup file and its documents there. Each file is compared with the original after copying. Documents already on the drive aren't copied again, so the second copy to the same drive is quick.

## 6. Restoring

Restoring needs a partner. It puts back the practice as it was when the backup was made. The app restarts, and everyone signs in again.

### On the same computer
1. Settings → Backups → *Restore…* on the backup, and type your password.
2. The app checks the backup and prepares it. Then it restarts and swaps it in, before the database opens.
3. **Nothing is lost:**
   - the database as it was is kept in the data folder as `aeterna.before-restore-<date>.db`;
   - a document that changed since the backup is moved to a `kept-before-restore-<date>` folder, never overwritten;
   - documents added since the backup are left where they are.

   If the restored database won't open, everything is put back as it was and the sign-in screen says so.

### On a new computer
1. Install AETERNA CRM and start it.
2. On the first screen, choose **Restore from a backup**, then choose the newest `.aeterna-backup` file in the backup folder.
3. Type the key from the recovery sheet. Check the fingerprint matches the one printed under it. A typing mistake is pointed out by group; a key from the wrong sheet is named by its fingerprint.
4. The app restarts with the backup's records. Sign in with your usual username and password.
5. Enter the licence key again on the Licence screen — the same key.

### When the key file is lost (the database is "locked")
If `database-key.json` is deleted or damaged, the database can't be opened. Nothing is changed, and the sign-in screen says so. Type the key from the recovery sheet there to unlock it; the app restarts. The same screen offers a restore from a backup instead.

### From a backup file somewhere else
Settings → Backups → *Restore from a file…* takes a backup from any folder, such as a USB drive. A partner types their password, and the recovery sheet's key if the backup was made with another key.

## 7. What you need to restore — and where to keep it

| What | Where it is | How to keep it |
|---|---|---|
| A recent backup | The backup folder | On a drive away from the computer: a NAS, or a USB drive taken off site. Test it monthly. |
| The recovery sheet | Printed or saved as a PDF by a partner (the prompt keeps asking until it is done) | On paper, sealed, locked away apart from the computer and its backups. Print a new one if the app says the key has changed. |
| The vault passphrase (stored logins only) | Only in the partners' heads | See below. |

**The vault passphrase.** It protects the stored logins and is never kept by the app or put in a backup — that is what keeps those logins safe if a backup and the recovery sheet are both stolen.
- **Losing it:** the stored logins can't be opened again, even after a restore. Everything else restores without it.
- **Keeping it safe:**
  - write it down and seal it in an envelope in the safe, apart from the recovery sheet — or keep it in the partners' password manager;
  - make sure at least two partners can find it;
  - when it changes, replace the written copy.

## 8. A restore drill

Twice a year, restore the newest backup onto a spare computer using only the backup folder and the printed recovery sheet. Sign in, open a few clients and documents, then delete that installation. That is the only way to be sure the sheet, the backups and the people all work on the day.

## 9. Technical details

- **Backup file:** the magic `AETBAK02`, a header (JSON), the database exactly as it is on disk (already encrypted with SQLCipher), then the list of documents.
  - The header says when the backup was made and by which version, its newest schema change, the key's fingerprint, the counts, and the SHA-256 of both parts.
  - It is authenticated with an HMAC under a key derived from the database key.
  - A backup from a newer version than the app is refused rather than half-read.
- **Encryption:** keys are derived with HKDF-SHA256 from the database key. Each document and the document list are encrypted in 1 MiB chunks with AES-256-GCM, with a fresh key per file from a random salt. Each chunk's number, purpose and whether it is the last are authenticated. A chunk changed, moved, removed or added is refused.
- **Names:** a stored document's name is an HMAC of its SHA-256, so the folder says nothing about what it holds.
- **Consistency:** the database is checkpointed and copied in one step, with nothing written between.
- **Clean-up:** a stored document no backup lists any more is removed after a day. If any backup in the folder can't be read with this key, nothing is removed.
- **Restore:** prepared in `restore-staging` in the data folder, then applied at the next start: the database, then the key file (when a key was typed from the sheet), then the documents. A start interrupted mid-swap puts the database back first.

## 10. What's tested automatically

`npm test` covers:
- the encryption at every chunk boundary, and refusal of anything changed, cut short, added to, or made with another key;
- making a backup:
  - documents kept once;
  - nothing readable in the backup folder;
  - documents that couldn't be found are listed;
  - files outside the documents folder are never read;
- the test restore finding missing or damaged documents and a changed header;
- restoring:
  - on the same PC, with changed documents kept aside;
  - on a new PC with the recovery sheet's key;
  - rolling back when the restored database won't open;
  - finishing an interrupted swap;
  - requests and backups from earlier versions;
  - refusing a newer version's backup;
- the schedule, keeping and clean-up rules;
- copying to another drive.
