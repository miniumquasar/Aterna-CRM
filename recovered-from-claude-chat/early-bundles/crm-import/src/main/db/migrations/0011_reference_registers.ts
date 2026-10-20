import type { Migration } from '../migrate'

/**
 * 0011 — references, agent authorisations and the credential vault.
 *
 *   practice_identifiers   the firm's own references (ARN, agent codes, AML, ICO, ACSP, …)
 *   client_identifiers     every client reference beyond the core columns on clients
 *   agent_authorisations   one row per client per tax service: status, method, dates
 *   vault_keys             passphrase verifier and key-derivation settings (never the key)
 *   credential_vault       non-HMRC portal logins; secrets AES-256-GCM encrypted under a
 *                          key derived from a passphrase that is never written anywhere
 *
 * Kinds, services and statuses are validated in code (src/shared/references.ts);
 * the CHECK constraints below are the last line of defence.
 */
export const migration0011: Migration = {
  id: '0011_reference_registers',
  description: 'Practice and client references, agent authorisations, credential vault',
  up: `
CREATE TABLE IF NOT EXISTS practice_identifiers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,
  value       TEXT NOT NULL CHECK (length(value) BETWEEN 1 AND 200),
  issuer      TEXT,
  context     TEXT,
  issued_on   TEXT CHECK (issued_on IS NULL OR issued_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  renewal_due TEXT CHECK (renewal_due IS NULL OR renewal_due GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  warning     TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kind, value)
);

CREATE TABLE IF NOT EXISTS client_identifiers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_ref  TEXT NOT NULL REFERENCES clients(ref) ON UPDATE CASCADE ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  value       TEXT NOT NULL CHECK (length(value) BETWEEN 1 AND 200),
  issuer      TEXT,
  context     TEXT,
  issued_on   TEXT CHECK (issued_on IS NULL OR issued_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  valid_to    TEXT CHECK (valid_to IS NULL OR valid_to GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  warning     TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_ref, kind, value)
);
CREATE INDEX IF NOT EXISTS idx_client_identifiers_client ON client_identifiers(client_ref);
CREATE INDEX IF NOT EXISTS idx_client_identifiers_value  ON client_identifiers(value);

CREATE TABLE IF NOT EXISTS agent_authorisations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_ref    TEXT NOT NULL REFERENCES clients(ref) ON UPDATE CASCADE ON DELETE CASCADE,
  service       TEXT NOT NULL,
  method        TEXT,
  status        TEXT NOT NULL DEFAULT 'not_requested'
                CHECK (status IN ('not_requested', 'requested', 'code_posted', 'active', 'expired', 'removed')),
  requested_on  TEXT CHECK (requested_on  IS NULL OR requested_on  GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  authorised_on TEXT CHECK (authorised_on IS NULL OR authorised_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  expires_on    TEXT CHECK (expires_on    IS NULL OR expires_on    GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  removed_on    TEXT CHECK (removed_on    IS NULL OR removed_on    GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  notes         TEXT,
  updated_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_ref, service)
);
CREATE INDEX IF NOT EXISTS idx_agent_authorisations_waiting ON agent_authorisations(status, expires_on);

CREATE TABLE IF NOT EXISTS vault_keys (
  version    INTEGER PRIMARY KEY,
  kdf        TEXT NOT NULL CHECK (kdf = 'scrypt'),
  salt       TEXT NOT NULL,
  n          INTEGER NOT NULL,
  r          INTEGER NOT NULL,
  p          INTEGER NOT NULL,
  verifier   TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credential_vault (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  owner            TEXT NOT NULL CHECK (owner IN ('client', 'practice')),
  client_ref       TEXT REFERENCES clients(ref) ON UPDATE CASCADE ON DELETE CASCADE,
  platform         TEXT NOT NULL CHECK (length(platform) BETWEEN 1 AND 120),
  login_id         TEXT,
  url              TEXT,
  notes            TEXT,
  secret_ct        TEXT,
  secret_iv        TEXT,
  secret_tag       TEXT,
  key_version      INTEGER REFERENCES vault_keys(version),
  reveal_count     INTEGER NOT NULL DEFAULT 0,
  last_revealed_at TEXT,
  last_revealed_by TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((owner = 'client') = (client_ref IS NOT NULL)),
  CHECK ((secret_ct IS NULL) = (secret_iv IS NULL) AND (secret_iv IS NULL) = (secret_tag IS NULL)),
  CHECK ((secret_ct IS NULL) = (key_version IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_credential_vault_client ON credential_vault(client_ref);
`
}
