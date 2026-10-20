/**
 * What every IPC call returns: the data, or an error a person can act on.
 * `message` is a plain sentence ("A client with this company number already
 * exists: Alder Ltd (CL0042)."), never a stack trace and never SQL.
 */
export type ErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'read_only'
  | 'not_found'
  | 'invalid'
  | 'conflict'
  | 'locked'
  | 'unavailable'
  | 'internal'

export const ERROR_CODES: readonly ErrorCode[] = [
  'unauthenticated',
  'forbidden',
  'read_only',
  'not_found',
  'invalid',
  'conflict',
  'locked',
  'unavailable',
  'internal'
]

export interface ApiError {
  code: ErrorCode
  message: string
  /** The form field the problem is about, when there is one (`company_number`). */
  field?: string
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError }

export function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

export function fail(code: ErrorCode, message: string, field?: string): Result<never> {
  return { ok: false, error: field === undefined ? { code, message } : { code, message, field } }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value)
}
