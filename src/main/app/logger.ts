/**
 * Plain-text logs in the data folder's logs/ folder: one line per entry, UTC
 * time first. Never log a key, a password, a token or a client's secrets.
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

export type LogLevel = 'info' | 'warn' | 'error'

export interface Logger {
  info(message: string, detail?: unknown): void
  warn(message: string, detail?: unknown): void
  error(message: string, detail?: unknown): void
  /** The same log, with every line tagged `[scope]`. */
  child(scope: string): Logger
}

type Sink = (line: string, level: LogLevel) => void

/** Logs bigger than this are moved to `<name>.1` when opened, so a log never grows without end. */
const ROTATE_AT_BYTES = 5 * 1024 * 1024

function describe(detail: unknown): string {
  if (detail === undefined) return ''
  if (detail instanceof Error) {
    return ` ${detail.stack ?? `${detail.name}: ${detail.message}`}${detail.cause ? `\n  caused by: ${describe(detail.cause).trim()}` : ''}`
  }
  if (typeof detail === 'string') return ` ${detail}`
  try {
    return ` ${JSON.stringify(detail)}`
  } catch {
    return ` ${String(detail)}`
  }
}

function makeLogger(sink: Sink, scope?: string): Logger {
  const write = (level: LogLevel, message: string, detail?: unknown): void => {
    const tag = scope ? ` [${scope}]` : ''
    sink(`${new Date().toISOString()} ${level.toUpperCase()}${tag} ${message}${describe(detail)}`, level)
  }
  return {
    info: (m, d) => write('info', m, d),
    warn: (m, d) => write('warn', m, d),
    error: (m, d) => write('error', m, d),
    child: (s) => makeLogger(sink, scope ? `${scope}:${s}` : s)
  }
}

function prepare(file: string): void {
  mkdirSync(dirname(file), { recursive: true })
  if (existsSync(file) && statSync(file).size > ROTATE_AT_BYTES) renameSync(file, `${file}.1`)
}

/** A logger appending to `file`, also echoing to the console unless `echo` is false. */
export function createFileLogger(file: string, options: { echo?: boolean } = {}): Logger {
  prepare(file)
  const echo = options.echo ?? true
  return makeLogger((line, level) => {
    try {
      appendFileSync(file, `${line}\n`)
    } catch {
      // A log that can't be written must never stop the app.
    }
    if (echo) (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line)
  })
}

/** A logger for the console only (before the data folder exists, and in tests). */
export function createConsoleLogger(): Logger {
  return makeLogger((line, level) => (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line))
}

/** A logger that keeps lines in memory, for tests and for start-up before the log file can be opened. */
export function createMemoryLogger(): Logger & { lines: string[] } {
  const lines: string[] = []
  return Object.assign(makeLogger((line) => lines.push(line)), { lines })
}

export const nullLogger: Logger = makeLogger(() => undefined)

let appLog: Logger = createConsoleLogger()

/** The app's main log (logs/app.log once start-up has opened it). */
export function log(): Logger {
  return appLog
}

export function setAppLogger(logger: Logger): void {
  appLog = logger
}
