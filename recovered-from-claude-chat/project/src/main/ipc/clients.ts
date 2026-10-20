/**
 * clients.ts — clients, their services, partners and trustees, and assignment.
 * The rules (who may see and change what, money in pence, the audit trail) live
 * in ../records/clients.ts and ../records/assignment.ts.
 */
import { ipcMain } from 'electron'
import { getDb } from '../db/schema'
import type { AssignableUser, Client, ClientService, PartnershipMember, TrustMember } from '@shared/types'
import { assignableUsers, assignClients } from '../records/assignment'
import {
  createClient, deleteClient, deleteService, getClient, importClients, listClients, listMembers, listServices, saveMembers, updateClient, upsertService
} from '../records/clients'
import { actor, reply, result, rows } from './session'

export function registerClientHandlers(): void {

  // ─── Clients ─────────────────────────────────────────────────────────────────

  ipcMain.handle('clients:get-all', (): Client[] => rows('clients', [], () => listClients(getDb(), actor())))

  // By id or client code; staff only their own clients. Unanswerable requests are null.
  ipcMain.handle('clients:get', (_e, idOrRef: unknown): Client | null => {
    try {
      return getClient(getDb(), actor(), idOrRef)
    } catch {
      return null
    }
  })

  ipcMain.handle('clients:create', (_e, data: Partial<Client>) => reply('clients', () => createClient(getDb(), actor(), data)))

  ipcMain.handle('clients:update', (_e, id: number, data: Partial<Client>) =>
    reply('clients', () => {
      updateClient(getDb(), actor(), id, data)
      return {}
    })
  )

  ipcMain.handle('clients:delete', (_e, id: number) =>
    reply('clients', () => {
      deleteClient(getDb(), actor(), id)
      return {}
    })
  )

  ipcMain.handle('clients:import', (_e, data: Partial<Client>[]) => reply('clients', () => importClients(getDb(), actor(), data)))

  // ─── Assignment ──────────────────────────────────────────────────────────────

  ipcMain.handle('clients:assignable-users', (): AssignableUser[] => rows('clients', [], () => assignableUsers(getDb(), actor())))

  ipcMain.handle('clients:assign', (_e, input) => result('clients', () => assignClients(getDb(), actor(), input)))

  // ─── Services ────────────────────────────────────────────────────────────────

  ipcMain.handle('clients:get-services', (_e, clientRef: string): ClientService[] =>
    rows('clients', [], () => listServices(getDb(), actor(), clientRef)))

  ipcMain.handle('clients:upsert-service', (_e, data: Partial<ClientService>) => reply('clients', () => upsertService(getDb(), actor(), data)))

  ipcMain.handle('clients:delete-service', (_e, id: number) =>
    reply('clients', () => {
      deleteService(getDb(), actor(), id)
      return {}
    })
  )

  // ─── Partners and trustees ───────────────────────────────────────────────────

  ipcMain.handle('clients:get-partnership-members', (_e, clientRef: string): PartnershipMember[] =>
    rows('clients', [], () => listMembers(getDb(), actor(), 'partnership_members', clientRef) as PartnershipMember[]))

  ipcMain.handle('clients:save-partnership-members', (_e, clientRef: string, members: Partial<PartnershipMember>[]) =>
    reply('clients', () => saveMembers(getDb(), actor(), 'partnership_members', clientRef, members)))

  ipcMain.handle('clients:get-trust-members', (_e, clientRef: string): TrustMember[] =>
    rows('clients', [], () => listMembers(getDb(), actor(), 'trust_members', clientRef) as TrustMember[]))

  ipcMain.handle('clients:save-trust-members', (_e, clientRef: string, members: Partial<TrustMember>[]) =>
    reply('clients', () => saveMembers(getDb(), actor(), 'trust_members', clientRef, members)))
}
