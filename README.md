# AETERNA CRM

An offline Electron desktop app for UK accounting practices: clients, Companies House and
HMRC compliance, deadlines, AML, work and billing, communications, references and a
credential vault, with a per-firm yearly licence. Everything stays on the PC.

- `docs/ARCHITECTURE.md` — the contract every part is built against.
- `docs/DOMAINS.md` — who owns what, and what each part must do.
- `recovered-from-claude-chat/` — logic recovered from the earlier build, to port from (never import).

## Working on it

Node 22 or later.

| Command | Does |
| --- | --- |
| `npm install` | installs, and builds the native SQLite module for Electron |
| `npm run dev` | runs the app with hot reload |
| `npm run typecheck` · `npm run lint` · `npm test` | the checks (tests run under Electron's own Node) |
| `npm run build` | all the checks, then the production bundles in `out/` |
| `npm run smoke` | drives the built app through first run and every screen, in Day and Night |
| `npm run dist:win` | the Windows installer (on Windows or a Windows runner) |

`AETERNA_DATA_DIR=/some/folder npm run dev` keeps a development copy's data away from the
real data folder (`%APPDATA%\AETERNA CRM` on Windows).

Never commit the master workbook, `database-key.json`, a licence signing key
(`~/.aeterna-licensing`) or a printed recovery sheet. This repository is public.
