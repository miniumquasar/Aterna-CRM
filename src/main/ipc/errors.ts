/**
 * The one error a handler throws for anything a person can fix. The registry
 * turns it into `{ ok: false, error: { code, message, field } }`; anything
 * else becomes 'internal', with the detail logged and never sent.
 *
 *   throw new UserFacingError('invalid', 'Enter a company number of 8 characters.', 'company_number')
 */
import type { ErrorCode } from '@shared/ipc/result'

export class UserFacingError extends Error {
  readonly code: ErrorCode
  readonly field?: string

  constructor(code: ErrorCode, message: string, field?: string) {
    super(message)
    this.name = 'UserFacingError'
    this.code = code
    if (field !== undefined) this.field = field
  }
}

export function isUserFacingError(err: unknown): err is UserFacingError {
  return err instanceof UserFacingError
}

export const invalid = (message: string, field?: string): UserFacingError => new UserFacingError('invalid', message, field)
export const notFound = (message: string): UserFacingError => new UserFacingError('not_found', message)
export const forbidden = (message: string): UserFacingError => new UserFacingError('forbidden', message)
export const conflict = (message: string, field?: string): UserFacingError => new UserFacingError('conflict', message, field)
