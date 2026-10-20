/**
 * Keeping up with Companies House for the practice's clients. Two ways, both
 * recorded the same way (../records/ch-watch.ts):
 *
 *   The daily check   needs the practice's Companies House API key. Each live
 *                     client company's profile is read about once a second —
 *                     well inside Companies House's limit of 600 requests in 5
 *                     minutes, so searches still work meanwhile. The first run
 *                     starts two minutes after the app opens; then each company
 *                     is looked at again once its last check is 20 hours old.
 *                     A run interrupted by closing the app carries on next time.
 *                     The client's accounts and confirmation statement due
 *                     dates, and its company status, are kept up to date
 *                     (recorded in the audit log, by the app).
 *   The stream        needs a separate streaming key from Companies House.
 *                     Every event on the register arrives; only those about
 *                     the practice's clients are kept. Where it got to is saved,
 *                     so events published while the app was closed come in when
 *                     it reopens, as far back as Companies House keeps.
 *
 * Nothing is written while the app is read-only (licence) or not saving. The
 * stream's saved place then stays put, so what was published meanwhile comes in
 * once the app can save again (as far back as Companies House keeps); the daily
 * check catches up on each company's status and overdue filings regardless.
 */
import type { ChChange, CHStreamEvent, CompaniesHouseWatchStatus, CHStreamEndpoint } from '../../shared/types'
import { getDb } from '../db/schema'
import { writeRefusal } from '../licence'
import {
  changesFromEvent, companiesDue, eventCompany, listChanges, recordChanges, recordProblem, recordProfile, watchedCompanies, type ChProfile, type WatchedCompany
} from '../records/ch-watch'
import type { Actor } from '../access/policy'
import { sendToRenderer } from '../window-events'
import { CompaniesHouseError, getCompanyProfileOnly, hasCHClient, initCHClient } from './companies-house'
import { startStreaming, stopStreaming, streamEmitter, streamStatusList } from './ch-streaming'
import { checkNotificationsSoon } from './notifier'

export interface WatchDeps {
  apiKey: () => string | null
  streamKey: () => string | null
  endpoints: () => CHStreamEndpoint[]
  setting: (key: string) => string | null
  saveSetting: (key: string, value: string) => void
  whoIsSignedIn: () => Actor | null
}

interface LastRun {
  finishedAt: string
  checked: number
  changes: number
  problems: number
  stoppedBecause: string | null
}

/** Where each stream had got to: saved, and resumed from when the app reopens. */
type Timepoints = Partial<Record<CHStreamEndpoint, number>>

/** About one request a second. */
const PACE_MS = 1100
const FIRST_RUN_MS = 2 * 60_000
const LOOK_EVERY_MS = 60 * 60_000
/** Stop a run after this many failures in a row when Companies House can't be reached. */
const GIVE_UP_AFTER = 5

let deps: WatchDeps | null = null
let firstTimer: ReturnType<typeof setTimeout> | null = null
let everyTimer: ReturnType<typeof setInterval> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let running: { done: number; total: number } | null = null
let stopping = false
let watched: { at: number; map: Map<string, WatchedCompany> } | null = null
/** The last event dealt with on each stream since the place was last saved. */
let handled: Timepoints = {}
/** Events are arriving while nothing can be saved (read-only, or the database not saving). */
let refusing = false

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function startCompaniesHouseWatch(d: WatchDeps): void {
  stopCompaniesHouseWatch()
  deps = d
  stopping = false
  handled = {}
  refusing = false
  watched = null
  const key = d.apiKey()
  if (key) initCHClient(key)
  streamEmitter.on('event', onEvent)
  streamEmitter.on('status', pushStreamStatus)
  streamEmitter.on('error', pushStreamStatus)
  restartStream()
  firstTimer = setTimeout(() => void runCheck(false), FIRST_RUN_MS)
  everyTimer = setInterval(() => void runCheck(false), LOOK_EVERY_MS)
}

export function stopCompaniesHouseWatch(): void {
  stopping = true
  if (firstTimer) clearTimeout(firstTimer)
  if (everyTimer) clearInterval(everyTimer)
  firstTimer = null
  everyTimer = null
  saveTimepoints()
  stopStreaming()
  streamEmitter.off('event', onEvent)
  streamEmitter.off('status', pushStreamStatus)
  streamEmitter.off('error', pushStreamStatus)
}

/** The API key was saved or changed: use it from now on. */
export function apiKeyChanged(): void {
  const key = deps?.apiKey()
  if (key) initCHClient(key)
}

/** The client list changed (an import, a company number edited): look again at which companies to watch. */
export function companiesChanged(): void {
  watched = null
}

const dailyCheckOn = (): boolean => deps?.setting('ch_daily_check') !== 'false'

function lastRun(): LastRun | null {
  try {
    return (JSON.parse(deps?.setting('ch_check_last_run') ?? 'null') as LastRun | null) ?? null
  } catch {
    return null
  }
}

/** Starts a check now (partners and managers, from Activity); the companies it will look at. */
export function checkCompaniesHouseNow(): { started: boolean; total: number; reason: string | null } {
  if (!deps?.apiKey()) return { started: false, total: 0, reason: 'Add the practice’s Companies House API key in Settings first.' }
  if (running) return { started: false, total: running.total, reason: 'A check is already running.' }
  const total = companiesDue(getDb(), new Date(), 0).length
  if (!total) return { started: false, total: 0, reason: 'No client has a company number to check.' }
  void runCheck(true)
  return { started: true, total, reason: null }
}

async function runCheck(asked: boolean): Promise<void> {
  if (!deps || running || stopping) return
  const key = deps.apiKey()
  if (!key || (!asked && !dailyCheckOn())) return
  if (!hasCHClient()) initCHClient(key)
  // Asked for: every company now. Otherwise those last checked 20 hours ago or more.
  const due = companiesDue(getDb(), new Date(), asked ? 0 : 20)
  if (!due.length) return
  running = { done: 0, total: due.length }
  pushProgress()
  const run: LastRun = { finishedAt: '', checked: 0, changes: 0, problems: 0, stoppedBecause: null }
  let failuresInARow = 0
  // Closing the app part-way isn't a problem to report: the companies not reached are still due, so the next run carries on.
  let closed = false
  let clientsUpdated = 0
  try {
    for (const company of due) {
      if (stopping) {
        closed = true
        break
      }
      const refusal = writeRefusal()
      if (refusal) {
        run.stoppedBecause = refusal
        break
      }
      try {
        const profile = (await getCompanyProfileOnly(company.company_number)) as ChProfile
        // The app may have closed, or stopped saving, while Companies House answered.
        if (stopping) {
          closed = true
          break
        }
        const refusedNow = writeRefusal()
        if (refusedNow) {
          run.stoppedBecause = refusedNow
          break
        }
        if (!profile.company_status) throw new CompaniesHouseError('Companies House sent a profile without a status.', null)
        const r = recordProfile(getDb(), company, profile, new Date())
        run.checked += 1
        run.changes += r.changeIds.length
        if (r.clientUpdated) clientsUpdated += 1
        if (r.changeIds.length) pushChanges(r.changeIds)
        failuresInARow = 0
      } catch (err) {
        const status = err instanceof CompaniesHouseError ? err.status : null
        if (status === 404) {
          recordProblem(getDb(), company.company_number, 'Not found at Companies House', new Date())
          run.problems += 1
          run.checked += 1
        } else if (status === 401) {
          run.stoppedBecause = 'Companies House refused the API key. Check it in Settings.'
          break
        } else if (status === 429) {
          run.problems += 1
          await sleep(60_000)
        } else {
          run.problems += 1
          failuresInARow += 1
          if (failuresInARow >= GIVE_UP_AFTER) {
            run.stoppedBecause = err instanceof Error ? err.message : 'Companies House couldn’t be reached.'
            break
          }
        }
      }
      if (running) running.done += 1
      if (running && (running.done % 10 === 0 || running.done === running.total)) pushProgress()
      await sleep(PACE_MS)
    }
  } finally {
    running = null
    run.finishedAt = new Date().toISOString()
    if (!closed) {
      try {
        deps?.saveSetting('ch_check_last_run', JSON.stringify(run))
      } catch {
        /* the next run tries again */
      }
    }
    pushProgress()
    // New changes, or new due dates on client records, may mean new notifications.
    if (run.changes || clientsUpdated) checkNotificationsSoon()
  }
}

// ── The stream ───────────────────────────────────────────────────────────────

/** The saved place in each stream (whole numbers only; anything else is ignored). */
function savedTimepoints(): Timepoints {
  try {
    const v: unknown = JSON.parse(deps?.setting('stream_timepoints') ?? '{}')
    const out: Timepoints = {}
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [ep, t] of Object.entries(v)) if (typeof t === 'number' && Number.isFinite(t)) out[ep as CHStreamEndpoint] = t
    }
    return out
  } catch {
    return {}
  }
}

/** Starts or stops the stream to match the settings (streaming on, a streaming key saved, which streams). */
export function restartStream(): void {
  if (!deps) return
  saveTimepoints()
  stopStreaming()
  refusing = false
  const key = deps.streamKey()
  if (deps.setting('streaming_enabled') !== 'true' || !key) {
    pushStreamStatus()
    return
  }
  startStreaming(key, deps.endpoints(), savedTimepoints())
  pushStreamStatus()
}

function watchedNow(): Map<string, WatchedCompany> {
  if (!watched || Date.now() - watched.at > 5 * 60_000) watched = { at: Date.now(), map: watchedCompanies(getDb()) }
  return watched.map
}

/**
 * One event from the stream. Only those about the practice's clients are kept.
 * While nothing can be saved (the app is read-only, or the database isn't
 * saving) the saved place stays where it was, and once saving works again the
 * stream picks up from there — so nothing published meanwhile is missed, as far
 * back as Companies House keeps.
 */
function onEvent(event: CHStreamEvent): void {
  if (writeRefusal()) {
    refusing = true
    return
  }
  if (refusing) {
    refusing = false
    setImmediate(restartStream)
    return
  }
  try {
    const number = eventCompany(event)
    const company = number ? watchedNow().get(number) : undefined
    if (company) {
      let ids: number[] = []
      if (event.endpoint === '/companies') {
        if (event.event_type !== 'deleted' && (event.data as ChProfile).company_status) {
          ids = recordProfile(getDb(), company, event.data as ChProfile, new Date(), { source: 'stream' }).changeIds
        }
      } else {
        ids = recordChanges(getDb(), company, 'stream', changesFromEvent(event))
      }
      if (ids.length) {
        pushChanges(ids)
        checkNotificationsSoon()
      }
    }
  } catch (err) {
    console.error('[companies house stream]', (err as Error).message)
  }
  // Dealt with, or not about a client: the place moves on.
  if (event.endpoint && typeof event.timepoint === 'number' && Number.isFinite(event.timepoint)) {
    handled[event.endpoint as CHStreamEndpoint] = event.timepoint
    saveTimepointsSoon()
  }
}

function saveTimepoints(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  if (!deps || !Object.keys(handled).length) return
  try {
    deps.saveSetting('stream_timepoints', JSON.stringify({ ...savedTimepoints(), ...handled }))
    handled = {}
  } catch {
    /* saved next time */
  }
}

function saveTimepointsSoon(): void {
  if (!saveTimer) saveTimer = setTimeout(saveTimepoints, 30_000)
}

// ── Telling the window ───────────────────────────────────────────────────────

/** New changes, for the person signed in if they may see them. */
function pushChanges(ids: readonly number[]): void {
  const me = deps?.whoIsSignedIn()
  if (!me) return
  const wanted = new Set(ids)
  for (const c of listChanges(getDb(), me, { days: 2, limit: 1000 }).filter((x) => wanted.has(x.id))) sendToRenderer('pulse:ch-change', c satisfies ChChange)
}

function pushProgress(): void {
  sendToRenderer('pulse:ch-progress', running ? { ...running } : null)
}

function pushStreamStatus(): void {
  sendToRenderer('stream:status-update', streamStatusList())
}

/** How the app keeps up with Companies House, for Activity. */
export function companiesHouseStatus(): CompaniesHouseWatchStatus {
  const db = getDb()
  const apiKey = !!deps?.apiKey()
  const dailyCheck = dailyCheckOn()
  const companies = watchedCompanies(db)
  const notFound = (db.prepare("SELECT company_number FROM ch_company_state WHERE problem LIKE 'Not found%'").all() as Array<{ company_number: string }>).filter((r) => companies.has(r.company_number)).length
  const selected = new Set(deps?.endpoints() ?? [])
  const streams = streamStatusList().filter((s) => selected.has(s.endpoint))
  const streamOn = deps?.setting('streaming_enabled') === 'true'
  const streamKey = !!deps?.streamKey()
  const connected = streams.filter((s) => s.status === 'connected').length
  const streamProblem = streamOn && !streamKey ? 'Streaming is on, but no streaming key is saved.' : streams.find((s) => s.error)?.error ?? null
  const last = lastRun()

  let tone: CompaniesHouseWatchStatus['tone'] = 'ok'
  let text: string
  if (!apiKey && !(streamOn && streamKey)) {
    tone = 'off'
    text = 'Not set up: add the practice’s Companies House API key in Settings.'
  } else if (running) {
    text = `Checking ${running.done} of ${running.total} companies…`
  } else if (apiKey && !dailyCheck) {
    tone = 'off'
    text = 'The daily check is off.'
  } else if (last?.stoppedBecause) {
    tone = 'attention'
    text = `The last check stopped: ${last.stoppedBecause}`
  } else if (last) {
    const when = new Date(last.finishedAt)
    text = `Checked ${last.checked} compan${last.checked === 1 ? 'y' : 'ies'} at ${when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} on ${when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}; ${last.changes} change${last.changes === 1 ? '' : 's'} found.`
  } else {
    text = companies.size ? `${companies.size} client compan${companies.size === 1 ? 'y' : 'ies'} to check; the first check starts a few minutes after the app opens.` : 'No client has a company number yet.'
  }
  // A stream that can't run, or company numbers Companies House doesn't know, need a look.
  if ((streamProblem || notFound) && tone === 'ok') tone = 'attention'
  return {
    tone, text, apiKey, dailyCheck, running: running ? { ...running } : null, lastRun: last, companies: companies.size, notFound,
    stream: { on: streamOn, key: streamKey, connected, streams: streams.length, problem: streamProblem }
  }
}
