import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { Migration } from '../migrate'

/**
 * 0010 — real foreign keys from every client-linked table to clients(ref).
 *
 * SQLite cannot add a constraint to an existing table, so each table is
 * rebuilt (sqlite.org/lang_altertable.html, "other kinds of table schema
 * changes"): create a copy whose client_ref column carries the constraint,
 * copy every row (ids included), drop the original, rename the copy, put the
 * indexes back, and keep the AUTOINCREMENT counter so ids are never reused.
 * The copy is made from each table's *current* definition, so columns added
 * by any earlier version of the app are kept.
 *
 *   ON UPDATE CASCADE everywhere: a changed client ref follows to its records.
 *   ON DELETE RESTRICT for records the practice must keep (payments, receipts,
 *     HMRC submissions, AML checks, documents, WIP): the database itself
 *     refuses to delete a client that still has them.
 *   ON DELETE CASCADE for everything else that belongs to the client.
 *
 * Records pointing at a client that no longer exists (left behind by the old
 * delete handler) are never dropped:
 *   - a ref that differs only by case or spacing from exactly one client is
 *     re-pointed to that client;
 *   - otherwise a placeholder "Former client" is created under that ref.
 * Each repair is logged in the data-issue register for review.
 *
 * email_templates is left out on purpose: its client_ref uses '' to mean a
 * global template, so it keeps a rename trigger instead. homomorphic_shares
 * (phase-9 leftover) is left out too.
 */

const RETAINED = ['payments', 'payment_receipts', 'hmrc_submissions', 'aml_records', 'documents', 'wip_items'] as const
const OWNED = [
  'client_services', 'interactions', 'tasks', 'ai_conversations', 'communication_log', 'personal_info', 'addresses',
  'logins', 'gdpr_consent', 'partnership_members', 'trust_members', 'onboarding_observations'
] as const
const BLANK_REF = 'ORPHANED-BLANK-REF'

type Row = Record<string, unknown>
const q = (name: string): string => `"${name.replace(/"/g, '""')}"`

/** Splits the column/constraint list of a CREATE TABLE at top-level commas (quotes, comments and nesting aware). */
function splitDefinitions(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i]
    if (c === "'" || c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c
      i = body.indexOf(close, i + 1)
      if (i < 0) throw new Error('Unterminated quote in table definition')
    } else if (c === '-' && body[i + 1] === '-') {
      const nl = body.indexOf('\n', i)
      i = nl < 0 ? body.length : nl
    } else if (c === '/' && body[i + 1] === '*') {
      i = body.indexOf('*/', i + 2) + 1
    } else if (c === '(') depth += 1
    else if (c === ')') depth -= 1
    else if (c === ',' && depth === 0) {
      parts.push(body.slice(start, i))
      start = i + 1
    }
  }
  parts.push(body.slice(start))
  return parts
}

/** The table's current CREATE statement, renamed and with the constraint added to client_ref. */
export function withForeignKey(createSql: string, newName: string, onDelete: 'RESTRICT' | 'CASCADE'): string {
  const open = createSql.indexOf('(')
  const close = createSql.lastIndexOf(')')
  const parts = splitDefinitions(createSql.slice(open + 1, close))
  const i = parts.findIndex((p) => /^\s*["`[]?client_ref["`\]]?\s/i.test(p))
  if (i < 0) throw new Error('No client_ref column in table definition')
  parts[i] = `${parts[i].replace(/\s+$/, '')} REFERENCES clients(ref) ON UPDATE CASCADE ON DELETE ${onDelete}`
  return `CREATE TABLE ${q(newName)} (${parts.join(',')}\n)`
}

function hasClientForeignKey(db: Database, table: string): boolean {
  return (db.prepare(`PRAGMA foreign_key_list(${q(table)})`).all() as Array<{ from: string; table: string }>)
    .some((f) => f.from === 'client_ref' && f.table === 'clients')
}

function issue(db: Database, key: string, table: string, clientRef: string, description: string, severity: 'medium' | 'low'): void {
  db.prepare(`INSERT OR IGNORE INTO data_issues (issue_key, severity, issue_type, entity_table, client_ref, field, description,
      suggested_action, status, source) VALUES (?, ?, 'migration:client_link', ?, ?, 'client_ref', ?, ?, 'open', 'migration 0010')`)
    .run(key, severity, table, clientRef, description,
      severity === 'low' ? 'No action needed unless the match is wrong.' : 'Merge these records into the right client, or delete them if they are not needed.')
}

/** Points every client_ref at a real client: blank → NULL or a placeholder, near-miss → the matching client, else a placeholder. */
function repairOrphans(db: Database, table: string): void {
  const notNull = (db.prepare(`PRAGMA table_info(${q(table)})`).all() as Array<{ name: string; notnull: number; pk: number }>)
    .some((c) => c.name === 'client_ref' && (c.notnull || c.pk))
  const blanks = (db.prepare(`SELECT count(*) AS n FROM ${q(table)} WHERE client_ref IS NOT NULL AND trim(client_ref) = ''`).get() as { n: number }).n
  if (blanks) {
    if (notNull) db.prepare(`UPDATE ${q(table)} SET client_ref = ? WHERE client_ref IS NOT NULL AND trim(client_ref) = ''`).run(BLANK_REF)
    else db.prepare(`UPDATE ${q(table)} SET client_ref = NULL WHERE client_ref IS NOT NULL AND trim(client_ref) = ''`).run()
  }
  const orphans = db.prepare(`SELECT client_ref AS ref, count(*) AS n FROM ${q(table)} t
      WHERE client_ref IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.ref = t.client_ref) GROUP BY client_ref`)
    .all() as Array<{ ref: string; n: number }>
  for (const o of orphans) {
    const matches = db.prepare('SELECT ref FROM clients WHERE upper(trim(ref)) = upper(trim(?))').all(o.ref) as Array<{ ref: string }>
    if (matches.length === 1 && o.ref !== BLANK_REF) {
      db.prepare(`UPDATE ${q(table)} SET client_ref = ? WHERE client_ref = ?`).run(matches[0].ref, o.ref)
      issue(db, `MIG0010:repaired:${table}:${o.ref}`, table, matches[0].ref,
        `${o.n} ${table.replace(/_/g, ' ')} record(s) referred to client ref "${o.ref}"; they were linked to client ${matches[0].ref}, which differs only by case or spacing.`, 'low')
      continue
    }
    if (!db.prepare('SELECT 1 FROM clients WHERE ref = ?').get(o.ref)) {
      db.prepare(`INSERT INTO clients (ref, client_name, status, remarks) VALUES (?, ?, 'Former client', ?)`)
        .run(o.ref, o.ref === BLANK_REF ? 'Records with no client ref' : `Unknown client ${o.ref}`,
          'Placeholder created by migration 0010: records referred to this client ref but no such client existed.')
    }
    issue(db, `MIG0010:placeholder:${table}:${o.ref}`, table, o.ref,
      `${o.n} ${table.replace(/_/g, ' ')} record(s) referred to client ref "${o.ref}", which did not exist. A placeholder client was created so the records stay linked.`, 'medium')
  }
}

function rebuild(db: Database, table: string, onDelete: 'RESTRICT' | 'CASCADE'): void {
  const def = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { sql: string } | undefined
  if (!def || hasClientForeignKey(db, table)) return // absent in this database, or already done
  repairOrphans(db, table)
  const indexes = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL").all(table) as Array<{ sql: string }>).map((r) => r.sql)
  const triggers = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?").all(table) as Array<{ sql: string }>).map((r) => r.sql)
  const hasSequence = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'sqlite_sequence'").get()
  const seq = hasSequence ? (db.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(table) as { seq: number } | undefined)?.seq : undefined
  const columns = (db.prepare(`PRAGMA table_info(${q(table)})`).all() as Array<{ name: string }>).map((c) => q(c.name)).join(', ')
  const tmp = `${table}__fk_rebuild`
  const before = (db.prepare(`SELECT count(*) AS n FROM ${q(table)}`).get() as { n: number }).n

  db.exec(withForeignKey(def.sql, tmp, onDelete))
  db.exec(`INSERT INTO ${q(tmp)} (${columns}) SELECT ${columns} FROM ${q(table)}`)
  db.exec(`DROP TABLE ${q(table)}`)
  db.exec(`ALTER TABLE ${q(tmp)} RENAME TO ${q(table)}`)
  for (const sql of [...indexes, ...triggers]) db.exec(sql)
  if (seq !== undefined) {
    db.prepare('UPDATE sqlite_sequence SET seq = max(seq, ?) WHERE name = ?').run(seq, table)
  }
  const after = (db.prepare(`SELECT count(*) AS n FROM ${q(table)}`).get() as { n: number }).n
  if (after !== before) throw new Error(`Rebuilding ${table} changed its row count (${before} → ${after})`)
}

export const migration0010: Migration = {
  id: '0010_client_foreign_keys',
  description: 'Foreign keys from client-linked tables to clients(ref); orphaned records repaired or kept under placeholders',
  foreignKeysOff: true,
  up: `
DROP TRIGGER IF EXISTS trg_clients_ref_rename;
CREATE TRIGGER IF NOT EXISTS trg_email_templates_ref_rename
AFTER UPDATE OF ref ON clients
WHEN OLD.ref IS NOT NULL AND OLD.ref IS NOT NEW.ref
BEGIN
  UPDATE email_templates SET client_ref = NEW.ref WHERE client_ref = OLD.ref;
END;
`,
  run: {
    version: '1',
    apply: (db: Database): void => {
      for (const t of RETAINED) rebuild(db, t, 'RESTRICT')
      for (const t of OWNED) rebuild(db, t, 'CASCADE')
    }
  }
}

export type { Row }
