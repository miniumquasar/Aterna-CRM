/**
 * Backups, restore and the database key’s recovery sheet.
 * Owned by the backup domain (docs/DOMAINS.md). Add channels here as
 * '<area>.<verb>' (camelCase), each with a flags entry in the table below.
 */
import type { ChannelTable } from '../ipc/spec'

export interface BackupContract {}

export const backupChannels = {} as const satisfies ChannelTable<BackupContract>
