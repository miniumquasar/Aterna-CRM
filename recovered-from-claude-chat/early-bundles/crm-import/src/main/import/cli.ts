/**
 * Import CLI — the same pipeline the app uses, runnable from a terminal.
 *
 *   npx tsx src/main/import/cli.ts migrate  --db <file>
 *   npx tsx src/main/import/cli.ts preview  --db <file> --file <workbook.xlsx> [--out report.md] [--json report.json]
 *   npx tsx src/main/import/cli.ts commit   --db <file> --file <workbook.xlsx> --expect <fingerprint> [--by "Name"]
 *   npx tsx src/main/import/cli.ts rollback --db <file> --batch <id> [--by "Name"] [--force]
 *   npx tsx src/main/import/cli.ts batches  --db <file>
 *
 * Common options:
 *   --key <passphrase>    SQLCipher key (or env AETERNA_DB_KEY). Omit for an unkeyed scratch DB.
 *   --scratch <database.ts>  Create --db (must not exist) from the live v5 schema in that file, then migrate.
 *   --today YYYY-MM-DD    Practice date (default: today). Preview and commit must use the same day.
 *   --include-sensitive   Write auth codes, personal codes, gateway user ids. Refused unless keyed
 *                         with a real passphrase.
 *
 * `preview` never writes to the database.
 */

import { existsSync, writeFileSync } from 'node:fs'
import Database from 'better-sqlite3-multiple-ciphers'
import { applyMigrations } from '../db/migrate'
import { commitPreviewed, describeFile, listImportBatches, previewImport, rollbackImport } from './pipeline'
import { isIsoDate } from './core/rules'
import { createBaseDatabase } from '../../../scripts/base-schema'

const DEV_KEY = 'dev-only-change-me'

function args(argv: string[]): { cmd: string; opt: Record<string, string | true> } {
  const [cmd = 'help', ...rest] = argv
  const opt: Record<string, string | true> = {}
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i]
    if (!a.startsWith('--')) continue
    const next = rest[i + 1]
    if (next === undefined || next.startsWith('--')) opt[a.slice(2)] = true
    else {
      opt[a.slice(2)] = next
      i += 1
    }
  }
  return { cmd, opt }
}

function need(opt: Record<string, string | true>, name: string): string {
  const v = opt[name]
  if (typeof v !== 'string') throw new Error(`--${name} is required`)
  return v
}

function open(opt: Record<string, string | true>): { db: InstanceType<typeof Database>; keyed: boolean } {
  const path = need(opt, 'db')
  const scratch = typeof opt.scratch === 'string' ? opt.scratch : null
  if (scratch && existsSync(path)) throw new Error(`--scratch refuses to touch an existing file: ${path}`)
  if (!scratch && !existsSync(path)) throw new Error(`No database at ${path} (use --scratch <database.ts> to create one)`)
  const key = typeof opt.key === 'string' ? opt.key : process.env.AETERNA_DB_KEY
  const db = new Database(path)
  if (key) {
    db.pragma(`key='${key.replace(/'/g, "''")}'`) // same order as database.ts
    db.pragma(`cipher='sqlcipher'`)
  }
  db.pragma('user_version') // fails fast on a wrong key
  db.pragma('foreign_keys = ON')
  if (scratch) {
    createBaseDatabase(db, scratch)
    applyMigrations(db)
  }
  return { db, keyed: !!key && key !== DEV_KEY }
}

async function main(): Promise<void> {
  const { cmd, opt } = args(process.argv.slice(2))
  const today = typeof opt.today === 'string' ? opt.today : undefined
  if (today && !isIsoDate(today)) throw new Error('--today must be YYYY-MM-DD')

  if (cmd === 'help') {
    console.log('Commands: migrate | preview | commit | rollback | batches  (see header of src/main/import/cli.ts)')
    return
  }
  const { db, keyed } = open(opt)
  const includeSensitive = opt['include-sensitive'] === true
  if (includeSensitive && !keyed) {
    throw new Error('--include-sensitive refused: the database is not keyed with a real passphrase')
  }
  try {
    if (cmd === 'migrate') {
      const applied = applyMigrations(db)
      console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Schema already current.')
    } else if (cmd === 'preview') {
      const file = await describeFile(need(opt, 'file'))
      const before = (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n
      const { report, markdown } = await previewImport(db, file, { today, includeSensitive })
      const after = (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n
      if (after !== before) throw new Error('Internal: preview modified the database')
      if (typeof opt.out === 'string') writeFileSync(opt.out, markdown)
      if (typeof opt.json === 'string') writeFileSync(opt.json, JSON.stringify(report, null, 2))
      const t = report.totals
      console.log(`Dry run — nothing written.\n  insert ${t.insert} · update ${t.update} · unchanged ${t.unchanged} · link ${t.link} · conflicts ${t.conflicts} · issues ${t.issues}`)
      for (const i of report.insights) console.log(`  • ${i.title}: ${i.detail}`)
      console.log(`  fingerprint ${report.fingerprint}`)
    } else if (cmd === 'commit') {
      const file = await describeFile(need(opt, 'file'))
      const by = typeof opt.by === 'string' ? opt.by : 'cli'
      const res = await commitPreviewed(db, file, need(opt, 'expect'), by, { today, includeSensitive })
      console.log(`Committed batch ${res.batchId} (${res.batchUid}): ${JSON.stringify(res.totals)}`)
    } else if (cmd === 'rollback') {
      const by = typeof opt.by === 'string' ? opt.by : 'cli'
      const res = rollbackImport(db, Number(need(opt, 'batch')), by, { force: opt.force === true })
      console.log(`Rolled back batch ${res.batchId}: ${res.reverted} journal entries reverted`)
    } else if (cmd === 'batches') {
      for (const b of listImportBatches(db)) console.log(`${b.id}\t${b.status}\t${b.committed_at}\t${b.file_name}\t${b.stats_json}`)
    } else throw new Error(`Unknown command ${cmd}`)
  } finally {
    db.close()
  }
}

main().catch((err: unknown) => {
  console.error(`✖ ${(err as Error).message}`)
  process.exit(1)
})
