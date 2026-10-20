/**
 * The support form: it writes an email for the PC's mail app — nothing is sent
 * from the app itself — with this copy's details when the user wants them.
 */
export const SUPPORT_EMAIL = 'info@bitopi.co.uk'
export const SUPPORT_PHONE = '07555 221010'

/** Longest mailto: link handed to the mail app; Outlook and others cut longer ones short (as for client emails). */
export const MAILTO_LIMIT = 1800

export const SUPPORT_TOPICS = {
  problem: 'Something isn’t working',
  question: 'How do I…?',
  licence: 'The licence or renewal',
  other: 'Something else'
} as const
export type SupportTopic = keyof typeof SUPPORT_TOPICS

export interface SupportRequest {
  topic: SupportTopic
  message: string
  /** Who is writing and for which firm, when known. */
  from?: { name?: string | null; firm?: string | null }
  /** This copy's details, one per line ("Version 5.0.0"…); empty when the user leaves them out. */
  details: readonly string[]
}

export interface SupportEmail {
  subject: string
  /** The whole message, as it should arrive. */
  body: string
  /** The mailto: link to open. When the message is too long for one, it carries a note to paste the message from the clipboard. */
  url: string
  tooLong: boolean
}

const enc = (s: string): string => encodeURIComponent(s).replace(/%0A/g, '%0D%0A')

const mailto = (subject: string, body: string): string => `mailto:${SUPPORT_EMAIL}?subject=${enc(subject)}&body=${enc(body)}`

export function supportEmail(req: SupportRequest): SupportEmail {
  const subject = `AETERNA CRM support: ${SUPPORT_TOPICS[req.topic]}`
  const who = [req.from?.name?.trim(), req.from?.firm?.trim()].filter(Boolean).join(', ')
  const parts = [req.message.trim().replace(/\r\n?/g, '\n')]
  if (who) parts.push(`From: ${who}`)
  if (req.details.length) parts.push(['This copy:', ...req.details.map((d) => `  ${d}`)].join('\n'))
  const body = parts.join('\n\n')
  const url = mailto(subject, body)
  if (url.length <= MAILTO_LIMIT) return { subject, body, url, tooLong: false }
  const note = 'The full message is on the clipboard: paste it here (Ctrl V, or ⌘V on a Mac) in place of this line.'
  return { subject, body, url: mailto(subject, note), tooLong: true }
}
