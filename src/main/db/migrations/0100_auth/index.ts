/**
 * Migrations for the auth domain: ids 0100 to 0199 ('0100_name'), oldest first.
 * Add each migration as its own file in this folder and list it here.
 * Tables may reference core tables and lower-numbered domains only.
 */
import type { Migration } from '../../migrate'
import { migration0101People } from './0101_people'

export const authMigrations: readonly Migration[] = [migration0101People]
