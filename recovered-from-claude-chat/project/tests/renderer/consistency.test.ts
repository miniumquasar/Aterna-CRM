/**
 * Level 4F consistency pass: reading pasted cells, the client statuses offered
 * in the older dialogs, the gentle reference notes, and the Tasks screen's
 * groups and due words. Plain functions, no React.
 */
import { describe, expect, it } from 'vitest'
import { parsePastedCells } from '../../src/renderer/src/lib/paste-cells'
import { DEFAULT_CLIENT_STATUSES, withCurrent } from '../../src/renderer/src/components/forms/client-status'
import { referenceNote } from '../../src/renderer/src/components/forms/reference-note'
import { checkUtr, checkVatNumber } from '../../src/shared/references'
import { GROUP_LABELS, PRIORITY_LABELS, dueWords, groupOf } from '../../src/renderer/src/screens/crm/Tasks'

describe('reading cells pasted from a spreadsheet', () => {
  it('reads tab-separated cells copied from Excel, headings first', () => {
    const r = parsePastedCells('Company Name\tCompany Number\tEmail\nACME LTD\t12345678\tinfo@acme.co.uk\nSMITH & CO\t87654321\t\n')
    expect(r.headers).toEqual(['Company Name', 'Company Number', 'Email'])
    expect(r.rows).toEqual([
      ['ACME LTD', '12345678', 'info@acme.co.uk'],
      ['SMITH & CO', '87654321', '']
    ])
  })

  it('keeps a comma inside quotes in one cell, and undoubles quote marks', () => {
    const r = parsePastedCells('Name,Notes\n"Smith, Jones & Co","Said ""call after 3"""\nPlain Ltd,none')
    expect(r.rows).toEqual([
      ['Smith, Jones & Co', 'Said "call after 3"'],
      ['Plain Ltd', 'none']
    ])
  })

  it('keeps a line break inside a quoted cell, and copes with Windows line endings', () => {
    const r = parsePastedCells('Name\tAddress\r\n"Alpha Ltd"\t"1 High Street\r\nLondon"\r\nBeta Ltd\t2 Low Road\r\n')
    expect(r.rows).toEqual([
      ['Alpha Ltd', '1 High Street\nLondon'],
      ['Beta Ltd', '2 Low Road']
    ])
  })

  it('drops blank rows and trims cells; an apostrophe or a quote mark inside a cell is kept', () => {
    const r = parsePastedCells('\n\n Name , Size \n\n O\'Brien Ltd , 5" floppy \n , \n')
    expect(r.headers).toEqual(['Name', 'Size'])
    expect(r.rows).toEqual([["O'Brien Ltd", '5" floppy']])
  })

  it('finds nothing in empty text, and only headings in a single row', () => {
    expect(parsePastedCells('   \n  ')).toEqual({ headers: [], rows: [] })
    expect(parsePastedCells('Name\tEmail')).toEqual({ headers: ['Name', 'Email'], rows: [] })
  })
})

describe('the statuses a client can be given', () => {
  it('offers the register’s statuses', () => {
    expect(DEFAULT_CLIENT_STATUSES.map((s) => s.value)).toEqual(['Active', 'Prospect', 'Dormant', 'Review required', 'Former client', 'Ceased', 'Dissolved'])
  })

  it('keeps a client’s older status choosable, marked, so saving never changes it by accident', () => {
    const list = withCurrent(DEFAULT_CLIENT_STATUSES, 'Inactive')
    expect(list.at(-1)).toEqual({ value: 'Inactive', label: 'Inactive (older status)' })
    expect(withCurrent(DEFAULT_CLIENT_STATUSES, 'dormant')).toHaveLength(DEFAULT_CLIENT_STATUSES.length)
    expect(withCurrent(DEFAULT_CLIENT_STATUSES, null)).toHaveLength(DEFAULT_CLIENT_STATUSES.length)
    expect(withCurrent(DEFAULT_CLIENT_STATUSES, '  ')).toHaveLength(DEFAULT_CLIENT_STATUSES.length)
  })
})

describe('gentle notes under reference fields', () => {
  it('says nothing about an empty field or a good reference', () => {
    expect(referenceNote('', checkUtr)).toBeUndefined()
    expect(referenceNote(null, checkUtr)).toBeUndefined()
    expect(referenceNote('2234567890', checkUtr)).toBeUndefined() // a valid check digit
  })

  it('flags a reference that doesn’t pass, and says it will still be saved', () => {
    expect(referenceNote('12345', checkUtr)).toBe('A UTR is 10 digits. Saving keeps it as entered and flags it under Issues.')
    expect(referenceNote('GB 123 4567 89', checkVatNumber)).toMatch(/don’t pass the VAT number check\. .*Saving keeps it as entered and flags it under Issues\.$/)
  })
})

describe('the Tasks screen’s groups and due words', () => {
  const today = '2026-10-20'

  it('puts a task under overdue, today, the next 7 days or later', () => {
    expect(groupOf('2026-10-19', today)).toBe('overdue')
    expect(groupOf('2026-10-20', today)).toBe('today')
    expect(groupOf('2026-10-21', today)).toBe('week')
    expect(groupOf('2026-10-27', today)).toBe('week')
    expect(groupOf('2026-10-28', today)).toBe('later')
    expect(groupOf(null, today)).toBe('later')
    expect(groupOf('soon', today)).toBe('later')
  })

  it('counts whole days across the change of the clocks', () => {
    // The clocks go back on 25 October 2026: that day has 25 hours.
    expect(dueWords('2026-10-26', '2026-10-24')).toBe('In 2 days')
    expect(dueWords('2026-03-30', '2026-03-28')).toBe('In 2 days')
  })

  it('says how far off a task is in words', () => {
    expect(dueWords('2026-10-17', today)).toBe('3 days overdue')
    expect(dueWords('2026-10-19', today)).toBe('1 day overdue')
    expect(dueWords('2026-10-20', today)).toBe('Due today')
    expect(dueWords('2026-10-21', today)).toBe('In 1 day')
    expect(dueWords('2026-10-24', today)).toBe('In 4 days')
    expect(dueWords(null, today)).toBe('No date')
    expect(dueWords('2026-11-12', today)).toMatch(/12 Nov 2026/)
  })

  it('names priorities and groups in plain words', () => {
    expect(PRIORITY_LABELS.medium).toBe('Normal')
    expect(Object.values(GROUP_LABELS)).toEqual(['Overdue', 'Due today', 'In the next 7 days', 'Later'])
  })
})
