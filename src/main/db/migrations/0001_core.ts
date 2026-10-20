/**
 * The core tables every domain builds on. Read this before writing SQL
 * against them; a domain changes them only through migrations in its own
 * number range (docs/DOMAINS.md).
 *
 * Conventions: STRICT tables; money in whole pence (`*_pence` INTEGER);
 * civil dates 'YYYY-MM-DD' and instants ISO 8601 UTC, both TEXT; booleans
 * INTEGER 0/1; sensitive values sealed by field-crypto in `*_enc` columns;
 * `created_at` everywhere and `updated_at` where rows change.
 */
import type { Migration } from '../migrate'
import { NOW, TIMESTAMPS, boolCheck, dateCheck, encryptedCheck } from '../sql'

const ROLE_CHECK = "CHECK (role IN ('partner', 'manager', 'staff'))"

const CLIENT_TYPES = ['company', 'llp', 'partnership', 'sole_trader', 'individual', 'trust', 'charity'] as const
const CLIENT_STATUSES = [
  'prospect',
  'onboarding',
  'active',
  'review_required',
  'dormant',
  'former_client',
  'ceased',
  'dissolved'
] as const
const CONTACT_ROLES = [
  'contact',
  'director',
  'psc',
  'secretary',
  'shareholder',
  'partner',
  'member',
  'trustee',
  'beneficiary',
  'payroll',
  'bookkeeper',
  'other'
] as const

const list = (values: readonly string[]): string => values.map((v) => `'${v}'`).join(', ')

export const migration0001Core: Migration = {
  id: '0001_core',
  up(db) {
    db.exec(`
-- Facts about this installation: install_id, created_at.
CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  ${TIMESTAMPS}
) STRICT;

INSERT INTO app_meta (key, value) VALUES
  ('install_id', lower(hex(randomblob(16)))),
  ('created_at', ${NOW});

-- People who can sign in. A person is never deleted while clients or past
-- work are under them (foreign keys refuse it); access is turned off instead.
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(username) BETWEEN 3 AND 64),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  email TEXT,
  role TEXT NOT NULL ${ROLE_CHECK},
  -- scrypt$N$r$p$salt$hash; null until the person sets a password from an invite.
  password_hash TEXT,
  active INTEGER NOT NULL DEFAULT 1 ${boolCheck('active')},
  must_change_password INTEGER NOT NULL DEFAULT 0 ${boolCheck('must_change_password')},
  failed_sign_ins INTEGER NOT NULL DEFAULT 0 CHECK (failed_sign_ins >= 0),
  locked_at TEXT,
  last_sign_in_at TEXT,
  password_changed_at TEXT,
  ${TIMESTAMPS},
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
) STRICT;
CREATE INDEX users_role ON users(role) WHERE active = 1;

-- A signed-in window. The id never leaves the main process.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY CHECK (length(id) >= 32),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT ${NOW},
  last_seen_at TEXT NOT NULL DEFAULT ${NOW},
  ended_at TEXT,
  end_reason TEXT CHECK (end_reason IN ('signed_out', 'idle', 'window_closed', 'expired', 'access_removed', 'app_restarted')),
  created_at TEXT NOT NULL DEFAULT ${NOW},
  CHECK ((ended_at IS NULL) = (end_reason IS NULL))
) STRICT;
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_open ON sessions(user_id) WHERE ended_at IS NULL;

-- Single-use, expiring invitations to join the practice.
CREATE TABLE invites (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  email TEXT,
  username TEXT COLLATE NOCASE,
  role TEXT NOT NULL ${ROLE_CHECK},
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  accepted_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TEXT,
  cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ${TIMESTAMPS},
  CHECK (accepted_at IS NULL OR cancelled_at IS NULL)
) STRICT;

-- Every attempt to sign in, for Security → Sign-in history.
CREATE TABLE sign_in_events (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'wrong_password', 'unknown_user', 'locked', 'access_off')),
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
) STRICT;
CREATE INDEX sign_in_events_user ON sign_in_events(user_id, created_at);
CREATE INDEX sign_in_events_time ON sign_in_events(created_at);

-- The practice itself: exactly one row once set up.
CREATE TABLE firm (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  trading_name TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  town TEXT,
  county TEXT,
  postcode TEXT,
  country TEXT NOT NULL DEFAULT 'United Kingdom',
  email TEXT,
  phone TEXT,
  website TEXT,
  company_number TEXT,
  vat_number TEXT,
  utr TEXT,
  paye_ref TEXT,
  ${TIMESTAMPS},
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
) STRICT;

-- Settings as JSON values by group and key (use src/main/db/settings.ts).
CREATE TABLE settings (
  "group" TEXT NOT NULL CHECK (length("group") > 0),
  key TEXT NOT NULL CHECK (length(key) > 0),
  value TEXT NOT NULL CHECK (json_valid(value)),
  ${TIMESTAMPS},
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY ("group", key)
) STRICT;

-- Clients. id is the key every client-linked table references; code
-- (CL0001) is the human-facing reference, changeable but never empty.
CREATE TABLE clients (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(code)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  trading_name TEXT,
  type TEXT NOT NULL DEFAULT 'company' CHECK (type IN (${list(CLIENT_TYPES)})),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (${list(CLIENT_STATUSES)})),
  company_number TEXT,
  -- As Companies House reports it: active, dissolved, liquidation, …
  company_status TEXT,
  incorporation_date TEXT ${dateCheck('incorporation_date')},
  year_end_month INTEGER CHECK (year_end_month BETWEEN 1 AND 12),
  year_end_day INTEGER CHECK (year_end_day BETWEEN 1 AND 31),
  utr TEXT,
  ct_utr TEXT,
  nino_enc TEXT ${encryptedCheck('nino_enc')},
  vat_number TEXT,
  -- Quarterly stagger 1 (Mar/Jun/Sep/Dec), 2 (Apr/Jul/Oct/Jan), 3 (May/Aug/Nov/Feb), or monthly / annual returns.
  vat_stagger TEXT CHECK (vat_stagger IN ('1', '2', '3', 'monthly', 'annual')),
  vat_scheme TEXT CHECK (vat_scheme IN ('standard', 'flat_rate', 'cash_accounting', 'annual_accounting')),
  mtd_vat INTEGER NOT NULL DEFAULT 0 ${boolCheck('mtd_vat')},
  paye_ref TEXT,
  accounts_office_ref TEXT,
  ch_auth_code_enc TEXT ${encryptedCheck('ch_auth_code_enc')},
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  town TEXT,
  county TEXT,
  postcode TEXT,
  country TEXT,
  -- Who looks after the client day to day (staff see only their own clients), and the responsible partner.
  assigned_to INTEGER REFERENCES users(id),
  partner_id INTEGER REFERENCES users(id),
  engagement_letter_on TEXT ${dateCheck('engagement_letter_on')},
  -- When the relationship ended (AML records are kept five years after it).
  relationship_ended_on TEXT ${dateCheck('relationship_ended_on')},
  fee_pence INTEGER CHECK (fee_pence IS NULL OR fee_pence >= 0),
  notes TEXT,
  -- The client's id in the workbook or system it was imported from.
  legacy_ref TEXT,
  ${TIMESTAMPS},
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  CHECK ((year_end_month IS NULL) = (year_end_day IS NULL)),
  CHECK (year_end_day IS NULL OR year_end_day <= CASE year_end_month WHEN 2 THEN 29 WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END)
) STRICT;
CREATE INDEX clients_status ON clients(status);
CREATE INDEX clients_assigned ON clients(assigned_to);
CREATE INDEX clients_partner ON clients(partner_id);
CREATE INDEX clients_company_number ON clients(company_number) WHERE company_number IS NOT NULL;
CREATE INDEX clients_name ON clients(name COLLATE NOCASE);
CREATE INDEX clients_legacy_ref ON clients(legacy_ref) WHERE legacy_ref IS NOT NULL;

-- The services the practice provides each client, with their fees.
CREATE TABLE client_services (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- accounts, ct600, vat, payroll, self_assessment, confirmation_statement, bookkeeping, cis, p11d, pension, …
  service TEXT NOT NULL CHECK (length(service) > 0),
  frequency TEXT NOT NULL DEFAULT 'annual' CHECK (frequency IN ('one_off', 'weekly', 'monthly', 'quarterly', 'annual')),
  fee_pence INTEGER CHECK (fee_pence IS NULL OR fee_pence >= 0),
  starts_on TEXT ${dateCheck('starts_on')},
  ends_on TEXT ${dateCheck('ends_on')},
  active INTEGER NOT NULL DEFAULT 1 ${boolCheck('active')},
  notes TEXT,
  ${TIMESTAMPS},
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
) STRICT;
CREATE INDEX client_services_client ON client_services(client_id);
CREATE INDEX client_services_service ON client_services(service) WHERE active = 1;

-- People at the client: directors, PSCs, payroll contacts and so on.
CREATE TABLE client_contacts (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  role TEXT NOT NULL DEFAULT 'contact' CHECK (role IN (${list(CONTACT_ROLES)})),
  email TEXT,
  phone TEXT,
  mobile TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 ${boolCheck('is_primary')},
  -- The Companies House personal code (identity verification).
  ch_personal_code TEXT,
  date_of_birth TEXT ${dateCheck('date_of_birth')},
  address_line1 TEXT,
  address_line2 TEXT,
  town TEXT,
  county TEXT,
  postcode TEXT,
  country TEXT,
  notes TEXT,
  ${TIMESTAMPS},
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
) STRICT;
CREATE INDEX client_contacts_client ON client_contacts(client_id);
CREATE UNIQUE INDEX client_contacts_one_primary ON client_contacts(client_id) WHERE is_primary = 1;

-- Every change, hash-chained (src/main/access/audit.ts). Append-only: the
-- triggers refuse edits and deletions, and the chain shows any made around
-- them. No foreign keys: entries outlive the people and clients they name.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'system')),
  actor_id INTEGER,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (length(action) > 0),
  entity TEXT NOT NULL CHECK (length(entity) > 0),
  entity_id TEXT,
  client_id INTEGER,
  summary TEXT,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  prev_hash TEXT NOT NULL CHECK (length(prev_hash) = 64),
  hash TEXT NOT NULL UNIQUE CHECK (length(hash) = 64),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX audit_log_client ON audit_log(client_id, id) WHERE client_id IS NOT NULL;
CREATE INDEX audit_log_entity ON audit_log(entity, entity_id);
CREATE INDEX audit_log_actor ON audit_log(actor_id, id);
CREATE INDEX audit_log_time ON audit_log(created_at);
CREATE TRIGGER audit_log_append_only_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'The audit log can only be added to.'); END;
CREATE TRIGGER audit_log_append_only_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'The audit log can only be added to.'); END;

-- The data issue register (src/main/access/issues.ts): references that fail
-- their check, import findings, migration repairs. One row per dedupe_key.
CREATE TABLE data_issues (
  id INTEGER PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  -- reference_check, import, migration, onboarding, …
  source TEXT NOT NULL CHECK (length(source) > 0),
  kind TEXT NOT NULL CHECK (length(kind) > 0),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'waived')),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  detail TEXT,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  entity TEXT,
  entity_id TEXT,
  field TEXT,
  first_seen_at TEXT NOT NULL DEFAULT ${NOW},
  last_seen_at TEXT NOT NULL DEFAULT ${NOW},
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  waived_reason TEXT,
  ${TIMESTAMPS},
  CHECK (status <> 'waived' OR waived_reason IS NOT NULL)
) STRICT;
CREATE INDEX data_issues_status ON data_issues(status);
CREATE INDEX data_issues_client ON data_issues(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX data_issues_entity ON data_issues(entity, entity_id);

-- Notifications (src/main/access/notify.ts), for one person or an audience.
-- subject_key names what a notification is about ('deadline:42'), so it is
-- marked done automatically once that is dealt with.
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  audience TEXT CHECK (audience IN ('everyone', 'managers', 'partners')),
  kind TEXT NOT NULL CHECK (length(kind) > 0),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'danger')),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  body TEXT,
  subject_key TEXT,
  dedupe_key TEXT UNIQUE,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  route TEXT,
  route_params TEXT CHECK (route_params IS NULL OR json_valid(route_params)),
  read_at TEXT,
  done_at TEXT,
  done_reason TEXT CHECK (done_reason IN ('dealt_with', 'dismissed', 'expired')),
  ${TIMESTAMPS},
  CHECK ((recipient_id IS NULL) <> (audience IS NULL)),
  CHECK ((done_at IS NULL) = (done_reason IS NULL))
) STRICT;
CREATE INDEX notifications_recipient ON notifications(recipient_id, done_at);
CREATE INDEX notifications_open_subject ON notifications(subject_key) WHERE done_at IS NULL;
`)
  }
}
