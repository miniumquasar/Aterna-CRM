/**
 * The clients the practice acts for now, as SQL: everyday work (deadlines,
 * risk, the forecast, the Companies House check, onboarding) reads only these.
 * The definition is src/shared/client-status.ts, so the screens agree.
 */
import { NO_LONGER_STATUSES } from '../../shared/client-status'

const LIST = NO_LONGER_STATUSES.map((s) => `'${s.toLowerCase().replace(/'/g, "''")}'`).join(', ')

/** A condition that is true for a current client; `alias` is the clients table's alias in the query. */
export const currentClientSql = (alias = 'c'): string =>
  `LOWER(TRIM(COALESCE(${alias}.status, ''))) NOT IN (${LIST}) AND LOWER(TRIM(COALESCE(${alias}.company_status, ''))) <> 'dissolved'`
