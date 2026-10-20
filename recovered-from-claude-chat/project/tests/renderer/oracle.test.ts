/**
 * Forecast, Security and the assistant on screen: the chart arithmetic
 * (components/charts/scale.ts), the figures and rows Forecast shows, the
 * words for each security tile and the sentence above them, the audit log's
 * choices and values, and the assistant's state and download in words. Plain
 * functions, no React.
 */
import { describe, expect, it } from 'vitest'
import type { AiStatus, AuditCheck, Forecast } from '../../src/shared/types'
import { compactNumber, compactPounds, heatColours, heatStep, monthTick, niceMax, peakIndex, VIZ } from '../../src/renderer/src/components/charts/scale'
import { headline, obligationRows, personRows, whoseOptions } from '../../src/renderer/src/screens/crm/Oracle'
import { auditTile, needsALook, recoveryTile, vaultTile } from '../../src/renderer/src/screens/crm/Fortress'
import { auditQuery, fieldWords, prettyValue, registerName } from '../../src/renderer/src/screens/crm/AuditLog'
import { aiStateText, bytesText, pullFraction, pullText } from '../../src/renderer/src/components/assistant/ai-status'
import { auditWho } from '../../src/shared/audit-words'

describe('chart arithmetic', () => {
  it('shades a count by fifths of the largest, none for nothing, with dark text on the light steps', () => {
    expect([0, 1, 2, 5, 6, 10, 11].map((n) => heatStep(n, 10))).toEqual([0, 1, 1, 3, 3, 5, 5])
    expect(heatStep(3, 0)).toBe(0)
    expect(heatStep(-1, 10)).toBe(0)
    expect(heatColours(0)).toBeNull()
    expect(heatColours(1)).toEqual({ fill: VIZ.heat[0], text: VIZ.ink })
    expect(heatColours(4)).toEqual({ fill: VIZ.heat[3], text: VIZ.inkDark })
  })

  it('writes axis numbers short, from a thousand up, and money in pounds', () => {
    expect([0, 950, 1000, 1200, 1250, 12_900, 2_000_000, 2_500_000, -1500].map(compactNumber)).toEqual([
      '0',
      '950',
      '1K',
      '1.2K',
      '1.25K',
      '12.9K',
      '2M',
      '2.5M',
      '-1.5K'
    ])
    expect(compactPounds(120_000)).toBe('£1.2K')
    expect(compactPounds(125_000)).toBe('£1.25K')
    expect(compactPounds(9_900)).toBe('£99')
    expect(compactPounds(-150_000)).toBe('-£1.5K')
    // A small scale that steps in pence: every tick keeps its own label.
    const small = niceScale(150).ticks.map(compactPounds)
    expect(small).toEqual(['£0', '£0.50', '£1', '£1.50'])
    expect(new Set(small).size).toBe(small.length)
    // Every tick of a money scale reads back as its own value: no "£1.3K" on a tick at £1,250.
    for (const max of [120_000, 333_333, 9_999_999]) {
      const labels = niceScale(max).ticks.map(compactPounds)
      expect(new Set(labels).size).toBe(labels.length)
    }
  })

  it('labels months with the year on the first and on January, finds the peak, and rounds the top of a scale', () => {
    expect(['Oct 2026', 'Nov 2026', 'Dec 2026', 'Jan 2027', 'Feb 2027'].map(monthTick)).toEqual(['Oct 2026', 'Nov', 'Dec', 'Jan 2027', 'Feb'])
    expect(peakIndex([2, 7, 7, 1])).toBe(1)
    expect(peakIndex([0, 0])).toBe(-1)
    expect([0, 1, 7, 78, 100, 1234, 0.5].map(niceMax)).toEqual([1, 1, 8, 80, 100, 1500, 1])
  })
})

const forecastOf = (over: Partial<Forecast> = {}): Forecast => ({
  today: '2026-10-20',
  scope: 'practice',
  whose: 'everyone',
  months: [
    { key: '2026-10', label: 'Oct 2026' },
    { key: '2026-11', label: 'Nov 2026' },
    { key: '2026-12', label: 'Dec 2026' }
  ],
  workload: {
    overdue: 3,
    oldestOverdueDays: 1,
    byMonth: [4, 9, 0],
    byObligation: [
      { obligation: 'vat_return', label: 'VAT return', overdue: 2, byMonth: [4, 1, 0], total: 7 },
      { obligation: 'ct600', label: 'Corporation tax return (CT600)', overdue: 1, byMonth: [0, 8, 0], total: 9 },
      { obligation: 'ct_payment', label: 'Corporation tax payment', overdue: 0, byMonth: [0, 0, 0], total: 0 }
    ],
    byPerson: [
      { person: 'Sam', overdue: 3, byMonth: [4, 9, 0], total: 16 },
      { person: null, overdue: 0, byMonth: [0, 0, 0], total: 0 }
    ],
    busiest: { key: '2026-11', label: 'Nov 2026', count: 9 },
    tasks: { overdue: 0, byMonth: [0, 0, 0], undated: 0 },
    wip: []
  },
  fees: { annualPence: 0, byMonth: [0, 0, 0], oneOffPence: 0, clientsWithFees: 0, clientsWithout: 2, unscheduledServices: 0, spreadEvenly: 0 },
  cash: { owedPence: 0, overduePence: 0, creditPence: 0, expectedByMonth: [0, 0, 0], undatedPence: 0, received: [], invoices: 0 },
  people: ['Pat', 'Sam'],
  notes: [],
  ...over
})

describe('Forecast on screen', () => {
  it('leads with what is overdue, what falls due, the busiest month and money owed', () => {
    expect(headline(forecastOf()).map((t) => [t.label, t.value, t.detail])).toEqual([
      ['Overdue now', '3', 'The oldest is 1 day late.'],
      ['Due in the next 3 months', '13', 'Across 2 kinds of work.'],
      ['Busiest month', 'Nov 2026', '9 deadlines fall due.'],
      ['Owed to the practice', 'None recorded', 'No invoices yet.']
    ])
    const owed = headline(forecastOf({ cash: { owedPence: 123_456, overduePence: 23_456, creditPence: 0, expectedByMonth: [0, 0, 0], undatedPence: 0, received: [], invoices: 2 } }))[3]
    expect(owed).toMatchObject({ value: '£1,235', detail: '£235 of it overdue.', alert: true })
    const calm = headline(forecastOf({ workload: { ...forecastOf().workload, overdue: 0, byMonth: [0, 0, 0], busiest: null } }))
    expect(calm.map((t) => t.detail)).toEqual(['Nothing is overdue.', 'No deadlines fall due.', 'Nothing falls due in these months.', 'No invoices yet.'])
  })

  it('offers whose work to show: anyone’s for partners and managers, within their own for staff', () => {
    expect(whoseOptions('partner', 'Pat', ['Pat', 'Sam']).map((o) => [o.value, o.label])).toEqual([
      ['everyone', 'Everyone’s'],
      ['mine', 'Mine (Pat)'],
      ['nobody', 'Nobody’s yet'],
      ['person:Sam', 'Sam']
    ])
    expect(whoseOptions('staff', 'Sam', ['Pat']).map((o) => o.value)).toEqual(['everyone', 'mine'])
  })

  it('turns kinds of work and people into heat-table rows, with nobody’s named plainly', () => {
    expect(obligationRows(forecastOf()).map((r) => [r.key, r.label, r.total])).toEqual([
      ['vat_return', 'VAT return', 7],
      ['ct600', 'Corporation tax return (CT600)', 9],
      ['ct_payment', 'Corporation tax payment', 0]
    ])
    expect(personRows(forecastOf()).map((r) => [r.key, r.label])).toEqual([
      ['Sam', 'Sam'],
      ['(nobody)', 'Nobody yet']
    ])
  })
})

describe('Security on screen', () => {
  it('says how the recovery sheet stands', () => {
    expect(recoveryTile({ available: false, fingerprint: null, done: false, last: null, reason: 'Not using its own key.' })).toEqual({ tone: 'off', text: 'Not using its own key.' })
    expect(recoveryTile({ available: true, fingerprint: 'ab', done: false, last: null }).tone).toBe('problem')
    expect(recoveryTile({ available: true, fingerprint: 'ab', done: false, last: { fingerprint: 'old', savedAt: '2026-01-01T09:00:00Z', savedBy: 'Pat', how: 'pdf' } }).text).toMatch(/^The sheet on file is for an earlier key/)
    const done = recoveryTile({ available: true, fingerprint: 'ab', done: true, last: { fingerprint: 'ab', savedAt: '2026-10-01T09:00:00Z', savedBy: 'Pat', how: 'print' } })
    expect(done.tone).toBe('ok')
    expect(done.text).toMatch(/^Printed for this key by Pat on 1 Oct 2026/)
  })

  it('says how the vault stands, and flags logins with no user ID or no password — never a shared password', () => {
    const v = { setUp: true, unlocked: false, locksAt: null, logins: 12, noUserId: 0, noPassword: 0, governmentSignIn: false }
    expect(vaultTile(v)).toEqual({ tone: 'ok', text: 'Locked. 12 logins stored.' })
    expect(vaultTile({ ...v, noUserId: 1, noPassword: 2 })).toEqual({ tone: 'attention', text: 'Locked. 12 logins stored. To follow up: 1 login with no user ID and 2 logins with no password stored.' })
    expect(vaultTile({ ...v, setUp: false }).tone).toBe('off')
  })

  it('says how the audit log’s seals stand', () => {
    const base: AuditCheck = { state: 'intact', checkedAt: '', entries: 120, seals: 3, sealedThrough: 118, sealedAt: '2026-10-20 09:00:00', fingerprint: 'a1b2 c3d4 e5f6 a7b8', unsealed: 2, problem: null }
    expect(auditTile(base)).toEqual({ tone: 'ok', text: 'Intact: all 118 sealed entries match their seals. 2 newer entries will be sealed within the hour.' })
    expect(auditTile({ ...base, state: 'unsealed', seals: 0, unsealed: 120 }).tone).toBe('attention')
    const changed = auditTile({ ...base, state: 'changed', problem: { fromId: 40, toId: 80, sealedAt: '2026-10-19 09:00:00', missing: 3 } })
    expect(changed.tone).toBe('problem')
    expect(changed.text).toMatch(/^Changed outside the app: entries 40 to 80, sealed 19 Oct 2026, .+, no longer match their seal, and 3 entries are missing\./)
  })

  it('names what needs attention now, then what needs a look, or says all is in order', () => {
    expect(needsALook([{ name: 'the database', tone: 'ok' }, { name: 'the licence', tone: 'off' }])).toBe('Everything here is in order.')
    expect(needsALook([{ name: 'backups', tone: 'attention' }])).toBe('One thing needs a look: backups.')
    expect(needsALook([{ name: 'backups', tone: 'attention' }, { name: 'the vault', tone: 'attention' }])).toBe('2 things need a look: backups and the vault.')
    expect(needsALook([{ name: 'the recovery sheet', tone: 'problem' }])).toBe('One thing needs attention now: the recovery sheet.')
    expect(needsALook([{ name: 'the recovery sheet', tone: 'problem' }, { name: 'the vault', tone: 'attention' }])).toBe(
      'One thing needs attention now: the recovery sheet. One more needs a look: the vault.'
    )
    expect(
      needsALook([
        { name: 'backups', tone: 'problem' },
        { name: 'the vault', tone: 'attention' },
        { name: 'the audit log', tone: 'problem' },
        { name: 'the licence', tone: 'attention' }
      ])
    ).toBe('2 things need attention now: backups and the audit log. 2 more need a look: the vault and the licence.')
  })

  it('asks the audit log only for the choices made, and shows values as they are easiest to read', () => {
    expect(auditQuery({ from: '', to: '', who: '', kind: '', find: '  ' })).toEqual({})
    expect(auditQuery({ from: '2026-10-01', to: '2026-10-20', who: 'system', kind: 'billing', find: ' INV-1 ' })).toEqual({ from: '2026-10-01', to: '2026-10-20', who: 'system', kind: 'billing', find: 'INV-1' })
    expect(prettyValue('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(prettyValue('plain words')).toBe('plain words')
    expect(prettyValue(null)).toBe('')
    expect(registerName('clients')).toBe('Clients')
    expect(registerName('some_new_table')).toBe('some new table')
    // Changed fields in words for the list; an abbreviation keeps its capitals.
    expect(['version', 'secrets_resealed', 'amount_pence', 'client_ref', 'vat_no', 'utr'].map((f) => fieldWords('vault_keys', f))).toEqual([
      'version',
      'secrets resealed',
      'amount',
      'client',
      'VAT number',
      'UTR'
    ])
    expect(fieldWords(null, 'due_date')).toBe('due date')
    expect([auditWho('system'), auditWho(null), auditWho('Pat')]).toEqual(['The app', 'Nobody signed in', 'Pat'])
  })
})

describe('the assistant on screen', () => {
  const status = (over: Partial<AiStatus>): AiStatus => ({ state: 'ready', model: 'llama3.1:8b', models: [], version: null, installedAt: null, platform: 'win32', steps: [], checkedAt: '', pulling: null, ...over })

  it('says each state in a sentence', () => {
    expect(aiStateText(status({}))).toBe('Ready. The model “llama3.1:8b” runs on this computer, and nothing you ask leaves it.')
    expect(aiStateText(status({ state: 'no_model' }))).toBe('Ollama is running, but the model “llama3.1:8b” isn’t on this computer yet.')
    expect(aiStateText(status({ state: 'not_running' }))).toBe('Ollama is installed on this computer, but it isn’t running.')
    expect(aiStateText(status({ state: 'not_installed' }))).toBe('The assistant runs on Ollama, which isn’t installed on this computer yet.')
  })

  it('says how a download is going, and how it ended', () => {
    const p = { model: 'llama3.1:8b', status: 'pulling abc', completed: 1_200_000_000, total: 4_900_000_000, done: false, error: null }
    expect(pullText(p)).toBe('Downloading “llama3.1:8b”: 1.2 GB of 4.9 GB (24%)')
    expect(pullFraction(p)).toBeCloseTo(0.2449, 3)
    expect(pullText({ ...p, completed: null, total: null, status: 'Pulling manifest' })).toBe('Downloading “llama3.1:8b”: pulling manifest…')
    expect(pullFraction({ ...p, total: null })).toBeNull()
    expect(pullText({ ...p, done: true, status: 'Downloaded' })).toBe('“llama3.1:8b” is downloaded.')
    expect(pullText({ ...p, done: true, status: 'Cancelled' })).toBe('Download cancelled.')
    expect(pullText({ ...p, done: true, status: 'Failed', error: 'There is no model called “x”.' })).toBe('There is no model called “x”.')
    expect([bytesText(52_000_000), bytesText(512), bytesText(null)]).toEqual(['52 MB', '1 KB', ''])
  })
})
