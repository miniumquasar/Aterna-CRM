# Recovered from the Claude conversation

Everything recoverable from the shared conversation "Building the world's best app"
(claude.ai/share/8b352b9d-5350-4353-8edc-236d7b28879d, 19 April to 20 October 2026), in
which Claude rebuilt the Companies House CRM v5 into **AETERNA CRM**, through Level 4F of
the release plan.

**This is not a buildable copy of the app.** A shared conversation does not include the
files people attached or the bundles Claude produced, so the complete project has to come
from those bundles (see "Getting the complete project" below). What is here is what the
conversation itself still holds.

## What's in this folder

| Path | What it is |
| --- | --- |
| `RELEASE_PLAN.md` | The "CRM v5 — release plan" doc, exported as it stands now: 56 tasks ticked, 33 open. |
| `CONVERSATION.md` | Every message in the conversation, yours and Claude's, with the tools each turn used. |
| `MANIFEST.md` | Every recovered file, with how far it can be trusted. |
| `project/` | The project as it stood at the end of the conversation, as far as it can be rebuilt: 151 complete files, 47 possibly outdated. |
| `edits-without-base/` | Claude's edits to 30 files whose contents never appeared in the conversation, ready to apply to your own copies. |
| `early-bundles/` | Files Claude wrote for the first bundles (`crm-stabilize`, April; `crm-import`, October). |
| `bundle-notes/` | The install notes for Levels 3A, 3B, 3C, 4E and 4F. |
| `recovery-scripts/` | The scripts that produced this folder from the conversation, so it can be redone. |

## What's missing, and why

- **Your original source code.** It was attached to the first message, and attachments are
  hidden in a shared conversation. Every file Claude edited without rewriting it in full is
  therefore missing, including `package.json`, `src/main/index.ts`, `src/preload/index.ts`,
  `src/shared/types.ts`, `src/main/db/schema.ts` and most of the older screens.
- **The bundles.** The 23 `.tar.gz` bundles Claude delivered can't be downloaded from a
  shared link.
- **Sixteen messages.** Messages 5, 30, 31, 51, 73 to 76, 83, 89 to 94 and 100 are not in
  the shared snapshot, probably turns that were retried or didn't load. Messages 89 to 94
  held most of Levels 4A and 4B, so files changed only there are absent or outdated here.
- **File contents Claude read.** The shared copy keeps no text from file reads and at most
  about 4 KB of each command's output.

## How the files were rebuilt

Only exact, data-only steps were replayed, in the order they happened. Nothing from the
conversation was executed.

1. Every file Claude wrote in full (`Write`, `create_file`, shell heredocs).
2. Every exact replacement (`Edit`), plus the one-off Python and `sed` edit scripts. Those
   were parsed and applied as string operations, not run.
3. Each result was checked against later command output that quoted the file (`grep -n`
   lines and `wc -l` counts). A file is marked "possibly outdated" when that output
   disagrees, or when a later step changed it in a way that can't be replayed.

## Getting the complete project

The complete, tested project is the original upload with the bundles applied in order,
each following its own install notes. You can download them from the original conversation
in claude.ai, where you are the owner:

1. `crm-stabilize.tar.gz` (Option A)
2. `crm-import.tar.gz`
3. `crm-licensing.tar.gz`
4. `crm-db-safety.tar.gz`
5. `crm-platform.tar.gz`
6. `crm-foreign-keys.tar.gz`
7. `crm-onboarding.tar.gz`
8. `crm-gaps-worklist.tar.gz`
9. `crm-routes-typecheck.tar.gz`
10. `crm-references.tar.gz`
11. `crm-workbook-passwords.tar.gz`
12. `crm-data-model.tar.gz`
13. `crm-level1-foundation.tar.gz`
14. `crm-level2-cleanup.tar.gz`
15. `crm-level3a-access.tar.gz`
16. `crm-level3b-licence.tar.gz`
17. `crm-level3c-email-backups.tar.gz`
18. `crm-level4a-navigation-first-run.tar.gz`
19. `crm-level4b-people-and-assignment.tar.gz`
20. `crm-level4c-edits-and-communications.tar.gz`
21. `crm-level4d-activity-risk-notifications.tar.gz`
22. `crm-level4e-forecast-security-assistant.tar.gz`
23. `crm-level4f-registers-and-consistency.tar.gz`

Level 5 (Windows packaging, the "no longer clients" group, and keeping references that fail
their check) was in progress when the conversation ended and was never packaged. The files
it had written by then are in `project/`, for example `src/main/app-menu.ts`,
`src/shared/client-status.ts` and migration `0021_no_longer_clients.ts`.

Never commit the master workbook, `database-key.json`, the licence signing key
(`~/.aeterna-licensing`) or a printed recovery sheet. This repository is public.
