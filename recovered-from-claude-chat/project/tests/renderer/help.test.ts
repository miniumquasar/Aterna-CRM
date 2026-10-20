/**
 * About and help (Level 4F): every guide points at a real screen, and the
 * support form writes an email the mail app can open, carrying this copy's
 * details only when asked, and falling back to the clipboard when too long.
 */
import { describe, expect, it } from 'vitest'
import { GUIDES, WHATS_NEW } from '../../src/renderer/src/screens/crm/help/guides'
import { MAILTO_LIMIT, SUPPORT_EMAIL, SUPPORT_TOPICS, supportEmail } from '../../src/renderer/src/screens/crm/help/support'
import { NAV_ROUTES } from '../../src/renderer/src/navigation/routes'
import { OUTSIDE_SIDEBAR, placeOf } from '../../src/renderer/src/navigation/nav'

describe('the guides', () => {
  it('each open a screen that exists and has a place', () => {
    for (const g of GUIDES) {
      if (!g.open) continue
      expect(NAV_ROUTES).toContain(g.open.route)
      expect(placeOf(g.open.route) ?? OUTSIDE_SIDEBAR[g.open.route]).toBeTruthy()
      expect(g.open.label).toMatch(/^Open /)
    }
  })

  it('have unique ids and say where they are', () => {
    expect(new Set(GUIDES.map((g) => g.id)).size).toBe(GUIDES.length)
    for (const g of GUIDES) {
      expect(g.where.length).toBeGreaterThan(0)
      expect(g.points.length).toBeGreaterThan(0)
    }
  })

  it('list what is new, newest first', () => {
    expect(WHATS_NEW[0].bundle).toBe('5')
    expect(WHATS_NEW.map((r) => r.bundle)).toEqual([...WHATS_NEW.map((r) => r.bundle)].sort().reverse())
  })
})

describe('the support form’s email', () => {
  const details = ['AETERNA CRM 5.0.0', 'Windows (x64)', 'Licence: Made-Up Accountants Ltd · machine code ABCD-1234']

  it('names the topic, keeps the message and adds who is writing and this copy’s details', () => {
    const e = supportEmail({ topic: 'problem', message: 'Saving a pension\nshows an error.', from: { name: 'Jo Bloggs', firm: 'Made-Up Accountants Ltd' }, details })
    expect(e.subject).toBe(`AETERNA CRM support: ${SUPPORT_TOPICS.problem}`)
    expect(e.body).toBe(
      'Saving a pension\nshows an error.\n\nFrom: Jo Bloggs, Made-Up Accountants Ltd\n\nThis copy:\n  AETERNA CRM 5.0.0\n  Windows (x64)\n  Licence: Made-Up Accountants Ltd · machine code ABCD-1234'
    )
    expect(e.tooLong).toBe(false)
    expect(e.url.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`)).toBe(true)
    // Line breaks travel as CR LF, which every mail app reads.
    expect(e.url).toContain('Saving%20a%20pension%0D%0Ashows%20an%20error.')
    expect(decodeURIComponent(e.url.split('&body=')[1])).toBe(e.body.replace(/\n/g, '\r\n'))
  })

  it('leaves out the details when they aren’t wanted, and anyone unnamed', () => {
    const e = supportEmail({ topic: 'question', message: '  How do I add a pension?  ', details: [] })
    expect(e.body).toBe('How do I add a pension?')
  })

  it('falls back to the clipboard for a message too long for a mail link', () => {
    const e = supportEmail({ topic: 'other', message: 'x'.repeat(3000), details })
    expect(e.tooLong).toBe(true)
    expect(e.url.length).toBeLessThanOrEqual(MAILTO_LIMIT)
    expect(decodeURIComponent(e.url)).toContain('The full message is on the clipboard')
    expect(e.body.startsWith('x'.repeat(3000))).toBe(true)
  })

  it('can’t be made to add a recipient or a header through the message', () => {
    const e = supportEmail({ topic: 'other', message: 'hi&cc=someone@example.com&bcc=x@example.com', details: [] })
    expect(e.url).not.toContain('&cc=')
    expect(e.url).not.toContain('&bcc=')
    expect(e.url.split('&').length).toBe(2)
  })
})
