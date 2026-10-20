# Licensing — how it works, and the vendor runbook

AETERNA CRM is sold as one licence per firm, on any number of the firm's PCs, for £175 a year. Licence keys are checked on the PC with no internet connection.

## 1. What the firm sees

| When | What happens |
|---|---|
| First start on a PC | A 60-day free trial with every feature. |
| A key is entered | The key names the firm and the days it covers. The same key goes on every PC in the firm. |
| 30 days before the end | A banner, and a desktop notification once a day. |
| The licence ends | 3 days' grace: everything works, with a banner. |
| After the grace | Read-only. Everything stays viewable and exportable; signing in, backups, settings and licensing keep working. |
| A renewal key is entered | Full use again, from the day after the old licence ended. |

The licensed firm's name is always on show:
- the title bar and the window title;
- the sidebar;
- the About and Licence screens;
- every page of the practice report PDF;
- the client export's file name.

A key used by another firm therefore shows the wrong name everywhere.

## 2. Keys

- A key is about 170 characters, grouped in 8s. Case, dashes, spaces and line breaks don't matter; O/0 and I/L/1 count as the same.
- Each key carries the firm's name, the first day it covers, its term (usually 12 months), its serial number and when it was issued. An optional machine code locks it to one PC.
- Every one of those fields is signed with the vendor's Ed25519 key. Changing a single character — the firm's name, a date — makes the key invalid. The app holds only the public key, so keys can't be forged from the app.
- **Renewals start the day after the current licence ends.** Renewing early never loses time. A firm renewing late pays from the day its licence ended, which is the renewal rule; the vendor can choose another start date.
- **Each key says which days it covers**, so the same key gives the same answer on every PC. A new PC needs only the current key.
- Keys from the first version of this system (128 characters, no firm name) are refused with a message asking for a replacement. None were issued to firms.

## 3. Loopholes, and what closes them

| Loophole | Defence | What it can't stop |
|---|---|---|
| Setting the clock back | The latest time ever seen is sealed in the licence state; days are counted from it, and the Licence screen warns | A clock set back before the first install |
| Deleting the app's data, or reinstalling, to restart the trial | The trial start is sealed in four places: the data folder, the database, a file beside the data folder, and one outside every app folder (Windows registry; macOS Library; Linux state folder). Each copy is sealed with a key tied to the PC, and a copy that was edited counts for nothing. | A new PC, or a fresh operating system |
| One firm's key used by another firm | The licensed firm's name shows throughout the app and on reports and exports; revocation once found | An offline app can't tell who is using it; enforcement is by contract |
| Forging or editing a key | Every field is covered by the signature | Nothing, while the signing key stays private |
| Patching the app or swapping its public key | The installed app checks its own archive at every start (asar integrity) and loads code only from that archive | A determined cracker can still patch an offline program; this raises the cost |
| Leaked or refunded keys | Withdrawn keys are listed in every release | PCs that never install a new release |
| Running the app's code as plain Node, injecting NODE_OPTIONS, attaching a debugger | Electron fuses switch all three off in the installed app | Nothing further needed |
| Rewinding a virtual machine snapshot | Nothing offline can detect it | Accepted risk |

`scripts/asar-tamper-check.mjs` proves the archive check on a real build. It edits one byte of a copy and confirms that copy refuses to start. Run it on Windows (§7).

## 4. Vendor set-up — once

Do this on the computer licences will be issued from. A PC that stays offline is best.

1. In the repository, run `npm run licence -- init`. Choose a passphrase of at least 12 characters. This creates `~/.aeterna-licensing/` containing `signing-key-0.json`, your signing key encrypted with that passphrase. The register of keys issued will live in the same folder.
2. **Back up now.** Copy the whole `~/.aeterna-licensing` folder to two offline places, for example two USB drives kept in different buildings. Keep the passphrase separately: in a password manager, and on paper in a safe.
   - Without the key file *and* the passphrase you can't issue keys the app accepts.
   - Anyone with both can issue keys for your product.
3. Run `npm run licence -- trust-file --write src/main/licence/public-keys.ts`. This puts your public key into the app. Commit it, then build and release the app from it.
4. Check the release: issue a key to a test firm, enter it on a test PC, then withdraw it with `revoke … --reason "test"`.

## 5. Vendor runbook

All commands are `npm run licence -- <command>`. Add `--reference INV-1234` to tie a key to an invoice.

| Task | Command | Then |
|---|---|---|
| New firm | `issue --firm "Firm Name Ltd"` | Email the printed message. It says what to do and holds the key. |
| Renewal | `renew --serial 12`, where 12 is any of the firm's licences (`list --firm "Firm"`) | Email the message. The new year starts the day after the current one ends. |
| Firm changes its name, or the practice is sold | `replace --serial 12 --firm "New Name Ltd"` | Email the message. Same dates, no extra time. The old key is withdrawn at the next release. |
| New or extra PC | Nothing to issue | The firm enters the same key. If they lost it: `show --serial 12`. |
| Refund | `revoke --serial 12 --reason "refund"` | It stops working once the firm installs the next release. |
| Key leaked or misused | `revoke --serial 12 --reason "leaked"`, then `issue` a new key with the firm's dates (`--starts`) | Release promptly. |
| PC clock was far ahead, now corrected | `clock-reset --serial 12 --machine ABCDE-FGHJK-MNPQ` (the code is on the firm's Licence screen) | Send the printed key. It works on that PC only. |
| Check a key | `verify <KEY>` | Shows the firm, the dates, and whether it was withdrawn. |
| See everything issued | `list` (or `list --firm "Firm"`) | The register's integrity is checked on every read. |

**Before every release**, run `trust-file --write src/main/licence/public-keys.ts`, then build. That ships the current list of withdrawn keys.

## 6. Keeping the signing key safe

- **Rotate it** when a new key is wanted, or if the old one may have leaked:
  1. `init --key-id 1`, then `trust-file --write …` and release. The app now trusts both keys.
  2. Give every firm a replacement under the new key: `replace --serial N --key-id 1`.
  3. Only then remove the old key's file from the folder and release again.

  Keys signed with a removed id stop working, including ones already entered.
- **Lost passphrase or key file:** you can't issue keys the current app accepts. Set up a new key id (above) and issue every firm a replacement. Keys already entered keep working until their end dates.
- **Lost register:** keys already issued keep working, but the next serial numbers aren't known. Start a new key id, so serials can't repeat.

## 7. Checking a Windows build

On Windows, after `npm run build:unpack`:

```
node scripts/asar-tamper-check.mjs release/win-unpacked
```

The script runs two checks. Expect `Control: the untouched app starts.`, then `PASS: the edited app refused to start`.
1. **Control.** It starts the untouched build in a test mode that stops before any data is opened.
2. **Tamper.** It edits one byte of a copy's archive and starts the copy. The copy must not run.

## 8. What's tested automatically

`npm test` covers:
- the key format: the firm's name, dates, typos, and older-format keys;
- what each key covers, renewals, replacement after a change of name, grace and expiry;
- every refusal: forged, altered, withdrawn, wrong signer, wrong PC, repeat, clashing serial, unconfigured build;
- clock rollback and the reset key;
- tampered, copied and deleted state, including the copy outside the app's folders;
- the vendor tool end to end: init, issue, renew, replace, revoke, show, list and trust file, with the app accepting the keys and refusing withdrawn ones;
- the packaging settings: one config file, every fuse on, nothing but the built app packed.
