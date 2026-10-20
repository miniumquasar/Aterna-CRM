/**
 * Sending by SMTP (any mail provider) and by Resend. Microsoft 365 is in
 * microsoft.ts. Each returns the provider's message id when it gives one.
 */
import { createTransport } from 'nodemailer'
import type { FetchLike } from './microsoft'
import type { OutgoingEmail } from './message'

export class SendError extends Error {}

export interface Sender {
  name: string
  address: string
}

export interface SmtpConfig {
  host: string
  port: number
  /** starttls: plain connection upgraded to TLS (usually port 587); tls: TLS from the start (usually 465). */
  security: 'starttls' | 'tls'
  username: string
  password: string
  /** Only for tests: a certificate authority to trust for a local test server. */
  testCa?: string | Buffer
}

/** Why an SMTP send failed, in plain words. */
export function explainSmtpError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; message?: string }
  const msg = String(e?.message ?? '')
  if (e?.code === 'EAUTH' || e?.responseCode === 535) {
    return /basic authentication is disabled|SmtpClientAuthentication/i.test(msg)
      ? 'The mail server no longer accepts a password for SMTP (Microsoft 365 has switched this off). Choose “Microsoft 365” as the email method instead.'
      : 'The mail server didn’t accept the username or password. Many providers (Gmail, iCloud, Yahoo) need an app password here, not the account password.'
  }
  if (e?.code === 'ESOCKET' && /certificate|self[- ]signed|CERT_/i.test(msg)) return 'The mail server’s security certificate isn’t trusted, so nothing was sent.'
  if (e?.code === 'ECONNECTION' || e?.code === 'ETIMEDOUT' || /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|timed? ?out/i.test(msg)) {
    return 'The mail server couldn’t be reached. Check the server name and port, and that this computer is online.'
  }
  if (/STARTTLS|TLS/i.test(msg)) return 'The mail server didn’t offer a secure connection on that port. Try port 465 with “TLS”, or 587 with “STARTTLS”.'
  if (e?.responseCode && e.responseCode >= 500) return `The mail server refused the message: ${msg.replace(/^[A-Z]+:?\s*/, '').slice(0, 200)}`
  return `The email couldn’t be sent: ${msg.slice(0, 200) || 'unknown error'}`
}

export async function sendBySmtp(config: SmtpConfig, from: Sender, replyTo: string | null, email: OutgoingEmail): Promise<{ messageId: string | null }> {
  const transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === 'tls',
    requireTLS: config.security === 'starttls',
    auth: config.username ? { user: config.username, pass: config.password } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    // Never attach a file from a path or a URL, whatever a message says.
    disableFileAccess: true,
    disableUrlAccess: true,
    tls: { minVersion: 'TLSv1.2', ...(config.testCa ? { ca: config.testCa } : {}) }
  })
  try {
    const info = await transporter.sendMail({
      from: { name: from.name, address: from.address },
      to: email.to,
      cc: email.cc.length ? email.cc : undefined,
      replyTo: replyTo ?? undefined,
      subject: email.subject,
      text: email.body
    })
    return { messageId: info.messageId ?? null }
  } catch (err) {
    throw new SendError(explainSmtpError(err))
  } finally {
    transporter.close()
  }
}

export const RESEND_API = 'https://api.resend.com'

export async function sendByResend(fetch: FetchLike, apiKey: string, from: Sender, replyTo: string | null, email: OutgoingEmail, api = RESEND_API): Promise<{ messageId: string | null }> {
  const body = JSON.stringify({
    from: `${from.name.replace(/["<>\r\n]/g, '')} <${from.address}>`,
    to: email.to,
    cc: email.cc.length ? email.cc : undefined,
    reply_to: replyTo ?? undefined,
    subject: email.subject,
    text: email.body
  })
  // The same key on a retry, so Resend never sends twice.
  const idempotency = `aeterna-${Date.now()}-${Math.random().toString(36).slice(2)}`
  for (let attempt = 1; ; attempt++) {
    let res
    try {
      res = await fetch(`${api}/emails`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotency },
        body
      })
    } catch {
      throw new SendError('Resend couldn’t be reached. Check this computer is online.')
    }
    const text = await res.text()
    let reply: { id?: string; message?: string; name?: string } = {}
    try {
      reply = JSON.parse(text)
    } catch {
      /* not JSON */
    }
    if (res.status === 200 || res.status === 201) return { messageId: reply.id ?? null }
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, Math.min(10, Number(res.headers.get('retry-after')) || attempt) * 1000))
      continue
    }
    if (res.status === 401 || res.status === 403) throw new SendError(`Resend refused the API key${reply.message ? `: ${reply.message}` : ''}. Check it in Settings → Email.`)
    throw new SendError(`Resend didn’t send it${reply.message ? `: ${reply.message}` : ` (HTTP ${res.status})`}.`)
  }
}
