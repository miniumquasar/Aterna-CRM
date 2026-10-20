/**
 * Settings sections, in order. Every section is pre-wired here; a domain
 * fills in its own section's component:
 *
 *   appearance                design       AppearanceSection.tsx
 *   account, firm, people     auth         AccountSection.tsx, FirmSection.tsx, PeopleSection.tsx
 *   email                     comms        EmailSection.tsx
 *   backups                   backup       BackupsSection.tsx
 *   licence                   licence      LicenceSection.tsx
 *   notifications             insights     NotificationsSection.tsx
 *   vault                     references   VaultSection.tsx
 *   companiesHouse, assistant integrations CompaniesHouseSection.tsx, AssistantSection.tsx
 *   import                    import       ImportSection.tsx
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { Bell, Building, DatabaseBackup, FileSpreadsheet, KeyRound, Landmark, LockKeyhole, Mail, Palette, Sparkles, UserRound, Users, type LucideIcon } from 'lucide-react'
import type { Role } from '@shared/domain/roles'

export type SettingsSectionId =
  | 'appearance'
  | 'account'
  | 'firm'
  | 'people'
  | 'email'
  | 'backups'
  | 'licence'
  | 'notifications'
  | 'vault'
  | 'companiesHouse'
  | 'assistant'
  | 'import'

export interface SettingsSection {
  id: SettingsSectionId
  title: string
  description: string
  icon: LucideIcon
  minRole: Role
  component: LazyExoticComponent<ComponentType>
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: 'appearance', title: 'Appearance', description: 'Day, Night or Auto, colour theme and effects', icon: Palette, minRole: 'staff', component: lazy(() => import('./AppearanceSection')) },
  { id: 'account', title: 'Your sign-in', description: 'Your password and when you are signed out', icon: UserRound, minRole: 'staff', component: lazy(() => import('./AccountSection')) },
  { id: 'firm', title: 'Firm details', description: 'The practice’s name, address and references', icon: Building, minRole: 'staff', component: lazy(() => import('./FirmSection')) },
  { id: 'people', title: 'People', description: 'Who can sign in, invitations and sign-out time', icon: Users, minRole: 'partner', component: lazy(() => import('./PeopleSection')) },
  { id: 'email', title: 'Email', description: 'How email to clients is sent', icon: Mail, minRole: 'manager', component: lazy(() => import('./EmailSection')) },
  { id: 'backups', title: 'Backups', description: 'Automatic backups, restore and the recovery sheet', icon: DatabaseBackup, minRole: 'manager', component: lazy(() => import('./BackupsSection')) },
  { id: 'licence', title: 'Licence', description: 'The licence and its key', icon: KeyRound, minRole: 'staff', component: lazy(() => import('./LicenceSection')) },
  { id: 'notifications', title: 'Notifications', description: 'What you are told about, and how', icon: Bell, minRole: 'staff', component: lazy(() => import('./NotificationsSection')) },
  { id: 'vault', title: 'Vault', description: 'Government sign-ins, the passphrase and its sheet', icon: LockKeyhole, minRole: 'partner', component: lazy(() => import('./VaultSection')) },
  { id: 'companiesHouse', title: 'Companies House', description: 'The API key and the daily check', icon: Landmark, minRole: 'manager', component: lazy(() => import('./CompaniesHouseSection')) },
  { id: 'assistant', title: 'Assistant', description: 'The local assistant on this PC', icon: Sparkles, minRole: 'manager', component: lazy(() => import('./AssistantSection')) },
  { id: 'import', title: 'Import', description: 'The master workbook', icon: FileSpreadsheet, minRole: 'partner', component: lazy(() => import('./ImportSection')) }
]
