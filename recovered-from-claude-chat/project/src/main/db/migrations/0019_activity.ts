import type { Migration } from '../migrate'

/**
 * 0019 — activity: notifications, and what Companies House says about the
 * practice's clients.
 *
 *   notifications       what each person is told: deadlines, Companies House
 *                       changes, follow-ups, tasks, backups and the licence.
 *                       Each stays until the person marks it done, or the app
 *                       does when the thing it was about is dealt with.
 *   notification_seen   what each person has already been told about, so the
 *                       same thing is never announced twice, even when many
 *                       were rolled into one summary.
 *   ch_company_state    the latest Companies House profile of each client
 *                       company: status, strike-off, overdue flags, last
 *                       filings, registered office. The daily check compares
 *                       against it.
 *   ch_changes          each change found, by the daily check or from the
 *                       Companies House stream, with a plain summary.
 *
 * Nothing in the practice's existing records changes.
 */
export const migration0019: Migration = {
  id: '0019_activity',
  description: 'Notifications, and Companies House changes for the practice’s clients',
  up: `
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('deadline', 'companies_house', 'follow_up', 'task', 'backup', 'licence')),
  severity    TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'urgent')),
  -- what it is about, so the app can mark it done when that is dealt with
  subject     TEXT,
  client_ref  TEXT,
  title       TEXT NOT NULL,
  body        TEXT,
  -- where Open goes: {"route": …, "clientRef": …, "window": …}
  target      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  done_at     TEXT,
  done_by     TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_person ON notifications(user_id, done_at, id);

CREATE TABLE IF NOT EXISTS notification_seen (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seen_key    TEXT NOT NULL,
  seen_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, seen_key)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS ch_company_state (
  company_number           TEXT PRIMARY KEY CHECK (length(company_number) = 8),
  company_name             TEXT,
  status                   TEXT,
  status_detail            TEXT,
  accounts_next_due        TEXT,
  accounts_overdue         INTEGER CHECK (accounts_overdue IN (0, 1)),
  last_accounts_made_up_to TEXT,
  cs_next_due              TEXT,
  cs_overdue               INTEGER CHECK (cs_overdue IN (0, 1)),
  cs_last_made_up_to       TEXT,
  registered_office        TEXT,
  has_insolvency_history   INTEGER CHECK (has_insolvency_history IN (0, 1)),
  has_charges              INTEGER CHECK (has_charges IN (0, 1)),
  checked_at               TEXT NOT NULL,
  -- the last check's problem, such as "Not found at Companies House"; null when it went through
  problem                  TEXT
);

CREATE TABLE IF NOT EXISTS ch_changes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_number  TEXT NOT NULL,
  client_ref      TEXT,
  source          TEXT NOT NULL CHECK (source IN ('check', 'stream')),
  category        TEXT NOT NULL CHECK (category IN ('status', 'strike_off', 'accounts_overdue', 'confirmation_overdue', 'accounts', 'confirmation', 'officers', 'psc', 'charges', 'insolvency', 'address', 'name', 'filing', 'other')),
  red_flag        INTEGER NOT NULL DEFAULT 0 CHECK (red_flag IN (0, 1)),
  summary         TEXT NOT NULL,
  detail          TEXT,
  -- one change is recorded once, however often the stream repeats it
  change_key      TEXT NOT NULL UNIQUE,
  published_at    TEXT,
  found_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ch_changes_found ON ch_changes(found_at);
CREATE INDEX IF NOT EXISTS idx_ch_changes_client ON ch_changes(client_ref, found_at);
`
}
