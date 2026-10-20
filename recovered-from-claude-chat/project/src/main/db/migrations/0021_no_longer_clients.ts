import type { Migration } from '../migrate'

/**
 * 0021 — clients the practice no longer acts for (src/shared/client-status.ts).
 *
 *   statuses   Ceased and Dissolved join Former client on the practice's list
 *              of client statuses. All three mean "no longer a client": the
 *              records are kept in full, and everyday work leaves them out.
 *              Clients given Ceased by an earlier version keep it, and now
 *              count as no longer clients.
 *   the view   v_deadline_worklist, kept for anyone reading the database
 *              directly, leaves them out the same way the app does.
 *
 * No client's status or any other record is changed.
 */
export const migration0021: Migration = {
  id: '0021_no_longer_clients',
  description: 'Ceased and Dissolved join Former client as statuses for clients the practice no longer acts for',
  up: `
INSERT OR IGNORE INTO lookup_values (list_key, value_key, label, sort_order, is_system) VALUES
  ('client_status', 'Ceased', 'Ceased', 6, 1),
  ('client_status', 'Dissolved', 'Dissolved', 7, 1);

DROP VIEW IF EXISTS v_deadline_worklist;
CREATE VIEW v_deadline_worklist AS
SELECT cp.id, cp.client_ref, c.client_name, c.status AS client_status, cp.obligation, cp.period_end,
       cp.tax_year, cp.due_date, cp.due_date_basis,
       CAST(julianday(cp.due_date) - julianday(date('now', 'localtime')) AS INTEGER) AS days_remaining,
       cp.status, cp.assigned_to, cp.notes
FROM compliance_periods cp
JOIN clients c ON c.ref = cp.client_ref
WHERE cp.archived = 0
  AND cp.filed_date IS NULL
  AND cp.due_date IS NOT NULL
  AND cp.status NOT IN ('filed','not_applicable')
  AND LOWER(TRIM(COALESCE(c.status, ''))) NOT IN ('former client', 'ceased', 'dissolved')
  AND LOWER(TRIM(COALESCE(c.company_status, ''))) <> 'dissolved';
`
}

