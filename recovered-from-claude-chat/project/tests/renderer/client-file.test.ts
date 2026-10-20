/**
 * The Client file's register panels in words (Level 4F): links as sentences,
 * what a pension save did to its deadlines, filing routes, and the tax year
 * a new payroll year starts at. Plain functions, no React.
 */
import { describe, expect, it } from 'vitest'
import { linkSentence, linkStatement } from '../../src/renderer/src/screens/crm/clientfile/LinksPanel'
import { deadlineChanges } from '../../src/renderer/src/screens/crm/clientfile/PensionsPanel'
import { routesText } from '../../src/renderer/src/screens/crm/clientfile/SelfAssessmentPanel'
import { currentTaxYear } from '../../src/renderer/src/screens/crm/clientfile/PayrollPanel'
import { dayLabel, daysToCover, monthName, monthWeeks } from '../../src/renderer/src/screens/crm/Calendar'
import { screenTitle } from '../../src/renderer/src/components/layout/ScreenTabs'
import type { OpenDeadline } from '../../src/shared/types'

describe('the Client file’s registers in words', () => {
  it('reads a link from this client’s side, either way round', () => {
    expect(linkSentence('director_of', 'Director of', 'outgoing', 'Alpha Ltd')).toBe('Director of Alpha Ltd')
    expect(linkSentence('director_of', 'Director of', 'incoming', 'Jo Bloggs')).toBe('Jo Bloggs is a director of this client')
    expect(linkSentence('shareholder_of', 'Shareholder of', 'incoming', 'Jo Bloggs')).toBe('Jo Bloggs is a shareholder of this client')
    // Links that read the same both ways don't change with the direction.
    expect(linkSentence('connected_to', 'Connected to', 'incoming', 'Beta Ltd')).toBe('Connected to Beta Ltd')
    expect(linkSentence('spouse_or_partner', 'Spouse / partner', 'outgoing', 'Sam')).toBe('Spouse or partner of Sam')
    // A kind the practice added itself.
    expect(linkSentence('trustee_of', 'Trustee of', 'outgoing', 'The Smith Trust')).toBe('Trustee of The Smith Trust')
    expect(linkSentence('trustee_of', 'Trustee of', 'incoming', 'Jo')).toBe('Jo is trustee of this client')
    expect(linkStatement('director_of', 'Director of', 'Jo Bloggs', 'Alpha Ltd')).toBe('Jo Bloggs is a director of Alpha Ltd')
  })

  it('says what saving or removing a pension did to its re-declaration deadlines', () => {
    const none = { scheme: null, deadlinesAdded: [], deadlinesArchived: 0, deadlinesRestored: 0 }
    expect(deadlineChanges(none)).toBe('')
    expect(deadlineChanges({ ...none, deadlinesAdded: [{ id: 1, due_date: '2029-05-31', status: 'not_started' }, { id: 2, due_date: '2026-05-31', status: 'unknown' }] })).toBe(
      'Re-declaration deadlines added: due 31 May 2026 (passed: confirm it was made) and 31 May 2029.'
    )
    expect(deadlineChanges({ ...none, deadlinesArchived: 2, deadlinesAdded: [{ id: 3, due_date: '2027-07-31', status: 'not_started' }] })).toBe(
      'Re-declaration deadline added: due 31 Jul 2027. 2 open re-declaration deadlines from the old date archived.'
    )
    expect(deadlineChanges({ ...none, deadlinesArchived: 1 }, true)).toBe('1 open re-declaration deadline archived with it.')
    expect(deadlineChanges({ ...none, deadlinesRestored: 2 })).toBe('2 earlier re-declaration deadlines back on the list.')
  })

  it('lays the calendar out Monday first, and reads far enough ahead for the month shown', () => {
    const october = monthWeeks(2026, 9)
    // 1 October 2026 is a Thursday: three blank days before it.
    expect(october[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(october.at(-1)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null])
    expect(october.every((w) => w.length === 7)).toBe(true)
    expect(monthWeeks(2027, 1).flat().filter(Boolean)).toHaveLength(28)
    expect(monthName(2026, 9)).toBe('October 2026')
    expect(daysToCover('2026-10-20', 2026, 9)).toBe(11)
    expect(daysToCover('2026-10-20', 2026, 10)).toBe(41)
    expect(daysToCover('2026-10-20', 2026, 8)).toBe(0) // a past month: its open deadlines are the overdue ones
    const d = (days: number): OpenDeadline => ({ key: `k${days}`, source: 'register', client_id: 1, client_ref: 'C1', client_name: 'Alpha', obligation: 'vat_return', period_end: null, tax_year: null, due_date: '2026-10-20', days, status: null, person: null })
    expect(dayLabel('2026-10-20', [])).toBe('Tuesday 20 October 2026')
    expect(dayLabel('2026-10-20', [d(-3), d(0)])).toBe('Tuesday 20 October 2026: 2 deadlines, 1 overdue')
  })

  it('names every screen once, for its heading and for screen readers', () => {
    expect(screenTitle('oracle')).toEqual({ group: 'Practice', title: 'Forecast', tab: null })
    expect(screenTitle('audit')).toEqual({ group: 'System', title: 'Security', tab: 'Audit log' })
    expect(screenTitle('client-file')).toEqual({ group: 'Clients', title: 'Clients', tab: 'Client file' })
    expect(screenTitle('about')).toEqual({ group: 'Help', title: 'About and help', tab: null })
    expect(screenTitle('ai')).toEqual({ group: 'Assistant', title: 'AI assistant', tab: null })
  })

  it('names filing routes, and starts a payroll year at the tax year running now', () => {
    expect(routesText('own_agent; client_gateway')).toBe('Our agent gateway, Client’s own gateway')
    expect(routesText(null)).toBe('')
    expect(routesText('legacy_route')).toBe('legacy_route')
    expect(currentTaxYear(new Date(2026, 3, 5))).toBe('2025-26')
    expect(currentTaxYear(new Date(2026, 3, 6))).toBe('2026-27')
    expect(currentTaxYear(new Date(2026, 9, 20))).toBe('2026-27')
    expect(currentTaxYear(new Date(2027, 0, 2))).toBe('2026-27')
  })
})
