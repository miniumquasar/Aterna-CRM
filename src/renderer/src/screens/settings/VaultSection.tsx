/**
 * Settings → Vault. Owned by the references domain (docs/DOMAINS.md), which replaces this placeholder.
 */
import { Construction } from 'lucide-react'
import { EmptyState } from '@renderer/components/ui'

export default function VaultSection(): JSX.Element {
  return <EmptyState size="sm" icon={Construction} title="This section is being built" body="Turn the vault for government sign-ins on or off for the practice, change its passphrase and print the passphrase sheet." />
}
