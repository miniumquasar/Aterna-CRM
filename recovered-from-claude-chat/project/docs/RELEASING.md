# Releasing AETERNA CRM — building, checking and publishing a version

For the vendor. A release is a full Windows installer and its checksum, put on the download page. Firms install it over the version they have; their data stays (see [INSTALLING.md](INSTALLING.md)).

## 1. Before building

1. **The version.** Raise `"version"` in `package.json`: the last number for fixes (5.0.1), the middle one for new features (5.1.0). The installer's name, About and the title bar follow it.
2. **What's new.** Add the release at the top of `WHATS_NEW` in `src/renderer/src/screens/crm/help/guides.ts`. About and help shows it.
3. **Revoked licence keys.** Add any refunded or leaked key to the revocation list before building: every release carries the list ([LICENSING.md](LICENSING.md)).
4. **Checks on your PC:** `npm run build` (typecheck, lint, every test, the production build). With the real workbook's path in `CRM_TEST_WORKBOOK`, the real-workbook tests run too.

Two names must never change, because upgrades and the data folder depend on them:
- `appId: uk.co.bitopi.aeternacrm` (`electron-builder.yml`): the installer recognises an earlier install by it;
- `productName: AETERNA CRM` (`electron-builder.yml` and `package.json`): the data folder, `%APPDATA%\AETERNA CRM`, is named after it.

## 2. Building

The database module is native and must be built on the platform it will run on, so the Windows installer is built on Windows.

**On GitHub (recommended).** Commit, then tag the version and push the tag:

```
git tag v5.0.1
git push origin v5.0.1
```

The *Build* workflow (`.github/workflows/build.yml`) runs typecheck, lint and tests on Windows, then builds the installer, checks that the packaged app refuses an edited archive, and writes the checksums. Download **AETERNA-CRM-windows** from the run's page (Actions → Build → the run → Artifacts): it holds `AETERNA-CRM-5.0.1-setup.exe` and `SHA256SUMS.txt`. Runs can also be started by hand (Actions → Build → *Run workflow*).

**On a Windows PC.** Node.js 22 and the Visual Studio Build Tools (C++ workload) are needed for the native module the first time.

```
npm ci
npm run build:win
```

The installer and `SHA256SUMS.txt` are in `release/`.

## 3. Checking a build before publishing it

On a clean Windows 10 and a Windows 11 computer (or virtual machines):

1. **Install** for *Only for me*: SmartScreen's *More info → Run anyway*, the pages, shortcuts on the desktop and in the Start menu, the app starting at the end.
2. **First run:** the setup wizard; import the made-up workbook; make a backup.
3. **Upgrade:** install the previous release, add a client, then run the new installer over it. The client is still there, and so is the licence or trial.
4. **Uninstall, keeping the data:** reinstall afterwards; everything is still there.
5. **Uninstall, removing the data:** tick *Also remove my data*, confirm; `%APPDATA%\AETERNA CRM` is gone; a reinstall starts at the setup wizard and the trial doesn't restart.
6. **Tamper check** (the workflow runs it too): `node scripts/asar-tamper-check.mjs release/win-unpacked`.

## 4. Publishing

1. Put `AETERNA-CRM-<version>-setup.exe` on the download page, with its SHA-256 from `SHA256SUMS.txt` and the release notes (what's new, from step 1).
2. Keep earlier installers available for a while, in case a firm needs to go back. Going back to an earlier version over a database a newer version has changed isn't supported: restore the backup made before the upgrade instead.
3. Tell firms on a licence: the email can say *Close AETERNA CRM, run the new installer; your data stays*.

## 5. Signing, when there is a certificate

Unsigned for now, as decided: Windows shows SmartScreen's warning until a certificate is used and the app builds a reputation. Everything else is ready.

- **Windows.** Buy an OV or EV code-signing certificate in the vendor's name. Since 2023 their keys live on a hardware token or in a cloud signing service, not in a file you can copy, so how it plugs in depends on the one bought:
  - a certificate as a `.pfx` file: add the repository secrets `WIN_CSC_LINK` (the file, base64) and `WIN_CSC_KEY_PASSWORD`; the workflow already passes them on, and electron-builder signs the app and the installer;
  - a hardware token on a Windows build PC: `win.signtoolOptions` (`certificateSubjectName` or `certificateSha1`) in `electron-builder.yml`, and build on that PC;
  - Azure Trusted Signing: `win.azureSignOptions` in `electron-builder.yml`, with its secrets in the workflow.

  An EV certificate removes the SmartScreen warning at once; an OV certificate removes it as downloads build up a reputation.
- **macOS.** Join the Apple Developer Program, create a *Developer ID Application* certificate, and add the secrets `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`. Then run the workflow by hand with *Also build for macOS* ticked: it signs, notarises (hardened runtime, `build/entitlements.mac.plist`) and makes disk images for Apple silicon and Intel. Without the secrets the Mac build is unsigned, and macOS won't open it without a right-click → Open.

## 6. The icons and installer pictures

All are made from one picture, `build/icon-source.jpg` (1024 × 1024). After changing it:

```
npm run icons
```

It needs Python 3 and Pillow (`pip install pillow`). It writes `build/icon.ico` (16 to 256 px, with the small sizes closer in on the crystal so they still read), `build/icon.icns`, `build/icon.png`, the installer's sidebar and header pictures, and `resources/icon.png` (the window's icon on Linux). Check them in.

## 7. What the installer does

Set in `electron-builder.yml` (`nsis:`) and `build/installer.nsh`:
- pages: welcome, who it's for (*Only for me* to start with: no administrator), where, then a finish page that can start the app;
- shortcuts on the desktop and in the Start menu;
- an upgrade (the new installer run over the old version) shows the existing install's answers, replaces the app in place and keeps the data: the old version's uninstaller runs silently with `--updated`, which skips the data page and never removes data;
- uninstalling keeps the data unless *Also remove my data* is ticked and confirmed; a silent uninstall (`/S`) keeps it unless `--delete-app-data` is given; the trial's record in the registry always stays;
- full installers only: no update feed, no differential files (`publish: null`).
