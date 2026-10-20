/**
 * The page a start-up hook opens when the database key is missing, damaged
 * or wrong: unlock with the recovery sheet. App.tsx shows it instead of the
 * app when the page is opened at #/unlock (see recoverDatabaseKey() in
 * src/main/backup/startup.ts). The practice database isn't open yet, so only
 * the channels that hook handles answer. Owned by the backup domain, which
 * replaces this placeholder.
 */
import { KeyRound } from 'lucide-react'
import { EmptyState } from '../ui'

export function UnlockApp(): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <EmptyState icon={KeyRound} title="Unlock with the recovery sheet" body="Unlocking the practice database with its recovery sheet isn’t part of this build yet." />
    </div>
  )
}
