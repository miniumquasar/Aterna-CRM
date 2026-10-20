/**
 * Companies House CRM — Preload bridge (v5 stabilized)
 *
 * Every channel is typed via the shared `IElectronAPI` contract. If you add
 * an IPC call here without also adding it to IElectronAPI, tsc will fail at
 * the `satisfies IElectronAPI` check below — that's the intended firewall
 * against the type-drift that caused ~40 of the 50 v5 typecheck errors.
 */

import { contextBridge, ipcRenderer, webFrame } from 'electron'
import type {
  AmlRecord,
  AppDocument,
  AiMessage,
  AiSession,
  ApiSettings,
  BackupRecord,
  CHCompany,
  CHCompanyDetail,
  CHStreamEndpoint,
  CHStreamEvent,
  CHStreamStatus,
  Client,
  ClientAR,
  ClientRow,
  ClientService,
  ClientDetailHybrid,
  CommunicationLog,
  DashboardStats,
  DashboardMetrics,
  ARSummary,
  EmailTemplate,
  FirmData,
  HmrcSubmission,
  IElectronAPI,
  IpcResult,
  Interaction,
  OnboardingObservation,
  PartnershipMember,
  Payment,
  PaymentReceipt,
  Task,
  TimelineEvent,
  TrustMember,
  User,
  UserRole,
  WipItem
} from '@shared/types'

// ── Small helper: wraps a throwing main-process call into IpcResult<T>.
//
// Usage:  call('channel', arg)   →  { ok: true, data } | { ok: false, error }
//
// Prefer this over ad-hoc try/catch so every mutation has a consistent
// in-band error surface.
async function call<T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> {
  try {
    const data = (await ipcRenderer.invoke(channel, ...args)) as T
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: (err as Error).message || String(err) }
  }
}

// A thin wrapper for "read" channels that should bubble errors up instead of
// returning IpcResult<T>. These match the renderer pattern of let + try/catch
// at the callsite.
function read<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>
}

// ── Minimal electron-scoped surface for the renderer ─────────────────────────

const electronAPI = {
  platform: process.platform,
  versions: { ...process.versions },
  webFrame: {
    setZoomFactor: (factor: number): void => webFrame.setZoomFactor(factor)
  }
} as const

// ── The full API surface — satisfies IElectronAPI ──────────────────────────

const api: IElectronAPI = {
  // System ────────────────────────────────────────────────────────────────
  ping: () => read('system:ping'),
  getSystemStatus: () => read('system:status'),
  getAppVersion: () => read('system:get-app-version'),

  // Auth ──────────────────────────────────────────────────────────────────
  auth: {
    webauthnRegister: (username) => call('auth:webauthnRegister', username),
    webauthnLogin: (username) => call('auth:webauthnLogin', username),
    logout: () => call('auth:logout'),
    devGetFirstUser: () => read('dev:get-first-user')
  },

  // Users ─────────────────────────────────────────────────────────────────
  user: {
    getAll: () => read<User[]>('users:get-all'),
    generateInvite: (email, role) => call('users:generate-invite', email, role),
    updateRole: (userId, role, active) => call('users:update-role', userId, role, active),
    delete: (userId) => call('users:delete', userId)
  },

  // Clients — list + pagination ───────────────────────────────────────────
  listClients: async (params) => {
    try {
      const all = (await ipcRenderer.invoke('clients:get-all')) as Client[]
      const offset = params?.offset ?? 0
      const limit = params?.limit ?? 50
      const search = params?.search?.toLowerCase().trim() ?? ''
      const category = params?.category

      const filtered = all.filter((c) => {
        if (category && c.client_category !== category) return false
        if (!search) return true
        const hay = `${c.client_name} ${c.ref ?? ''} ${c.contact_name ?? ''}`.toLowerCase()
        return hay.includes(search)
      })

      const rows: ClientRow[] = filtered.slice(offset, offset + limit).map((c) => ({
        id: c.id,
        name: c.client_name,
        status: c.status ?? 'Active',
        risk_level: c.risk_rating ?? 'Low',
        last_sync_at: c.updated_at ? Math.floor(new Date(c.updated_at).getTime() / 1000) : 0
      }))

      return { ok: true, data: { rows, total: filtered.length, offset, limit } }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  },

  getClient: async (params) => {
    try {
      const ref =
        typeof params === 'string'
          ? params
          : typeof params === 'number'
            ? params
            : params.id ?? params.ref
      const data = (await ipcRenderer.invoke('clients:get', ref)) as Client | null
      if (!data) return { ok: true, data: null }
      const hybrid: ClientDetailHybrid = {
        ...data,
        name: data.client_name,
        risk_level: data.risk_rating ?? 'Low',
        last_sync_at: data.updated_at ? Math.floor(new Date(data.updated_at).getTime() / 1000) : 0
      }
      return { ok: true, data: hybrid }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  },

  // Clients — direct CRUD (mirror the legacy raw channels) ─────────────────
  getClients: () => read<Client[]>('clients:get-all'),
  createClient: (data) => call<{ id: number }>('clients:create', data),
  updateClient: (id, data) => call<null>('clients:update', id, data),
  deleteClient: (id) => call<null>('clients:delete', id),
  importClients: (data) => call<{ count: number }>('clients:import', data),

  // Client services / members ─────────────────────────────────────────────
  getClientServices: (clientRef) => read<ClientService[]>('client-services:get-all', clientRef),
  upsertClientService: (data) => call('client-services:upsert', data),
  deleteClientService: (id) => call('client-services:delete', id),
  getPartnershipMembers: (clientRef) => read<PartnershipMember[]>('partnership-members:get', clientRef),
  savePartnershipMembers: (clientRef, members) =>
    call('partnership-members:save', clientRef, members),
  getTrustMembers: (clientRef) => read<TrustMember[]>('trust-members:get', clientRef),
  saveTrustMembers: (clientRef, members) => call('trust-members:save', clientRef, members),

  // Companies House ───────────────────────────────────────────────────────
  searchCompanies: (query) => call<CHCompany[]>('ch:search', query),
  getCompanyProfile: (number) => call<CHCompanyDetail>('ch:get-profile', number),
  syncClientFromCH: (clientId, companyNumber) =>
    call('ch:sync-client', clientId, companyNumber),
  bgSyncClients: () => call<{ synced: number; total: number }>('ch:bg-sync-clients'),

  // Tasks ─────────────────────────────────────────────────────────────────
  getTasks: () => read<Task[]>('tasks:get-all'),
  createTask: (data) => call<{ id: number }>('tasks:create', data),
  updateTask: (id, data) => call('tasks:update', id, data),
  deleteTask: (id) => call('tasks:delete', id),

  // HMRC ──────────────────────────────────────────────────────────────────
  getHmrcSubmissions: (clientRef) => read<HmrcSubmission[]>('hmrc:list', clientRef),
  createHmrcSubmission: (data) => call<{ id: number }>('hmrc:create', data),
  updateHmrcSubmission: (id, data) => call('hmrc:update', id, data),
  deleteHmrcSubmission: (id) => call('hmrc:delete', id),

  // AML ───────────────────────────────────────────────────────────────────
  getAmlRecords: () => read<AmlRecord[]>('aml:get-all'),
  upsertAmlRecord: (data) => call('aml:upsert', data),

  // WIP ───────────────────────────────────────────────────────────────────
  getWipItems: (clientRef) => read<WipItem[]>('wip:list', clientRef),
  createWipItem: (data) => call<{ id: number }>('wip:create', data),
  updateWipItem: (id, data) => call('wip:update', id, data),
  deleteWipItem: (id) => call('wip:delete', id),

  // Interactions ──────────────────────────────────────────────────────────
  getInteractions: (clientRef) => read<Interaction[]>('interactions:list', clientRef),
  createInteraction: (data) => call<{ id: number }>('interactions:create', data),
  deleteInteraction: (id) => call('interactions:delete', id),

  // Payments + AR ─────────────────────────────────────────────────────────
  getPayments: (params) => read<Payment[]>('payments:list', params),
  createPayment: (data) => call<{ id: number }>('payments:create', data),
  updatePayment: (id, data) => call('payments:update', id, data),
  deletePayment: (id) => call('payments:delete', id),
  getClientAR: (clientRef) => read<ClientAR>('ar:get-client', clientRef),
  getAllClientAR: () => read<ClientAR[]>('ar:get-all-clients'),
  getARSummary: () => read<ARSummary>('ar:get-summary'),
  getPaymentReceipts: (clientRef) => read<PaymentReceipt[]>('ar:get-receipts', clientRef),
  addPaymentReceipt: (data) => call<{ id: number }>('ar:add-receipt', data),
  deletePaymentReceipt: (id) => call('ar:delete-receipt', id),

  // Dashboard ─────────────────────────────────────────────────────────────
  getDashboardStats: () => read<DashboardStats>('dashboard:stats'),
  getMetrics: async () => {
    try {
      const stats = (await ipcRenderer.invoke('dashboard:stats')) as DashboardStats
      const data: DashboardMetrics = {
        totalClients: stats?.totalClients ?? 0,
        activeClients: stats?.activeClients ?? 0,
        atRisk: stats?.overdueCount ?? 0,
        integrityPct: 100
      }
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  },

  // Settings & firm ───────────────────────────────────────────────────────
  getApiSettings: () => read<ApiSettings>('settings:get'),
  saveApiSettings: (data) => call('settings:save', data),
  getFirmData: () => read<FirmData | null>('settings:get-firm-data'),
  saveFirmData: (data) => call('settings:save-firm-data', data),
  testApiConnection: () => call<{ message: string }>('settings:test-connection'),
  testHmrcConnection: () => call<{ message: string }>('settings:test-hmrc'),
  testResendConnection: () => call<{ message: string }>('settings:test-resend'),
  testTwilioConnection: () => call<{ message: string }>('settings:test-twilio'),
  seedSampleData: () => call<{ count: number }>('settings:seed-data'),

  // Documents ─────────────────────────────────────────────────────────────
  getDocuments: (clientRef) => read<AppDocument[]>('documents:list', clientRef),
  uploadDocument: (clientRef, filePath, filename, category) =>
    call<{ doc: AppDocument }>('documents:upload', clientRef, filePath, filename, category),
  deleteDocument: (id) => call('documents:delete', id),
  openDocument: (filePath) => call('documents:open', filePath),

  // Activity timeline ─────────────────────────────────────────────────────
  getActivityTimeline: (clientRef) => read<TimelineEvent[]>('activity:get-timeline', clientRef),

  // Email templates ───────────────────────────────────────────────────────
  listEmailTemplates: (clientRef) => read<EmailTemplate[]>('email-templates:list', clientRef),
  getEmailTemplate: (templateKey, clientRef) =>
    read<EmailTemplate | null>('email-templates:get', templateKey, clientRef),
  upsertEmailTemplate: (data) => call<{ id: number }>('email-templates:upsert', data),
  deleteEmailTemplate: (id) => call('email-templates:delete', id),
  resetEmailTemplateDefault: (templateKey) =>
    call('email-templates:reset-default', templateKey),
  aiGenerateEmail: (params) =>
    call<{ subject: string; body: string }>('email-templates:ai-generate', params),

  // AI chat ───────────────────────────────────────────────────────────────
  aiChat: (params) => call('ai:chat', params),
  aiGetHistory: (sessionId) => read<AiMessage[]>('ai:get-history', sessionId),
  aiListSessions: () => read<AiSession[]>('ai:list-sessions'),
  aiDeleteSession: (sessionId) => call('ai:delete-session', sessionId),
  getOllamaModels: () => call<{ models: string[] }>('ai:list-models'),

  // Comms Hub ─────────────────────────────────────────────────────────────
  logCommunication: (data) => call<{ id: number }>('comms:log-send', data),
  getCommunicationLog: (clientRef) => read<CommunicationLog[]>('comms:get-log', clientRef),
  deleteCommunicationLog: (id) => call('comms:delete-log', id),
  suggestTemplate: (clientRef) =>
    call<{ templateKey: string; reason: string }>('comms:suggest-template', clientRef),

  // Onboarding observations ───────────────────────────────────────────────
  getOnboardingObservations: (clientRef) =>
    read<OnboardingObservation[]>('onboarding:get-observations', clientRef),
  scanOnboardingGaps: (clientRef) =>
    call<{ created: number }>('onboarding:scan', clientRef),
  updateObservation: (id, status, notes) =>
    call('onboarding:update-observation', id, status, notes),

  // Backups ───────────────────────────────────────────────────────────────
  listBackups: () => read<BackupRecord[]>('backup:list'),
  createBackup: (createdBy, notes) =>
    call<{ id: number; filename: string; file_size: number }>(
      'backup:create',
      createdBy,
      notes
    ),
  restoreBackup: (backupId) => call('backup:restore', backupId),
  deleteBackup: (backupId) => call('backup:delete', backupId),
  getBackupStats: () => call<{ count: number; total_size: number }>('backup:stats'),

  // Crash reporting ───────────────────────────────────────────────────────
  sendCrashReport: (report) => read<void>('crash:send', report),

  // Companies House streaming ─────────────────────────────────────────────
  getStreamStatus: () => read<CHStreamStatus[]>('stream:get-status'),
  setStreamEndpoints: (endpoints) => call('stream:set-endpoints', endpoints),
  onCHStreamStatus: (callback: (status: CHStreamStatus[]) => void) => {
    const channel = 'stream:status-update'
    const listener = (_e: Electron.IpcRendererEvent, data: CHStreamStatus[]): void => callback(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.off(channel, listener)
  },
  onCHStreamEvent: (callback: (event: CHStreamEvent) => void) => {
    const channel = 'stream:event'
    const listener = (_e: Electron.IpcRendererEvent, data: CHStreamEvent): void => callback(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.off(channel, listener)
  },

  // Deadline alerts ───────────────────────────────────────────────────────
  onDeadlineAlert: (callback: (data: { client_name: string; type: string; days: number }) => void) => {
    const channel = 'deadline:alert'
    const listener = (
      _e: Electron.IpcRendererEvent,
      data: { client_name: string; type: string; days: number }
    ): void => callback(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.off(channel, listener)
  }
}

// Sanity: the `satisfies` enforces the shape at compile time. If a field is
// added to IElectronAPI and the preload hasn't caught up, tsc fails here.
const apiContract = api satisfies IElectronAPI

// ── Expose ──────────────────────────────────────────────────────────────────

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', apiContract)
  } catch (err) {
    // Surface to the main-process log so a broken bridge is visible.
    console.error('[Preload] contextBridge failure:', err)
  }
} else {
  // Dev-only path (context isolation OFF). Never happens in production.
  ;(globalThis as unknown as { electron: typeof electronAPI; api: IElectronAPI }).electron = electronAPI
  ;(globalThis as unknown as { electron: typeof electronAPI; api: IElectronAPI }).api = apiContract
}

export type { IElectronAPI }
