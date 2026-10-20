/**
 * An error whose message is already a plain sentence a person can act on, so
 * start-up can show it as it stands (a database that won't open, a missing
 * key file, a database from a newer version). Anything else is shown as a
 * general failure, with its detail kept in the log.
 */
export class PlainError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'PlainError'
  }
}

export function isPlainError(err: unknown): err is PlainError {
  return err instanceof PlainError
}
