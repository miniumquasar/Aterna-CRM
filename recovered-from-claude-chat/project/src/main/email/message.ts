/**
 * An email as the app sends it: checked addresses, a single-line subject, a
 * plain-text body — and, for the mail app, the mailto: link that opens it.
 *
 * Nothing a screen sends goes into a message unchecked: addresses must be
 * plain addresses (no names, no line breaks, no lists hidden in one field),
 * and line breaks are taken out of the subject, so no header can be added.
 */
export class EmailError extends Error {}

export const MAX_SUBJECT = 300
export const MAX_BODY = 100_000
export const MAX_RECIPIENTS = 25
/** Longest mailto: link handed to the mail app; Outlook and others cut longer ones short. */
export const MAILTO_LIMIT = 1800

const LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?'
const ADDRESS = new RegExp(`^[A-Za-z0-9.!#$%&'*+/=?^_\`{|}~-]{1,64}@(?:${LABEL}\\.)+[A-Za-z]{2,63}$`)

export interface OutgoingEmail {
  to: string[]
  cc: string[]
  subject: string
  body: string
}

export const isEmailAddress = (s: string): boolean => s.length <= 254 && ADDRESS.test(s) && !s.includes('..') && !s.startsWith('.') && !s.split('@')[0].endsWith('.')

/** One address or several (separated by commas or semicolons), each checked; duplicates dropped. */
export function parseAddresses(value: unknown, label: string): string[] {
  const raw = Array.isArray(value) ? value.map(String) : value === undefined || value === null ? [] : [String(value)]
  if (raw.some((r) => /[\r\n]/.test(r))) throw new EmailError(`${label} can’t contain a line break.`)
  const parts = raw.flatMap((r) => r.split(/[,;]/)).map((p) => p.trim()).filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    if (!isEmailAddress(p)) throw new EmailError(`${label}: “${p.slice(0, 80)}” isn’t an email address.`)
    const k = p.toLowerCase()
    if (!seen.has(k)) {
      seen.add(k)
      out.push(p)
    }
  }
  return out
}

export function checkEmail(input: unknown): OutgoingEmail {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const to = parseAddresses(i.to, 'To')
  const cc = parseAddresses(i.cc, 'Cc').filter((a) => !to.some((t) => t.toLowerCase() === a.toLowerCase()))
  if (to.length === 0) throw new EmailError('Say who the email is to.')
  if (to.length + cc.length > MAX_RECIPIENTS) throw new EmailError(`An email can go to at most ${MAX_RECIPIENTS} people from here.`)
  const subject = String(i.subject ?? '').replace(/[\r\n\t]+/g, ' ').trim()
  if (!subject) throw new EmailError('Give the email a subject.')
  if (subject.length > MAX_SUBJECT) throw new EmailError(`The subject is too long (at most ${MAX_SUBJECT} characters).`)
  const body = String(i.body ?? '').replace(/\r\n?/g, '\n')
  if (!body.trim()) throw new EmailError('The email has no message.')
  if (body.length > MAX_BODY) throw new EmailError('The message is too long to send from here.')
  return { to, cc, subject, body }
}

const encodeAddress = (a: string): string => encodeURIComponent(a).replace(/%40/g, '@')
const encodeText = (t: string): string => encodeURIComponent(t.replace(/\n/g, '\r\n'))

/**
 * The mailto: link for the mail app. A message too long for one is opened with
 * a short note instead, and the caller puts the whole message on the clipboard.
 */
export function mailtoLink(email: OutgoingEmail): { url: string; tooLong: boolean } {
  const build = (body: string): string => {
    const params = [`subject=${encodeText(email.subject)}`]
    if (email.cc.length) params.push(`cc=${email.cc.map(encodeAddress).join(',')}`)
    params.push(`body=${encodeText(body)}`)
    return `mailto:${email.to.map(encodeAddress).join(',')}?${params.join('&')}`
  }
  const full = build(email.body)
  if (full.length <= MAILTO_LIMIT) return { url: full, tooLong: false }
  return { url: build('The message is on the clipboard: paste it here (Ctrl+V, or Cmd+V on a Mac), replacing this line.'), tooLong: true }
}

/** The first part of a message, for lists. */
export const preview = (body: string): string => body.replace(/\s+/g, ' ').trim().slice(0, 500)
