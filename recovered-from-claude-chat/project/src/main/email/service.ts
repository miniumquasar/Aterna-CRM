/**
 * Email for the practice.
 *
 *   mail-app      the default: the message opens in the PC's own mail app
 *                 (Outlook, Apple Mail, Thunderbird…), ready to check and send
 *                 from there. The app can't know whether it was sent, so the
 *                 log says "opened in the mail app".
 *   smtp          sent from the app through the practice's mail server
 *   microsoft365  sent from the app through Microsoft 365 (Graph), signed in once
 *   resend        sent from the app through Resend
 *
 * The three sending methods are off until a partner or manager sets one up
 * and chooses it in Settings → Email. Passwords, API keys and the Microsoft
 * 365 sign-in are kept encrypted with the practice key and never shown again.
 *
 * Every email to a client goes in the client's message log — before sending
 * as "being sent", then "sent" (with the service's message id) or "failed"
 * (with why) — and in the audit log. Staff send to their own clients only.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { EmailMethod, EmailSendResult, EmailSettings, EmailStatus } from '../../shared/types'
import { auditChanges, writeAudit, type Row } from '../access/audit'
import { clientForActor, refArg, UserFacingError, type Actor } from '../access/policy'
import { recordMessage, settleMessage } from '../records/communications'
import { checkEmail, EmailError, isEmailAddress, mailtoLink, preview, type OutgoingEmail } from './message'
import { graphSendMail, MICROSOFT, MicrosoftError, refreshTokens, signIn, validClientId, validTenant, type FetchLike, type MicrosoftEndpoints } from './microsoft'
import { RESEND_API, sendByResend, sendBySmtp, SendError, type Sender } from './transports'

export { EmailError }

export interface Secrets {
  encrypt(value: string, context: string): string
  decrypt(stored: string, context: string): string
}

export interface EmailDeps {
  db: () => Database
  /** The practice-key cipher, or null when the database isn't open with its key. */
  secrets: () => Secrets | null
  fetch: FetchLike
  /** Opens a mailto: link in the PC's mail app. */
  openExternal: (url: string) => Promise<void>
  /** Opens a web page in the PC's browser (the Microsoft 365 sign-in). */
  openBrowser: (url: string) => Promise<void>
  copyToClipboard: (text: string) => void
  firmName: () => string
  microsoft?: MicrosoftEndpoints
  resendApi?: string
  /** Tests only: trust a local test mail server's certificate. */
  smtpTestCa?: string | Buffer
  now?: () => Date
}

export const METHODS: readonly EmailMethod[] = ['mail-app', 'smtp', 'microsoft365', 'resend']
const METHOD_NAMES: Record<EmailMethod, string> = { 'mail-app': 'the mail app', smtp: 'SMTP', microsoft365: 'Microsoft 365', resend: 'Resend' }

const K = {
  method: 'email_method',
  fromName: 'email_from_name',
  replyTo: 'email_reply_to',
  smtpHost: 'smtp_host',
  smtpPort: 'smtp_port',
  smtpSecurity: 'smtp_security',
  smtpUser: 'smtp_username',
  smtpFrom: 'smtp_from',
  smtpPassword: 'smtp_password_enc',
  m365Tenant: 'm365_tenant',
  m365Client: 'm365_client_id',
  m365Account: 'm365_account',
  m365Refresh: 'm365_refresh_token_enc',
  resendFrom: 'resend_from_email',
  resendKey: 'resend_api_key_enc'
} as const

const HOST = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$|^\d{1,3}(?:\.\d{1,3}){3}$/

type Who = Pick<Actor, 'id' | 'name'> | null

export class EmailService {
  private access: { token: string; expiresAt: number } | null = null

  constructor(private readonly deps: EmailDeps) {}

  private get db(): Database {
    return this.deps.db()
  }

  private get(key: string): string | null {
    return (this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null
  }

  private set(key: string, value: string | null): void {
    if (value === null || value === '') this.db.prepare('DELETE FROM app_settings WHERE key = ?').run(key)
    else this.db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value)
  }

  private secret(key: string): string | null {
    const stored = this.get(key)
    const secrets = this.deps.secrets()
    if (!stored || !secrets) return null
    try {
      return secrets.decrypt(stored, `app_settings:${key}`)
    } catch {
      return null
    }
  }

  private setSecret(key: string, value: string | null): void {
    if (!value) return this.set(key, null)
    const secrets = this.deps.secrets()
    if (!secrets) throw new EmailError('Passwords and keys can’t be saved while the practice database isn’t open with its key.')
    this.set(key, secrets.encrypt(value, `app_settings:${key}`))
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  method(): EmailMethod {
    const m = this.get(K.method) as EmailMethod | null
    return m && METHODS.includes(m) ? m : 'mail-app'
  }

  settings(): EmailSettings {
    const port = Number(this.get(K.smtpPort))
    return {
      method: this.method(),
      fromName: this.get(K.fromName) || this.deps.firmName(),
      replyTo: this.get(K.replyTo),
      smtp: {
        host: this.get(K.smtpHost) ?? '',
        port: Number.isInteger(port) && port > 0 ? port : 587,
        security: this.get(K.smtpSecurity) === 'tls' ? 'tls' : 'starttls',
        username: this.get(K.smtpUser) ?? '',
        from: this.get(K.smtpFrom) ?? '',
        hasPassword: !!this.get(K.smtpPassword)
      },
      microsoft365: {
        tenant: this.get(K.m365Tenant) ?? '',
        clientId: this.get(K.m365Client) ?? '',
        account: this.get(K.m365Account),
        connected: !!this.get(K.m365Refresh)
      },
      resend: { from: this.get(K.resendFrom) ?? '', hasKey: !!this.get(K.resendKey) }
    }
  }

  /** What stops a method from sending, or null when it's ready. */
  problemWith(method: EmailMethod, s: EmailSettings = this.settings()): string | null {
    switch (method) {
      case 'mail-app':
        return null
      case 'smtp':
        if (!s.smtp.host) return 'Enter the SMTP server’s name.'
        if (!s.smtp.from) return 'Enter the address emails come from.'
        if (s.smtp.username && !s.smtp.hasPassword) return 'Enter the SMTP password.'
        return null
      case 'microsoft365':
        if (!s.microsoft365.tenant || !s.microsoft365.clientId) return 'Enter the tenant ID and application (client) ID, then sign in to Microsoft 365.'
        if (!s.microsoft365.connected) return 'Sign in to Microsoft 365 first.'
        return null
      case 'resend':
        if (!s.resend.hasKey) return 'Enter the Resend API key.'
        if (!s.resend.from) return 'Enter the address emails come from (on a domain verified in Resend).'
        return null
    }
  }

  saveSettings(input: unknown, actor: Who): EmailSettings {
    const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
    const text = (v: unknown, label: string, max: number): string => {
      const t = String(v ?? '').trim()
      if (/[\r\n]/.test(t)) throw new EmailError(`${label} can’t contain a line break.`)
      if (t.length > max) throw new EmailError(`${label} is too long.`)
      return t
    }
    const address = (v: unknown, label: string): string => {
      const t = text(v, label, 254)
      if (t && !isEmailAddress(t)) throw new EmailError(`${label}: “${t.slice(0, 80)}” isn’t an email address.`)
      return t
    }
    const before = this.settings()
    const secretsChanged: string[] = []
    this.db.transaction(() => {
      if (i.method !== undefined) {
        if (!METHODS.includes(i.method as EmailMethod)) throw new EmailError('Unknown way of sending email.')
        this.set(K.method, i.method as string)
      }
      if (i.fromName !== undefined) {
        const name = text(i.fromName, 'The name emails come from', 100)
        if (/[<>"]/.test(name)) throw new EmailError('The name emails come from can’t contain < > or ".')
        this.set(K.fromName, name || null)
      }
      if (i.replyTo !== undefined) this.set(K.replyTo, address(i.replyTo, 'Replies go to') || null)
      const smtp = (i.smtp && typeof i.smtp === 'object' ? i.smtp : null) as Record<string, unknown> | null
      if (smtp) {
        if (smtp.host !== undefined) {
          const host = text(smtp.host, 'The SMTP server', 253)
          if (host && !HOST.test(host)) throw new EmailError('The SMTP server should be a name like smtp.example.com.')
          this.set(K.smtpHost, host || null)
        }
        if (smtp.port !== undefined) {
          const port = Number(smtp.port)
          if (!Number.isInteger(port) || port < 1 || port > 65535) throw new EmailError('The SMTP port is a number, usually 587 or 465.')
          this.set(K.smtpPort, String(port))
        }
        if (smtp.security !== undefined) {
          if (smtp.security !== 'starttls' && smtp.security !== 'tls') throw new EmailError('Choose STARTTLS or TLS.')
          this.set(K.smtpSecurity, smtp.security)
        }
        if (smtp.username !== undefined) this.set(K.smtpUser, text(smtp.username, 'The SMTP username', 254) || null)
        if (smtp.from !== undefined) this.set(K.smtpFrom, address(smtp.from, 'Emails come from') || null)
        if (typeof smtp.password === 'string' && smtp.password) {
          this.setSecret(K.smtpPassword, text(smtp.password, 'The SMTP password', 500))
          secretsChanged.push('smtp_password')
        }
      }
      const ms = (i.microsoft365 && typeof i.microsoft365 === 'object' ? i.microsoft365 : null) as Record<string, unknown> | null
      if (ms) {
        const tenant = ms.tenant !== undefined ? text(ms.tenant, 'The tenant', 253) : before.microsoft365.tenant
        const clientId = ms.clientId !== undefined ? text(ms.clientId, 'The application (client) ID', 36) : before.microsoft365.clientId
        if (tenant && !validTenant(tenant)) throw new EmailError('The tenant is its ID (a long code) or the organisation’s domain, like practice.onmicrosoft.com.')
        if (clientId && !validClientId(clientId)) throw new EmailError('The application (client) ID is a long code like 1a2b3c4d-….')
        if (tenant !== before.microsoft365.tenant || clientId !== before.microsoft365.clientId) {
          // A different organisation or app: the old sign-in no longer applies.
          this.set(K.m365Refresh, null)
          this.set(K.m365Account, null)
          this.access = null
        }
        this.set(K.m365Tenant, tenant || null)
        this.set(K.m365Client, clientId || null)
      }
      const rs = (i.resend && typeof i.resend === 'object' ? i.resend : null) as Record<string, unknown> | null
      if (rs) {
        if (rs.from !== undefined) this.set(K.resendFrom, address(rs.from, 'Emails come from') || null)
        if (typeof rs.apiKey === 'string' && rs.apiKey) {
          const key = text(rs.apiKey, 'The Resend API key', 200)
          if (!/^re_[A-Za-z0-9_]{8,}$/.test(key)) throw new EmailError('A Resend API key starts with re_.')
          this.setSecret(K.resendKey, key)
          secretsChanged.push('resend_api_key')
        }
      }
      const after = this.settings()
      const problem = this.problemWith(after.method, after)
      if (problem) throw new EmailError(`${METHOD_NAMES[after.method]} isn’t ready, so it can’t be chosen yet: ${problem}`)
      const diff = auditChanges('app_settings', flatten(before), flatten(after), [])
      if (diff || secretsChanged.length) {
        writeAudit(this.db, actor, 'Changed the email settings', 'app_settings', 'email', diff?.before ?? null, { ...(diff?.after ?? {}), ...(secretsChanged.length ? { secrets_replaced: secretsChanged } : {}) })
      }
    })()
    return this.settings()
  }

  status(): EmailStatus {
    const s = this.settings()
    const problem = this.problemWith(s.method, s)
    const from =
      s.method === 'mail-app'
        ? 'the mail app on this computer'
        : s.method === 'microsoft365'
          ? `${s.microsoft365.account ?? 'Microsoft 365'} via Microsoft 365`
          : `${s.fromName} <${s.method === 'smtp' ? s.smtp.from : s.resend.from}> via ${METHOD_NAMES[s.method]}`
    return { method: s.method, sendsDirectly: s.method !== 'mail-app', from, ready: !problem, problem }
  }

  // ── Microsoft 365 sign-in ──────────────────────────────────────────────────

  async microsoftSignIn(actor: Who): Promise<{ account: string }> {
    const s = this.settings().microsoft365
    if (!s.tenant || !s.clientId) throw new EmailError('Enter and save the tenant ID and the application (client) ID first.')
    if (!this.deps.secrets()) throw new EmailError('The sign-in can’t be kept while the practice database isn’t open with its key.')
    let signed
    try {
      signed = await signIn({ tenant: s.tenant, clientId: s.clientId, fetch: this.deps.fetch, openBrowser: this.deps.openBrowser, endpoints: this.deps.microsoft ?? MICROSOFT })
    } catch (err) {
      if (err instanceof MicrosoftError) throw new EmailError(err.message)
      throw err
    }
    this.db.transaction(() => {
      this.setSecret(K.m365Refresh, signed.refreshToken)
      this.set(K.m365Account, signed.account)
      writeAudit(this.db, actor, 'Signed in to Microsoft 365 for email', 'app_settings', 'email', null, { account: signed.account })
    })()
    this.access = { token: signed.accessToken, expiresAt: signed.expiresAt }
    return { account: signed.account }
  }

  microsoftSignOut(actor: Who): void {
    const account = this.get(K.m365Account)
    this.db.transaction(() => {
      this.set(K.m365Refresh, null)
      this.set(K.m365Account, null)
      if (this.method() === 'microsoft365') this.set(K.method, 'mail-app')
      writeAudit(this.db, actor, 'Signed out of Microsoft 365 for email', 'app_settings', 'email', { account }, null)
    })()
    this.access = null
  }

  private async microsoftToken(force = false): Promise<string> {
    if (!force && this.access && this.access.expiresAt > Date.now()) return this.access.token
    const s = this.settings().microsoft365
    const refresh = this.secret(K.m365Refresh)
    if (!refresh) throw new SendError('Sign in to Microsoft 365 again (Settings → Email).')
    let t
    try {
      t = await refreshTokens({ tenant: s.tenant, clientId: s.clientId, refreshToken: refresh, fetch: this.deps.fetch, endpoints: this.deps.microsoft ?? MICROSOFT })
    } catch (err) {
      if (err instanceof MicrosoftError && err.kind === 'sign-in-again') {
        this.set(K.m365Refresh, null)
        throw new SendError('Microsoft 365 needs you to sign in again (Settings → Email). Nothing was sent.')
      }
      throw new SendError(err instanceof Error ? err.message : 'Microsoft 365 couldn’t be reached.')
    }
    if (t.refreshToken !== refresh) this.setSecret(K.m365Refresh, t.refreshToken)
    this.access = { token: t.accessToken, expiresAt: t.expiresAt }
    return t.accessToken
  }

  // ── Sending ────────────────────────────────────────────────────────────────

  private sender(s: EmailSettings): Sender {
    return { name: s.fromName, address: s.method === 'resend' ? s.resend.from : s.smtp.from }
  }

  /** Sends by the chosen method (not the mail app). Returns the service's message id. */
  private async transmit(method: Exclude<EmailMethod, 'mail-app'>, email: OutgoingEmail): Promise<string | null> {
    const s = this.settings()
    const problem = this.problemWith(method, s)
    if (problem) throw new SendError(`Email isn’t set up: ${problem}`)
    try {
      if (method === 'smtp') {
        const password = s.smtp.username ? this.secret(K.smtpPassword) : ''
        if (s.smtp.username && !password) throw new SendError('The SMTP password can’t be read. Enter it again in Settings → Email.')
        return (await sendBySmtp({ host: s.smtp.host, port: s.smtp.port, security: s.smtp.security, username: s.smtp.username, password: password ?? '', testCa: this.deps.smtpTestCa }, this.sender(s), s.replyTo, email)).messageId
      }
      if (method === 'resend') {
        const key = this.secret(K.resendKey)
        if (!key) throw new SendError('The Resend API key can’t be read. Enter it again in Settings → Email.')
        return (await sendByResend(this.deps.fetch, key, this.sender(s), s.replyTo, email, this.deps.resendApi ?? RESEND_API)).messageId
      }
      const send = async (force: boolean): Promise<void> => graphSendMail(this.deps.fetch, await this.microsoftToken(force), email, this.deps.microsoft ?? MICROSOFT)
      try {
        await send(false)
      } catch (err) {
        if (!(err instanceof MicrosoftError && err.kind === 'sign-in-again')) throw err
        await send(true)
      }
      return null
    } catch (err) {
      if (err instanceof SendError) throw err
      if (err instanceof MicrosoftError) throw new SendError(err.message)
      throw new SendError(`The email couldn’t be sent: ${(err as Error).message}`)
    }
  }

  /** Sends one email (or opens it in the mail app), recording it in the client's log. Never throws for a send that fails. */
  async send(actor: Actor, input: unknown): Promise<EmailSendResult> {
    let email: OutgoingEmail
    let client: { ref: string; client_name: string } | null = null
    const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
    try {
      email = checkEmail(i)
      if (i.clientRef) client = clientForActor(this.db, refArg(i.clientRef), actor)
    } catch (err) {
      if (err instanceof EmailError || err instanceof UserFacingError) return { success: false, error: err.message }
      throw err
    }
    const templateKey = typeof i.templateKey === 'string' && i.templateKey ? i.templateKey.slice(0, 80) : null
    const recipients = [email.to.join(', '), email.cc.length ? `cc ${email.cc.join(', ')}` : ''].filter(Boolean).join('; ')
    const method = this.method()
    const log = (status: 'pending' | 'opened', via: EmailMethod): number | null =>
      client
        ? recordMessage(this.db, actor, {
            client_ref: client.ref, channel: 'email', template_key: templateKey, subject: email.subject, body: email.body,
            body_preview: preview(email.body), status, recipients, sent_via: via
          }).id
        : null

    if (method === 'mail-app') {
      const { url, tooLong } = mailtoLink(email)
      if (tooLong) this.deps.copyToClipboard(email.body)
      try {
        await this.deps.openExternal(url)
      } catch {
        return { success: false, error: 'The mail app couldn’t be opened. Check this computer has a default mail app (in Windows: Settings → Apps → Default apps).' }
      }
      const logId = log('opened', 'mail-app')
      if (!client) writeAudit(this.db, actor, 'Opened an email in the mail app', null, null, null, { to: email.to, cc: email.cc, subject: email.subject })
      return { success: true, status: 'opened', via: 'mail-app', logId, onClipboard: tooLong }
    }

    const logId = log('pending', method)
    try {
      const messageId = await this.transmit(method, email)
      if (logId !== null) settleMessage(this.db, actor, logId, { status: 'sent', messageId })
      else writeAudit(this.db, actor, 'Sent an email', null, null, null, { to: email.to, cc: email.cc, subject: email.subject, via: method, message_id: messageId })
      return { success: true, status: 'sent', via: method, logId, onClipboard: false }
    } catch (err) {
      const why = err instanceof Error ? err.message : 'The email couldn’t be sent.'
      if (logId !== null) settleMessage(this.db, actor, logId, { status: 'failed', error: why })
      else writeAudit(this.db, actor, 'Email not sent', null, null, null, { to: email.to, subject: email.subject, via: method, error: why })
      return { success: false, error: why, status: 'failed', via: method, logId }
    }
  }

  /** A test email to `to`, by the chosen method. */
  async sendTest(actor: Who, to: unknown): Promise<{ to: string; via: EmailMethod; status: 'sent' | 'opened' }> {
    const method = this.method()
    const when = (this.deps.now ?? (() => new Date()))().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })
    const email = checkEmail({
      to,
      subject: 'AETERNA CRM test email',
      body: `This is a test email from AETERNA CRM, sent ${when} by ${actor?.name ?? 'the practice'} using ${METHOD_NAMES[method]}.\n\nIf it arrived, emails to clients will reach them the same way.`
    })
    if (method === 'mail-app') {
      await this.deps.openExternal(mailtoLink(email).url)
      writeAudit(this.db, actor, 'Opened a test email in the mail app', 'app_settings', 'email', null, { to: email.to })
      return { to: email.to[0], via: method, status: 'opened' }
    }
    try {
      await this.transmit(method, email)
    } catch (err) {
      writeAudit(this.db, actor, 'Test email not sent', 'app_settings', 'email', null, { to: email.to, via: method, error: (err as Error).message })
      throw new EmailError((err as Error).message)
    }
    writeAudit(this.db, actor, 'Sent a test email', 'app_settings', 'email', null, { to: email.to, via: method })
    return { to: email.to[0], via: method, status: 'sent' }
  }
}

/** The non-secret settings as one flat row, for the audit log. */
function flatten(s: EmailSettings): Row {
  return {
    method: s.method, from_name: s.fromName, reply_to: s.replyTo,
    smtp_host: s.smtp.host, smtp_port: s.smtp.port, smtp_security: s.smtp.security, smtp_username: s.smtp.username, smtp_from: s.smtp.from,
    m365_tenant: s.microsoft365.tenant, m365_client_id: s.microsoft365.clientId, m365_account: s.microsoft365.account,
    resend_from: s.resend.from
  }
}
