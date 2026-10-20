/**
 * Every migration, by domain. Each domain lists its migrations in its own
 * folder (<range>_<domain>/index.ts), so adding one never touches this file.
 * migrate() applies them in id order.
 */
import type { Migration } from '../migrate'
import { migration0001Core } from './0001_core'
import { authMigrations } from './0100_auth'
import { licenceMigrations } from './0200_licence'
import { backupMigrations } from './0300_backup'
import { clientsMigrations } from './0400_clients'
import { complianceMigrations } from './0500_compliance'
import { workMigrations } from './0600_work'
import { amlMigrations } from './0700_aml'
import { commsMigrations } from './0800_comms'
import { referencesMigrations } from './0900_references'
import { importMigrations } from './1000_import'
import { insightsMigrations } from './1100_insights'
import { analyticsMigrations } from './1150_analytics'
import { integrationsMigrations } from './1200_integrations'

export interface MigrationGroup {
  domain: string
  /** The lowest and highest id number the domain may use. */
  from: number
  to: number
  migrations: readonly Migration[]
}

export const MIGRATION_GROUPS: readonly MigrationGroup[] = [
  { domain: 'core', from: 1, to: 99, migrations: [migration0001Core] },
  { domain: 'auth', from: 100, to: 199, migrations: authMigrations },
  { domain: 'licence', from: 200, to: 299, migrations: licenceMigrations },
  { domain: 'backup', from: 300, to: 399, migrations: backupMigrations },
  { domain: 'clients', from: 400, to: 499, migrations: clientsMigrations },
  { domain: 'compliance', from: 500, to: 599, migrations: complianceMigrations },
  { domain: 'work', from: 600, to: 699, migrations: workMigrations },
  { domain: 'aml', from: 700, to: 799, migrations: amlMigrations },
  { domain: 'comms', from: 800, to: 899, migrations: commsMigrations },
  { domain: 'references', from: 900, to: 999, migrations: referencesMigrations },
  { domain: 'import', from: 1000, to: 1099, migrations: importMigrations },
  { domain: 'insights', from: 1100, to: 1149, migrations: insightsMigrations },
  { domain: 'analytics', from: 1150, to: 1199, migrations: analyticsMigrations },
  { domain: 'integrations', from: 1200, to: 1299, migrations: integrationsMigrations }
]

/** Every migration, in the order they apply. */
export const MIGRATIONS: readonly Migration[] = MIGRATION_GROUPS.flatMap((g) => g.migrations).sort((a, b) => a.id.localeCompare(b.id))
