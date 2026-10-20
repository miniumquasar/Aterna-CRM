/**
 * The first-run wizard's steps, in order. Each is a slot its domain fills;
 * the wizard (SetupWizard.tsx) shows them one at a time and resumes where
 * it stopped.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { AuthStatus } from '@shared/contracts/auth'

export type SetupStepId = 'firm' | 'partner' | 'recovery' | 'vault' | 'licence' | 'import' | 'done'

/** What the steps before the first partner collect, kept until the partner is created. */
export interface SetupDraft {
  firmName: string
}

export interface SetupStepProps {
  status: AuthStatus
  draft: SetupDraft
  updateDraft: (patch: Partial<SetupDraft>) => void
  next: () => void
  back: () => void
  /** True for the first step that can be shown now (Back is then disabled). */
  isFirst: boolean
}

export interface SetupStep {
  id: SetupStepId
  title: string
  description: string
  /** Shown before anyone can sign in; once the first partner exists these steps are done. */
  beforePartner: boolean
  component: LazyExoticComponent<ComponentType<SetupStepProps>>
}

type StepModule = { default: ComponentType<SetupStepProps> }
const step = (load: () => Promise<StepModule>): LazyExoticComponent<ComponentType<SetupStepProps>> => lazy(load)

export const SETUP_STEPS: readonly SetupStep[] = [
  { id: 'firm', title: 'Firm details', description: 'The practice’s name', beforePartner: true, component: step(() => import('./FirmStep')) },
  { id: 'partner', title: 'First partner', description: 'Your own account', beforePartner: true, component: step(() => import('./PartnerStep')) },
  { id: 'recovery', title: 'Recovery sheet', description: 'Keep the database key safe', beforePartner: false, component: step(() => import('./RecoveryStep')) },
  { id: 'vault', title: 'Vault passphrase', description: 'For government sign-ins', beforePartner: false, component: step(() => import('./VaultStep')) },
  { id: 'licence', title: 'Trial or licence', description: 'Start the trial or enter a key', beforePartner: false, component: step(() => import('./LicenceStep')) },
  { id: 'import', title: 'Import', description: 'Bring in the master workbook', beforePartner: false, component: step(() => import('./ImportStep')) },
  { id: 'done', title: 'Ready', description: 'Open AETERNA CRM', beforePartner: false, component: step(() => import('./DoneStep')) }
]
