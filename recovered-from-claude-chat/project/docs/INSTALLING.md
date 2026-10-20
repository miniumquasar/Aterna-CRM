# Installing, upgrading and uninstalling AETERNA CRM on Windows

AETERNA CRM runs on Windows 10 and Windows 11, 64-bit. Each release is one installer, `AETERNA-CRM-<version>-setup.exe`, from the download page. The same file installs the app the first time and upgrades it afterwards.

A Mac version is set up but not built yet: it needs an Apple developer account first.

## What you need

- Windows 10 or 11, 64-bit, with about 600 MB free for the app. The practice's data grows from there: the database, stored documents and any backups kept in the app's own folder.
- Permission to install apps for yourself. An administrator is needed only to install it for everyone who uses the computer.
- An internet connection only for the things that use one: Companies House look-ups and checks, sending email through a provider, and downloading the assistant's model. Nothing else goes online, and nothing connects to the computer from outside.

## Checking the download (optional)

The download page lists a SHA-256 checksum for each installer, and `SHA256SUMS.txt` comes with each release. To check yours, in PowerShell, in the folder you downloaded to:

```powershell
Get-FileHash .\AETERNA-CRM-5.0.0-setup.exe -Algorithm SHA256
```

The long number must match the one listed. If it doesn't, download the installer again and don't run the one that didn't match.

## Installing

1. **Run the installer.** Double-click `AETERNA-CRM-<version>-setup.exe`.
2. **"Windows protected your PC."** The first releases aren't signed with a code-signing certificate, so Windows SmartScreen doesn't know the publisher yet. Click **More info**, check it says *AETERNA-CRM-…-setup.exe*, then click **Run anyway**. If there is no *Run anyway*, the computer's policy blocks unsigned apps: ask whoever looks after your IT to allow it.
3. **Who it's for.** *Only for me* is chosen to start with and needs no administrator. *Anyone who uses this computer* installs it for every account and asks for an administrator. Each person's data is kept apart either way.
4. **Where.** The suggested folder is fine:
   - only for you: `%LOCALAPPDATA%\Programs\AETERNA CRM`;
   - for everyone: `C:\Program Files\AETERNA CRM`.
5. **Install**, then **Finish**. With *Run AETERNA CRM* ticked, it starts. There is a shortcut on the desktop and in the Start menu.

The first start opens the setup wizard: the firm's details, the first partner's account, the recovery sheet, the vault passphrase, the licence, and the master workbook. [GETTING-STARTED.md](GETTING-STARTED.md) goes through it.

### Where the practice's data is kept

`%APPDATA%\AETERNA CRM`, for each Windows account. It holds:
- the encrypted database and its key file;
- stored documents;
- backups, unless a backup folder elsewhere has been chosen (Settings → Backups);
- the start-up log and crash reports, in `logs` and `crash-reports`.

The key file sits beside the database, so anyone signed in to that Windows account can reach both. A locked office, a locked computer and a Windows password for each person are what protect them. The printed recovery sheet is just as sensitive: keep it sealed and locked away.

## Upgrading to a new version

1. **Make a backup first**, to be safe: Settings → Backups → *Back up now*, onto another drive if you can.
2. **Close AETERNA CRM.** If it is still open, the installer asks you to close it.
3. **Run the new installer.** The SmartScreen steps are the same.
4. **Keep the answers it shows.** The page for who it's for says the app is already installed, and where; the folder is the one it's in. Change neither, so the new version replaces the old one rather than going in beside it.
5. It upgrades the app where it is, keeps the shortcuts, and **keeps all the practice's data**.
6. Start the app. About and help → *What's new* lists the changes.

An upgrade never removes data, whatever was chosen when it was installed.

## Uninstalling

1. Windows **Settings → Apps → Installed apps** (Windows 10: *Apps & features*), find **AETERNA CRM**, then **Uninstall**. The Start menu's right-click *Uninstall* goes to the same place.
2. The uninstaller's second page is **Your practice's data**:
   - **Leave the box unticked** (as it starts) to keep the data. Installing again later carries on where you left off, with nothing to restore.
   - **Tick *Also remove my data from this computer*** only when the data is safe elsewhere: a recent backup on another drive, and the recovery sheet. You are asked again before anything is removed, and it can't be undone. It removes `%APPDATA%\AETERNA CRM`: the database, its key, stored documents, settings, logs and the backups in that folder.
3. Either way:
   - backups in a folder you chose in Settings are not touched;
   - the record of the free trial stays on the computer, so a reinstall doesn't start a new trial;
   - other Windows accounts' data is not touched.

An administrator can uninstall without questions with `"<install folder>\Uninstall AETERNA CRM.exe" /S`. That always keeps the data, unless `--delete-app-data` is added.

## Moving to a new computer

Install AETERNA CRM on the new computer, then choose **Restore from a backup** on the setup wizard's first screen. You need the backup folder and the recovery sheet. [BACKUPS.md](BACKUPS.md) has the details. Once the new computer is working, uninstall from the old one and tick *Also remove my data*.

## If something goes wrong

- **"AETERNA CRM couldn't start".** The message names the step that failed. The start-up log is `%APPDATA%\AETERNA CRM\logs\startup.log`. Send it to support with the message.
- **The installer says the app is still running** after you've closed it: wait a few seconds and try again, or sign out of Windows and back in.
- **Antivirus software quarantines the installer.** An unsigned installer is sometimes flagged. Check the checksum (above), then allow it, or ask support.
- **Support:** info@bitopi.co.uk, 07555 221010, or the form in About and help.
