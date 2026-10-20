/**
 * Background jobs: deadline and notification checks, Companies House checks,
 * scheduled backups, licence reminders. A domain registers its jobs from its
 * own registerXxxHandlers() function:
 *
 *   registerJob(intervalJob('backup.daily', { firstRunAfterMs: 60_000, everyMs: 3_600_000 }, (ctx) => …))
 *
 * Start-up step 9 starts them all, after the window exists. They never run in
 * tests unless a test starts them. A failing run is logged and the job
 * carries on.
 */
import type { Db } from './db/connection'
import type { Logger } from './app/logger'
import type { Emit } from './events'

export interface JobContext {
  db: Db
  log: Logger
  now(): Date
  emit: Emit
}

export interface Job {
  /** Unique: '<domain>.<what>'. */
  name: string
  /** Starts the job; returns a function that stops it. */
  start(ctx: JobContext): (() => void) | void
}

const jobs = new Map<string, Job>()
const running = new Map<string, () => void>()

export function registerJob(job: Job): void {
  if (jobs.has(job.name)) throw new Error(`A background job called ${job.name} is already registered.`)
  jobs.set(job.name, job)
}

export function registeredJobs(): string[] {
  return [...jobs.keys()]
}

/** A job that runs `run` after `firstRunAfterMs`, then every `everyMs`. Runs never overlap. */
export function intervalJob(
  name: string,
  timing: { firstRunAfterMs: number; everyMs: number },
  run: (ctx: JobContext) => void | Promise<void>
): Job {
  return {
    name,
    start(ctx) {
      let busy = false
      let interval: ReturnType<typeof setInterval> | null = null
      const tick = async (): Promise<void> => {
        if (busy) return
        busy = true
        try {
          await run(ctx)
        } catch (err) {
          ctx.log.error(`Background job ${name} failed; it will run again at its next time.`, err)
        } finally {
          busy = false
        }
      }
      const first = setTimeout(() => {
        void tick()
        interval = setInterval(() => void tick(), timing.everyMs)
        interval.unref?.()
      }, timing.firstRunAfterMs)
      first.unref?.()
      return () => {
        clearTimeout(first)
        if (interval) clearInterval(interval)
      }
    }
  }
}

export function startJobs(ctx: JobContext): string[] {
  const started: string[] = []
  for (const job of jobs.values()) {
    if (running.has(job.name)) continue
    try {
      const stop = job.start({ ...ctx, log: ctx.log.child(job.name) })
      running.set(job.name, stop ?? (() => undefined))
      started.push(job.name)
    } catch (err) {
      ctx.log.error(`Background job ${job.name} couldn’t start.`, err)
    }
  }
  return started
}

export function stopJobs(): void {
  for (const stop of running.values()) {
    try {
      stop()
    } catch {
      // Stopping is best effort at quit.
    }
  }
  running.clear()
}

/** Forgets every registered job (tests). */
export function clearJobs(): void {
  stopJobs()
  jobs.clear()
}
