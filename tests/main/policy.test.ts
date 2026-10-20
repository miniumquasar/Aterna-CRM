import { describe, expect, it } from 'vitest'
import { assertClientAccess, clientScopeSql, requirePartnerToDelete, requireRole } from '@main/access/policy'
import { UserFacingError } from '@main/ipc/errors'
import { actorFor, addClient, createTestDb } from '../helpers/db'

function code(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (err) {
    return err instanceof UserFacingError ? err.code : 'not a UserFacingError'
  }
}

describe('access policy', () => {
  it('ranks partner ≥ manager ≥ staff', () => {
    expect(code(() => requireRole(actorFor('partner'), 'manager'))).toBeNull()
    expect(code(() => requireRole(actorFor('manager'), 'manager'))).toBeNull()
    expect(code(() => requireRole(actorFor('staff'), 'manager'))).toBe('forbidden')
    expect(code(() => requireRole(actorFor('manager'), 'partner'))).toBe('forbidden')
    expect(code(() => requireRole(null, 'staff'))).toBe('unauthenticated')
    expect(() => requireRole(actorFor('staff'), 'manager', 'assign clients')).toThrow('Only a manager or a partner can assign clients.')
    expect(() => requirePartnerToDelete(actorFor('manager'), 'an invoice')).toThrow('Only a partner can delete an invoice.')
  })

  it('lets staff reach only the clients assigned to them', () => {
    const { db, users } = createTestDb()
    const mine = addClient(db, { assignedTo: users.staff.id })
    const theirs = addClient(db, { assignedTo: users.manager.id })
    const nobodys = addClient(db)
    expect(code(() => assertClientAccess(db, actorFor('staff'), mine))).toBeNull()
    expect(code(() => assertClientAccess(db, actorFor('staff'), theirs))).toBe('forbidden')
    expect(code(() => assertClientAccess(db, actorFor('staff'), nobodys))).toBe('forbidden')
    expect(code(() => assertClientAccess(db, actorFor('manager'), theirs))).toBeNull()
    expect(code(() => assertClientAccess(db, actorFor('partner'), nobodys))).toBeNull()
    expect(code(() => assertClientAccess(db, actorFor('partner'), 99999))).toBe('not_found')
  })

  it('scopes list queries the same way', () => {
    const { db, users } = createTestDb()
    addClient(db, { assignedTo: users.staff.id, name: 'Mine' })
    addClient(db, { assignedTo: users.manager.id, name: 'Theirs' })
    addClient(db, { name: 'Nobody’s' })
    const names = (role: 'partner' | 'manager' | 'staff'): string[] => {
      const scope = clientScopeSql(actorFor(role), 'c')
      return (db.prepare(`SELECT name FROM clients c WHERE ${scope.sql} ORDER BY name`).all(...scope.params) as Array<{ name: string }>).map((r) => r.name)
    }
    expect(names('staff')).toEqual(['Mine'])
    expect(names('manager')).toHaveLength(3)
    expect(names('partner')).toHaveLength(3)
    expect(() => clientScopeSql(actorFor('staff'), 'c; DROP TABLE clients')).toThrow()
  })
})
