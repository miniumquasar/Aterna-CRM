/**
 * The client file's tabs, in order. Every tab is pre-wired here; each
 * domain fills in its own tab's component, which gets the client's id.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { CalendarClock, FileText, FolderKanban, IdCard, LayoutDashboard, ListTree, MessagesSquare, ShieldCheck, TriangleAlert, Users, type LucideIcon } from 'lucide-react'
import type { Role } from '@shared/domain/roles'

export interface ClientFileTabProps {
  clientId: number
}

export type ClientFileTabId = 'overview' | 'contacts' | 'registers' | 'deadlines' | 'work' | 'aml' | 'communications' | 'documents' | 'references' | 'issues'

export interface ClientFileTab {
  id: ClientFileTabId
  title: string
  icon: LucideIcon
  minRole: Role
  component: LazyExoticComponent<ComponentType<ClientFileTabProps>>
}

type TabModule = { default: ComponentType<ClientFileTabProps> }
const tab = (load: () => Promise<TabModule>): LazyExoticComponent<ComponentType<ClientFileTabProps>> => lazy(load)

export const CLIENT_FILE_TABS: readonly ClientFileTab[] = [
  { id: 'overview', title: 'Overview', icon: LayoutDashboard, minRole: 'staff', component: tab(() => import('./tabs/OverviewTab')) },
  { id: 'contacts', title: 'Contacts', icon: Users, minRole: 'staff', component: tab(() => import('./tabs/ContactsTab')) },
  { id: 'registers', title: 'Registers', icon: ListTree, minRole: 'staff', component: tab(() => import('./tabs/RegistersTab')) },
  { id: 'deadlines', title: 'Deadlines', icon: CalendarClock, minRole: 'staff', component: tab(() => import('../compliance/ClientDeadlinesTab')) },
  { id: 'work', title: 'Work', icon: FolderKanban, minRole: 'staff', component: tab(() => import('../work/ClientWorkTab')) },
  { id: 'aml', title: 'AML', icon: ShieldCheck, minRole: 'staff', component: tab(() => import('../compliance/ClientAmlTab')) },
  { id: 'communications', title: 'Communications', icon: MessagesSquare, minRole: 'staff', component: tab(() => import('../comms/ClientCommsTab')) },
  { id: 'documents', title: 'Documents', icon: FileText, minRole: 'staff', component: tab(() => import('../comms/ClientDocumentsTab')) },
  { id: 'references', title: 'References', icon: IdCard, minRole: 'staff', component: tab(() => import('../practice/ClientReferencesTab')) },
  { id: 'issues', title: 'Issues', icon: TriangleAlert, minRole: 'staff', component: tab(() => import('../data/ClientIssuesTab')) }
]
