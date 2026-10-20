/**
 * Keeping up with Companies House in the background (services/ch-watch.ts):
 * the stream keeps only events about clients and remembers where it got to —
 * and holds that place while nothing can be saved, so nothing is missed — and
 * the daily check records changes, keeps client records up to date, notes
 * companies that aren't found, stops when the key is refused, and doesn't call
 * closing the app a problem. Companies House itself is made up here.
 */
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { CHStreamEvent } from '../../src/shared/types'
import type { ChProfile } from '../../src/main/records/ch-watch'
import { partner, practice } from '../records/helpers'

const state = vi.hoisted(() => ({
  db: null as unknown as Database,
  refusal: null as string | null,
  sent: [] as Array<[string, unknown]>,
  notifySoon: 0,
  started: [] as Array<{ key: string; endpoints: string[]; from: Record<string, number> }>,
  stopped: 0,
  emitter: null as unknown as EventEmitter,
  profile: ((): Promise<unknown> => Promise.reject(new Error('no profile'))) as (n: string) => Promise<unknown>,
  settings: new Map<string, string>()
}))

vi.mock('../../src/main/db/schema', () => ({ getDb: () => state.db }))
vi.mock('../../src/main/licence', () => ({ writeRefusal: () => state.refusal }))
vi.mock('../../src/main/window-events', () => ({ sendToRenderer: (channel: string, payload: unknown) => state.sent.push([channel, payload]) }))
vi.mock('../../src/main/services/notifier', () => ({ checkNotificationsSoon: () => { state.notifySoon += 1 } }))
vi.mock('../../src/main/services/companies-house', () => {
  class CompaniesHouseError extends Error {
    constructor(message: string, readonly status: number | null) {
      super(message)
    }
  }
  return { CompaniesHouseError, getCompanyProfileOnly: (n: string) => state.profile(n), hasCHClient: () => true, initCHClient: () => undefined }
})
vi.mock('../../src/main/services/ch-streaming', async () => {
  const { EventEmitter: Emitter } = await import('node:events')
  state.emitter = new Emitter()
  return {
    streamEmitter: state.emitter,
    startStreaming: (key: string, endpoints: string[], from: Record<string, number>) => state.started.push({ key, endpoints, from }),
    stopStreaming: () => { state.stopped += 1 },
    streamStatusList: () => []
  }
})

const { checkCompaniesHouseNow, companiesHouseStatus, startCompaniesHouseWatch, stopCompaniesHouseWatch } = await import('../../src/main/services/ch-watch')
const { CompaniesHouseError } = await import('../../src/main/services/companies-house')

function start(opts: { apiKey?: string | null; streamKey?: string | null } = {}): void {
  startCompaniesHouseWatch({
    apiKey: () => (opts.apiKey === undefined ? 'rest-key' : opts.apiKey),
    streamKey: () => (opts.streamKey === undefined ? 'stream-key' : opts.streamKey),
    endpoints: () => ['/filings', '/officers'],
    setting: (k) => state.settings.get(k) ?? null,
    saveSetting: (k, v) => {
      state.settings.set(k, v)
    },
    whoIsSignedIn: () => partner
  })
}

const filing = (company: string, timepoint: number, type = 'AA'): CHStreamEvent => ({
  resource_kind: 'filing-history',
  resource_id: `f${timepoint}`,
  resource_uri: `/company/${company}/filing-history/f${timepoint}`,
  data: { type, category: 'accounts', description: 'accounts-with-accounts-type-micro-entity', description_values: { made_up_date: '2025-12-31' } },
  published_at: '2026-10-19T09:00:00',
  endpoint: '/filings',
  timepoint,
  event_type: 'changed'
})

const changes = (): Array<{ client_ref: string; summary: string; source: string }> =>
  state.db.prepare('SELECT client_ref, summary, source FROM ch_changes ORDER BY id').all() as Array<{ client_ref: string; summary: string; source: string }>
const savedPlace = (): unknown => JSON.parse(state.settings.get('stream_timepoints') ?? 'null')
const nextTick = (): Promise<void> => new Promise((r) => setImmediate(r))

beforeEach(() => {
  state.db = practice()
  state.db.exec("UPDATE clients SET reg_no = '01234567' WHERE ref = 'C1'; UPDATE clients SET reg_no = '07654321' WHERE ref = 'C2'")
  state.refusal = null
  state.sent = []
  state.notifySoon = 0
  state.started = []
  state.stopped = 0
  state.settings = new Map([['streaming_enabled', 'true']])
})

afterEach(() => {
  stopCompaniesHouseWatch()
})

describe('the stream', () => {
  it('keeps only events about clients, and saves where it got to', () => {
    start()
    expect(state.started).toEqual([{ key: 'stream-key', endpoints: ['/filings', '/officers'], from: {} }])
    state.emitter.emit('event', filing('01234567', 100))
    state.emitter.emit('event', filing('09999999', 101)) // not a client
    expect(changes()).toEqual([{ client_ref: 'C1', summary: 'Accounts filed, made up to 31 December 2025', source: 'stream' }])
    expect(state.sent.filter(([c]) => c === 'pulse:ch-change')).toHaveLength(1)
    expect(state.notifySoon).toBe(1)
    stopCompaniesHouseWatch()
    expect(savedPlace()).toEqual({ '/filings': 101 })
  })

  it('resumes from the saved place, ignoring a saved place that isn’t a number', () => {
    state.settings.set('stream_timepoints', JSON.stringify({ '/filings': 4000, '/officers': 'x' }))
    start()
    expect(state.started[0].from).toEqual({ '/filings': 4000 })
  })

  it('holds its place while nothing can be saved, and picks up from there once it can', async () => {
    state.settings.set('stream_timepoints', JSON.stringify({ '/filings': 50 }))
    start()
    state.emitter.emit('event', filing('01234567', 51))
    state.refusal = 'Your licence has expired, so the app is read-only.'
    state.emitter.emit('event', filing('01234567', 52, 'CS01'))
    stopCompaniesHouseWatch()
    expect(changes().map((c) => c.summary)).toEqual(['Accounts filed, made up to 31 December 2025'])
    expect(savedPlace()).toEqual({ '/filings': 51 }) // not 52: that event wasn't kept

    // Next time the app opens it is still read-only; then a licence key is entered.
    start()
    expect(state.started.at(-1)?.from).toEqual({ '/filings': 51 })
    state.emitter.emit('event', filing('01234567', 53, 'CS01'))
    state.refusal = null
    state.emitter.emit('event', filing('01234567', 54, 'CS01'))
    await nextTick()
    // The stream starts again from the last event kept, so 52 to 54 come again and are kept then.
    expect(state.started.at(-1)?.from).toEqual({ '/filings': 51 })
    expect(changes()).toHaveLength(1)
  })

  it('stays off without a streaming key, or with streaming turned off', () => {
    start({ streamKey: null })
    expect(state.started).toEqual([])
    stopCompaniesHouseWatch()
    state.settings.set('streaming_enabled', 'false')
    start()
    expect(state.started).toEqual([])
  })
})

describe('the daily check', () => {
  const company = (over: Partial<ChProfile> = {}): ChProfile => ({
    company_number: '01234567',
    company_name: 'ALPHA LTD',
    company_status: 'active',
    company_status_detail: 'active-proposal-to-strike-off',
    accounts: { next_due: '2027-06-30', overdue: false },
    confirmation_statement: { next_due: '2027-01-14', overdue: false },
    ...over
  })
  beforeEach(() => {
    state.settings.set('streaming_enabled', 'false')
  })
  const finished = async (): Promise<void> => {
    await vi.waitFor(() => expect(companiesHouseStatus().running).toBeNull(), { timeout: 15_000, interval: 50 })
  }

  it('records changes, keeps the client record up to date, and counts companies not found', async () => {
    state.profile = async (n) => {
      if (n === '01234567') return company()
      throw new CompaniesHouseError('Not found', 404)
    }
    start({ streamKey: null })
    expect(checkCompaniesHouseNow()).toEqual({ started: true, total: 2, reason: null })
    expect(checkCompaniesHouseNow()).toMatchObject({ started: false, reason: 'A check is already running.' })
    await finished()

    expect(changes()).toEqual([{ client_ref: 'C1', summary: expect.stringMatching(/strike off/i), source: 'check' }])
    expect(state.db.prepare("SELECT company_status, accounts_due, conf_stmt_due FROM clients WHERE ref = 'C1'").get()).toEqual({
      company_status: 'strike_off', accounts_due: '2027-06-30', conf_stmt_due: '2027-01-14'
    })
    expect(state.db.prepare("SELECT problem FROM ch_company_state WHERE company_number = '07654321'").get()).toEqual({ problem: 'Not found at Companies House' })
    expect(JSON.parse(state.settings.get('ch_check_last_run') ?? 'null')).toMatchObject({ checked: 2, changes: 1, problems: 1, stoppedBecause: null })
    // A company number Companies House doesn't know needs a look.
    expect(companiesHouseStatus()).toMatchObject({ tone: 'attention', notFound: 1, companies: 2, text: expect.stringMatching(/^Checked 2 companies at .+; 1 change found\.$/) })
    expect(state.notifySoon).toBeGreaterThan(0)
  }, 20_000)

  it('stops when Companies House refuses the key, and says so', async () => {
    state.profile = async () => {
      throw new CompaniesHouseError('Unauthorised', 401)
    }
    start({ streamKey: null })
    checkCompaniesHouseNow()
    await finished()
    expect(JSON.parse(state.settings.get('ch_check_last_run') ?? 'null')).toMatchObject({ checked: 0, stoppedBecause: 'Companies House refused the API key. Check it in Settings.' })
    expect(companiesHouseStatus()).toMatchObject({ tone: 'attention', text: 'The last check stopped: Companies House refused the API key. Check it in Settings.' })
  }, 20_000)

  it('writes nothing while the app is read-only', async () => {
    state.profile = async () => company()
    state.refusal = 'Your licence has expired, so the app is read-only.'
    start({ streamKey: null })
    checkCompaniesHouseNow()
    await finished()
    expect(changes()).toEqual([])
    expect(JSON.parse(state.settings.get('ch_check_last_run') ?? 'null')).toMatchObject({ checked: 0, stoppedBecause: 'Your licence has expired, so the app is read-only.' })
  }, 20_000)

  it('doesn’t call closing the app part-way a problem, and saves nothing it was given after closing', async () => {
    let answer: (p: ChProfile) => void = () => undefined
    state.profile = () => new Promise((resolve) => { answer = resolve })
    start({ streamKey: null })
    checkCompaniesHouseNow()
    await nextTick()
    stopCompaniesHouseWatch()
    answer(company())
    await finished()
    expect(changes()).toEqual([])
    expect(state.settings.get('ch_check_last_run')).toBeUndefined()
  }, 20_000)

  it('needs the API key', () => {
    start({ apiKey: null, streamKey: null })
    expect(checkCompaniesHouseNow()).toMatchObject({ started: false, reason: 'Add the practice’s Companies House API key in Settings first.' })
    expect(companiesHouseStatus()).toMatchObject({ tone: 'off' })
  })
})
