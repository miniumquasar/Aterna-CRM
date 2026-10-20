import type { Migration } from '../migrate'

/**
 * 0020 — seals on the audit log, so a change made to it outside the app shows.
 *
 *   audit_seals   from time to time the app runs a SHA-256 chain over every
 *                 audit entry so far, in order, and keeps the result here with
 *                 how many entries it covered. Checking runs the chain again:
 *                 an entry changed or removed since it was sealed gives a
 *                 different result. Seals are only ever added, like the log.
 *
 * The audit log could already only be added to (0015). This makes a change
 * made by going around the app — editing the database file with another tool —
 * show up when the log is checked. Nothing in the practice's records changes.
 */
export const migration0020: Migration = {
  id: '0020_audit_seals',
  description: 'Seals on the audit log, so a change made outside the app shows when it is checked',
  up: `
CREATE TABLE IF NOT EXISTS audit_seals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  -- the last audit entry the seal covers; every entry up to it is in the chain
  sealed_through  INTEGER NOT NULL UNIQUE,
  -- how many audit entries there were up to sealed_through when it was sealed
  entries         INTEGER NOT NULL CHECK (entries >= 0),
  -- the chain value after the last entry it covers (SHA-256, hex)
  chain           TEXT NOT NULL CHECK (length(chain) = 64),
  sealed_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER IF NOT EXISTS trg_audit_seals_no_update BEFORE UPDATE ON audit_seals
BEGIN SELECT RAISE(ABORT, 'audit_seals is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_audit_seals_no_delete BEFORE DELETE ON audit_seals
BEGIN SELECT RAISE(ABORT, 'audit_seals is append-only'); END;
`
}
