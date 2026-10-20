import type { Migration } from '../migrate'

/**
 * 0007 — practice registers + import provenance.
 *
 * Design rules used throughout:
 *   • New child tables key on clients.ref (the join key every existing table
 *     uses) with a real FOREIGN KEY, ON UPDATE CASCADE so renaming a ref
 *     follows through, ON DELETE CASCADE to match clients:delete behaviour.
 *   • Workflow-critical vocabularies (obligation, filing status, severity)
 *     are CHECK-constrained because code branches on them. Descriptive
 *     vocabularies (contact type, relationship type, staff…) live in
 *     lookup_values so partners can extend them without a migration.
 *   • Anything a future source brings that has no column goes into
 *     custom_field_values — new data varieties never need a schema change.
 *   • import_changes is append-only (triggers) — it is the audit trail and
 *     the rollback journal for every import batch.
 */
export const migration0007: Migration = {
  id: '0007_practice_registers',
  description: 'Practice registers, contacts, deadlines, data issues, lookups, custom fields, import provenance',
  addColumns: [
    { table: 'clients', column: 'legacy_ref', definition: 'TEXT' },
    { table: 'clients', column: 'company_status', definition: 'TEXT' },
    { table: 'clients', column: 'accounting_ref_date', definition: 'TEXT' },
    { table: 'clients', column: 'vat_stagger', definition: 'TEXT' }
  ],
  up: `
-- ── Import provenance & sync ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_batches (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_uid        TEXT NOT NULL UNIQUE,
  adapter_id       TEXT NOT NULL,
  adapter_version  TEXT NOT NULL,
  source_system    TEXT NOT NULL,
  file_name        TEXT NOT NULL,
  file_sha256      TEXT NOT NULL,
  file_size        INTEGER NOT NULL,
  plan_fingerprint TEXT NOT NULL,
  options_json     TEXT NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL CHECK (status IN ('committed','rolled_back','failed')),
  stats_json       TEXT NOT NULL DEFAULT '{}',
  error            TEXT,
  committed_at     TEXT NOT NULL DEFAULT (datetime('now')),
  committed_by     TEXT,
  rolled_back_at   TEXT,
  rolled_back_by   TEXT
);

CREATE TABLE IF NOT EXISTS external_ids (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  source_system  TEXT NOT NULL,
  entity_table   TEXT NOT NULL,
  external_key   TEXT NOT NULL,
  entity_id      INTEGER NOT NULL,
  snapshot_json  TEXT NOT NULL DEFAULT '{}',
  first_batch_id INTEGER REFERENCES import_batches(id),
  last_batch_id  INTEGER REFERENCES import_batches(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_system, entity_table, external_key)
);
CREATE INDEX IF NOT EXISTS idx_external_ids_entity ON external_ids(entity_table, entity_id);

CREATE TABLE IF NOT EXISTS import_changes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id            INTEGER NOT NULL REFERENCES import_batches(id),
  entity_table        TEXT NOT NULL,
  entity_id           INTEGER NOT NULL,
  external_key        TEXT NOT NULL,
  action              TEXT NOT NULL CHECK (action IN ('insert','update','link')),
  before_json         TEXT,
  after_json          TEXT,
  external_id_created INTEGER NOT NULL DEFAULT 0,
  prev_snapshot_json  TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_import_changes_batch ON import_changes(batch_id);
CREATE TRIGGER IF NOT EXISTS trg_import_changes_no_update BEFORE UPDATE ON import_changes
BEGIN SELECT RAISE(ABORT, 'import_changes is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_import_changes_no_delete BEFORE DELETE ON import_changes
BEGIN SELECT RAISE(ABORT, 'import_changes is append-only'); END;

-- ── Clients: indexes for matching ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_reg_no     ON clients(reg_no);
CREATE INDEX IF NOT EXISTS idx_clients_utr        ON clients(utr);
CREATE INDEX IF NOT EXISTS idx_clients_legacy_ref ON clients(legacy_ref);

-- ── Contacts (many per client) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_contacts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  client_ref       TEXT NOT NULL REFERENCES clients(ref) ON UPDATE CASCADE ON DELETE CASCADE,
  contact_type     TEXT NOT NULL DEFAULT 'other',
  title            TEXT,
  name             TEXT,
  role             TEXT,
  phone            TEXT,
  email            TEXT,
  is_primary       INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  ch_personal_code TEXT,
  idv_status       TEXT NOT NULL DEFAULT 'unknown'
                     CHECK (idv_status IN ('unknown','code_held','verified','not_required')),
  idv_verified_on  TEXT,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_client_contacts_ref   ON client_contacts(client_ref);
CREATE INDEX IF NOT EXISTS idx_client_contacts_email ON client_contacts(email);
CREATE UNIQUE INDEX IF NOT EXISTS ux_client_contacts_primary ON client_contacts(client_ref) WHERE is_primary = 1;

-- ── Aliases & relationships ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_aliases (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_ref TEXT NOT NULL REFERENCES clients(ref) ON UPDATE CASCADE ON DELETE CASCADE,
  alias      TEXT NOT NULL,
  alias_norm TEXT NOT NULL,
  alias_type TEXT NOT NULL DEFAULT 'also_known_as',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_ref, alias_norm)
);
CREATE INDEX IF NOT EXISTS idx_client_aliases_norm ON client_aliases(alias_norm);

CREATE TABLE IF NOT EXISTS client_relationships (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  from_client_ref   TEXT NOT NULL REFERENCES clients(ref) ON UPDATE CASCADE ON DELETE CASCADE,
  to_client_ref     TEXT NOT NULL REFERENCES clients(ref) ON UPDATE CASCADE ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  basis             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (from_client_ref, to_client_ref, relationship_type),
  CHECK (from_client_ref <> to_client_ref)
);
CREATE INDEX IF NOT EXISTS idx_client_rel_to ON client_relationships(to_client_ref);

-- ── Compliance periods: one row per obligation per period ─────────────────
CREATE TABLE IF NOT EXISTS compliance_periods (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  client_ref     TEXT NOT NULL REFERENCES clients(ref) ON UPDATE CASCADE ON DELETE CASCADE,
  obligation     TEXT NOT NULL CHECK (obligation IN ('confirmation_statement','annual_accounts','ct600','ct_payment',
                   'vat_return','self_assessment','p11d','ae_redeclaration','payroll_rti','cis_return','other')),
  period_key     TEXT NOT NULL,
  period_start   TEXT,
  period_end     TEXT,
  tax_year       TEXT,
  due_date       TEXT,
  due_date_basis TEXT CHECK (due_date_basis IN ('rule','source','source_matches_rule','source_differs_from_rule','manual')),
  rule_due_date  TEXT,
  filed_date     TEXT,
  status         TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','information_requested',
                   'records_received','in_progress','awaiting_approval','filed','not_applicable','unknown')),
  assigned_to    TEXT,
  archived       INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  reference      TEXT,
  details_json   TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_ref, obligation, period_key)
);
CREATE INDEX IF NOT EXISTS idx_cp_client   ON compliance_periods(client_ref);
CREATE INDEX IF NOT EXISTS idx_cp_open_due ON compliance_periods(due_date) WHERE archived = 0 AND filed_date IS NULL;

CREATE VIEW IF NOT EXISTS v_deadline_worklist AS
SELECT cp.id, cp.client_ref, c.client_name, c.status AS client_status, cp.obligation, cp.period_end,
       cp.tax_year, cp.due_date, cp.due_date_basis,
       CAST(julianday(cp.due_date) - julianday(date('now')) AS INTEGER) AS days_remaining,
       cp.status, cp.assigned_to, cp.notes
FROM compliance_periods cp
JOIN clients c ON c.ref = cp.client_ref
WHERE cp.archived = 0
  AND cp.filed_date IS NULL
  AND cp.due_date IS NOT NULL
  AND cp.status NOT IN ('filed','not_applicable')
  AND COALESCE(c.status, 'Active') <> 'Former client'
  AND COALESCE(c.company_status, '') <> 'dissolved';

-- ── Payroll ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_schemes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  client_ref          TEXT NOT NULL REFERENCES clients(ref) ON UPDATE CASCADE ON DELETE CASCADE,
  paye_reference      TEXT NOT NULL,
  accounts_office_ref TEXT,
  pay_frequency       TEXT,
  scheme_status       TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (scheme_status IN ('active','ceased','dormant','not_started','unknown')),
  payroll_contact_id  INTEGER REFERENCES client_contacts(id) ON DELETE SET NULL,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_ref, paye_reference)
);
CREATE TABLE IF NOT EXISTS payroll_scheme_years (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  scheme_id          INTEGER NOT NULL REFERENCES payroll_schemes(id) ON DELETE CASCADE,
  tax_year           TEXT NOT NULL,
  employees          INTEGER,
  cis_subcontractors INTEGER,
  rti_status         TEXT,
  payroll_file       TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (scheme_id, tax_year)
);

-- ── Auto-enrolment ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pension_schemes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  client_ref         TEXT NOT NULL REFERENCES clients(ref) ON UPDATE CASCADE ON DELETE CASCADE,
  letter_code        TEXT,
  duties_start_date  TEXT,
  provider           TEXT,
  declaration_date   TEXT,
  declaration_status TEXT,
  last_payment_date  TEXT,
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pension_client ON pension_schemes(client_ref);
CREATE INDEX IF NOT EXISTS idx_pension_letter ON pension_schemes(letter_code);

-- ── Self assessment ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sa_registrations (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  client_ref           TEXT NOT NULL UNIQUE REFERENCES clients(ref) ON UPDATE CASCADE ON DELETE CASCADE,
  utr                  TEXT,
  business_description TEXT,
  filing_route         TEXT,
  first_year_on_file   TEXT,
  last_year_on_file    TEXT,
  register_status      TEXT,
  notes                TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS client_income_sources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_ref  TEXT NOT NULL REFERENCES clients(ref) ON UPDATE CASCADE ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('self_employment','property','partnership','employment',
                'company_director','cis_subcontractor','pension','other')),
  detail      TEXT NOT NULL DEFAULT '',
  raw_text    TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_ref, source_type, detail)
);

-- ── Data-quality issue register ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_issues (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_key          TEXT NOT NULL UNIQUE,
  severity           TEXT NOT NULL CHECK (severity IN ('high','medium','low')),
  issue_type         TEXT NOT NULL DEFAULT 'other',
  entity_table       TEXT,
  client_ref         TEXT REFERENCES clients(ref) ON UPDATE CASCADE ON DELETE SET NULL,
  related_client_ref TEXT REFERENCES clients(ref) ON UPDATE CASCADE ON DELETE SET NULL,
  field              TEXT,
  description        TEXT NOT NULL,
  suggested_action   TEXT,
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','accepted_risk')),
  source             TEXT,
  resolved_at        TEXT,
  resolved_by        TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_data_issues_client ON data_issues(client_ref);
CREATE INDEX IF NOT EXISTS idx_data_issues_open   ON data_issues(severity) WHERE status IN ('open','in_progress');

-- ── User-extendable vocabularies ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lookup_values (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  list_key   TEXT NOT NULL,
  value_key  TEXT NOT NULL,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system  INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (list_key, value_key)
);
INSERT OR IGNORE INTO lookup_values (list_key, value_key, label, sort_order, is_system) VALUES
  ('client_status','Active','Active',1,1), ('client_status','Prospect','Prospect',2,1),
  ('client_status','Dormant','Dormant',3,1), ('client_status','Review required','Review required',4,1),
  ('client_status','Former client','Former client',5,1),
  ('company_status','active','Active',1,1), ('company_status','dissolved','Dissolved',2,1),
  ('company_status','strike_off','Strike-off action',3,1), ('company_status','liquidation','In liquidation',4,1),
  ('company_status','administration','In administration',5,1), ('company_status','not_applicable','Not applicable (individual)',6,1),
  ('company_status','unknown','Unknown',7,1),
  ('contact_type','primary','Primary',1,1), ('contact_type','director','Director',2,1),
  ('contact_type','payroll','Payroll',3,1), ('contact_type','bookkeeper','Bookkeeper',4,1),
  ('contact_type','accountant','Accountant',5,1), ('contact_type','other','Other',6,1),
  ('relationship_type','director_of','Director of',1,1), ('relationship_type','connected_to','Connected to',2,1),
  ('relationship_type','shareholder_of','Shareholder of',3,1), ('relationship_type','spouse_or_partner','Spouse / partner',4,1),
  ('relationship_type','group_member','Group member',5,1),
  ('filing_route','own_agent','Our agent gateway',1,1), ('filing_route','other_agent','Another agent',2,1),
  ('filing_route','client_gateway','Client''s own gateway',3,1), ('filing_route','software','Software filing',4,1),
  ('filing_route','unknown','Unknown',5,1);

-- ── Custom fields: new data varieties without schema changes ──────────────
CREATE TABLE IF NOT EXISTS custom_field_defs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_table TEXT NOT NULL CHECK (entity_table IN ('clients','client_contacts','compliance_periods')),
  field_key    TEXT NOT NULL,
  label        TEXT NOT NULL,
  data_type    TEXT NOT NULL DEFAULT 'text' CHECK (data_type IN ('text','number','date','boolean','list')),
  list_key     TEXT,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entity_table, field_key)
);
CREATE TABLE IF NOT EXISTS custom_field_values (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_table TEXT NOT NULL,
  entity_id    INTEGER NOT NULL,
  field_key    TEXT NOT NULL,
  value        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entity_table, entity_id, field_key)
);
CREATE TRIGGER IF NOT EXISTS trg_cfv_clients_delete AFTER DELETE ON clients
BEGIN DELETE FROM custom_field_values WHERE entity_table = 'clients' AND entity_id = OLD.id; END;
CREATE TRIGGER IF NOT EXISTS trg_cfv_contacts_delete AFTER DELETE ON client_contacts
BEGIN DELETE FROM custom_field_values WHERE entity_table = 'client_contacts' AND entity_id = OLD.id; END;
CREATE TRIGGER IF NOT EXISTS trg_cfv_periods_delete AFTER DELETE ON compliance_periods
BEGIN DELETE FROM custom_field_values WHERE entity_table = 'compliance_periods' AND entity_id = OLD.id; END;
`
}
