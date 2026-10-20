import type { Migration } from '../migrate'

/**
 * 0016 — email and backups.
 *
 *   backups   each backup records whether it was made by hand or on schedule,
 *             its format (1: a copy of the database; 2: a backup file with the
 *             documents), the fingerprint of the key it needs, how many clients
 *             and documents it holds, and when it was last test-restored and
 *             how that went. Earlier backups are marked as format 1, and as
 *             scheduled when the app made them.
 *   hashes    a cache of stored documents' fingerprints, so a backup only reads
 *             a document again when it has changed.
 *   emails    the message log records who a message went to, how it was sent
 *             (the mail app, SMTP, Microsoft 365, Resend or WhatsApp), the
 *             message's full text, the sending service's message id, and the
 *             error when sending failed.
 */
export const migration0016: Migration = {
  id: '0016_email_backups',
  description: 'Backups with documents (kind, format, key fingerprint, counts, last test) and a cache of document fingerprints; messages record recipients, method, full text and errors',
  addColumns: [
    { table: 'backup_registry', column: 'kind', definition: 'TEXT' },
    { table: 'backup_registry', column: 'format', definition: 'INTEGER' },
    { table: 'backup_registry', column: 'key_fingerprint', definition: 'TEXT' },
    { table: 'backup_registry', column: 'clients', definition: 'INTEGER' },
    { table: 'backup_registry', column: 'documents', definition: 'INTEGER' },
    { table: 'backup_registry', column: 'documents_bytes', definition: 'INTEGER' },
    { table: 'backup_registry', column: 'documents_missing', definition: 'INTEGER' },
    { table: 'backup_registry', column: 'tested_at', definition: 'TEXT' },
    { table: 'backup_registry', column: 'test_result', definition: 'TEXT' },
    { table: 'communication_log', column: 'recipients', definition: 'TEXT' },
    { table: 'communication_log', column: 'sent_via', definition: 'TEXT' },
    { table: 'communication_log', column: 'message_id', definition: 'TEXT' },
    { table: 'communication_log', column: 'error', definition: 'TEXT' },
    { table: 'communication_log', column: 'body', definition: 'TEXT' }
  ],
  up: `
UPDATE backup_registry SET kind = CASE WHEN created_by = 'system' THEN 'scheduled' ELSE 'manual' END WHERE kind IS NULL;
UPDATE backup_registry SET format = 1 WHERE format IS NULL;

CREATE TABLE IF NOT EXISTS backup_hashes (
  path      TEXT PRIMARY KEY,
  size      INTEGER NOT NULL,
  mtime_ms  REAL NOT NULL,
  ctime_ms  REAL NOT NULL,
  sha256    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backup_registry_created   ON backup_registry(created_at);
CREATE INDEX IF NOT EXISTS idx_communication_log_client  ON communication_log(client_ref, sent_at);
`
}
