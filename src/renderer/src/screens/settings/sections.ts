/**
 * Settings sections, in order. Every section is pre-wired here; a domain
 * fills in its own section's component.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { Bell, Building, DatabaseBackup, FileSpreadsheet, KeyRound, Landmark, Mail, Palette, Sparkles, Users, type LucideIcon } from 'lucide-react'
import type { Role } from '@shared/domain/roles'

export type SettingsSectionId =
  | 'appearance'
  | 'firm'
  | 'people'
  | 'email'
  | 'backups'
  | 'licence'
  | 'notifications'
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
  { id: 'firm', title: 'Firm details', description: 'The practice’s name, address and references', icon: Building, minRole: 'staff', component: lazy(() => import('./FirmSection')) },
  { id: 'people', title: 'People', description: 'Who can sign in, and their roles', icon: Users, minRole: 'partner', component: lazy(() => import('./PeopleSection')) },
  { id: 'email', title: 'Email', description: 'How email to clients is sent', icon: Mail, minRole: 'manager', component: lazy(() => import('./EmailSection')) },
  { id: 'backups', title: 'Backups', description: 'Automatic backups, restore and the recovery sheet', icon: DatabaseBackup, minRole: 'manager', component: lazy(() => import('./BackupsSection')) },
  { id: 'licence', title: 'Licence', description: 'The licence and its key', icon: KeyRound, minRole: 'staff', component: lazy(() => import('./LicenceSection')) },
  { id: 'notifications', title: 'Notifications', description: 'What you are told about, and how', icon: Bell, minRole: 'staff', component: lazy(() => import('./NotificationsSection')) },
  { id: 'companiesHouse', title: 'Companies House', description: 'The API key and the daily check', icon: Landmark, minRole: 'manager', component: lazy(() => import('./CompaniesHouseSection')) },
  { id: 'assistant', title: 'Assistant', description: 'The local assistant on this PC', icon: Sparkles, minRole: 'manager', component: lazy(() => import('./AssistantSection')) },
  { id: 'import', title: 'Import', description: 'The master workbook', icon: FileSpreadsheet, minRole: 'partner', component: lazy(() => import('./ImportSection')) }
]
