/**
 * Runs start-up's numbered steps, logging each to logs/startup.log: when it
 * began, how long it took, or why it failed. Lines from before the data
 * folder exists (step 1) are kept and written once the log can be opened.
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export class StartupFailure extends Error {
  readonly step: number
  readonly stepName: string

  constructor(step: number, stepName: string, cause: unknown) {
    super(`Start-up step ${step} (${stepName}) failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
    this.name = 'StartupFailure'
    this.step = step
    this.stepName = stepName
  }
}

export class StartupRunner {
  private readonly pending: string[] = []
  private file: string | null = null

  constructor(
    readonly total: number,
    private readonly echo: (line: string) => void = (line) => console.log(line)
  ) {}

  /** Where the log goes from now on; lines written so far are added first. */
  attachLog(file: string): void {
    mkdirSync(dirname(file), { recursive: true })
    this.file = file
    this.write(`── start ${new Date().toISOString()} ──`)
    for (const line of this.pending.splice(0)) this.write(line)
  }

  get logFile(): string | null {
    return this.file
  }

  line(message: string): void {
    this.write(`${new Date().toISOString()} ${message}`)
  }

  private write(line: string): void {
    this.echo(line)
    if (!this.file) {
      this.pending.push(line)
      return
    }
    try {
      appendFileSync(this.file, `${line}\n`)
    } catch {
      // The log is a record, never a reason to stop.
    }
  }

  async run<T>(step: number, name: string, fn: () => T | Promise<T>): Promise<T> {
    const started = Date.now()
    this.line(`step ${step}/${this.total} ${name}: started`)
    try {
      const result = await fn()
      this.line(`step ${step}/${this.total} ${name}: done in ${Date.now() - started} ms`)
      return result
    } catch (err) {
      const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
      this.line(`step ${step}/${this.total} ${name}: FAILED after ${Date.now() - started} ms\n${detail}`)
      throw new StartupFailure(step, name, err)
    }
  }
}
