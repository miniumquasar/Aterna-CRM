import { createHash } from 'node:crypto'
import { get } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { SMTPServer } from 'smtp-server'
import { checkEmail, MAILTO_LIMIT, mailtoLink, parseAddresses } from '../../src/main/email/message'
import { authorizeUrl, explainSignInError, graphSendMail, signIn, type FetchLike, type FetchResponse } from '../../src/main/email/microsoft'
import { sendByResend, sendBySmtp } from '../../src/main/email/transports'
import { EmailService } from '../../src/main/email/service'
import { FieldCipher } from '../../src/main/services/encryption'
import { selfSignedCertificate } from './test-cert'
import { KEY, practice } from '../backup/helpers'

const TLS = selfSignedCertificate()
const EMAIL = { to: ['client@example.org'], cc: [], subject: 'Your accounts', body: 'Dear client,\n\nYour accounts are ready.\n\nKind regards' }

interface Received {
  from: string
  to: string[]
  raw: string
  user: string | undefined
  secure: boolean
}

/** A local mail server with STARTTLS and a username and password. */
async function mailServer(opts: { offerTls?: boolean } = {}): Promise<{ port: number; received: Received[]; close: () => Promise<void> }> {
  const received: Received[] = []
  const server = new SMTPServer({
    secure: false,
    key: TLS.key,
    cert: TLS.cert,
    disabledCommands: opts.offerTls === false ? ['STARTTLS'] : [],
    authMethods: ['PLAIN', 'LOGIN'],
    onAuth(auth, _session, cb) {
      if (auth.username === 'practice@example.org' && auth.password === 'app-password-1234') cb(null, { user: auth.username })
      else cb(Object.assign(new Error('Invalid username or password'), { responseCode: 535 }))
    },
    onData(stream, session, cb) {
      const chunks: Buffer[] = []
      stream.on('data', (c: Buffer) => chunks.push(c))
      stream.on('end', () => {
        received.push({
          from: String(session.envelope.mailFrom && session.envelope.mailFrom.address),
          to: session.envelope.rcptTo.map((r) => r.address),
          raw: Buffer.concat(chunks).toString('utf8'),
          user: session.user as string | undefined,
          secure: session.secure
        })
        cb()
      })
    },
    logger: false
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const port = (server.server.address() as AddressInfo).port
  return { port, received, close: () => new Promise<void>((r) => server.close(() => r())) }
}

function response(status: number, body: unknown, headers: Record<string, string> = {}): FetchResponse {
  return { status, headers: { get: (n) => headers[n.toLowerCase()] ?? null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }
}

describe('an email as the app sends it', () => {
  it('takes only plain addresses, and no line break into the subject', () => {
    expect(parseAddresses('a@example.org; b@example.org, A@example.org', 'To')).toEqual(['a@example.org', 'b@example.org'])
    expect(() => parseAddresses('Bob <bob@example.org>', 'To')).toThrow(/isn’t an email address/)
    expect(() => parseAddresses('bob@example.org\r\nBcc: spy@example.org', 'To')).toThrow(/line break/)
    expect(() => parseAddresses('bob@localhost', 'To')).toThrow()
    const e = checkEmail({ to: 'x@example.org', cc: 'X@example.org, y@example.org', subject: 'Line one\r\nBcc: spy@example.org', body: 'Hi\r\nthere' })
    expect(e).toEqual({ to: ['x@example.org'], cc: ['y@example.org'], subject: 'Line one Bcc: spy@example.org', body: 'Hi\nthere' })
    expect(() => checkEmail({ to: '', subject: 's', body: 'b' })).toThrow(/who the email is to/)
    expect(() => checkEmail({ to: 'x@example.org', subject: '', body: 'b' })).toThrow(/subject/)
  })

  it('opens in the mail app with a mailto: link, or with a note when it is too long', () => {
    const short = mailtoLink({ to: ['a@example.org'], cc: ['b@example.org'], subject: 'Hello & welcome', body: 'Line 1\nLine 2' })
    expect(short).toEqual({ url: 'mailto:a@example.org?subject=Hello%20%26%20welcome&cc=b@example.org&body=Line%201%0D%0ALine%202', tooLong: false })
    const long = mailtoLink({ to: ['a@example.org'], cc: [], subject: 'Long', body: 'word '.repeat(1000) })
    expect(long.tooLong).toBe(true)
    expect(long.url.length).toBeLessThanOrEqual(MAILTO_LIMIT)
    expect(decodeURIComponent(long.url)).toMatch(/on the clipboard/)
  })
})

describe('sending by SMTP', () => {
  it('sends over STARTTLS with the username and password, as plain text from the practice', async () => {
    const server = await mailServer()
    try {
      const r = await sendBySmtp(
        { host: '127.0.0.1', port: server.port, security: 'starttls', username: 'practice@example.org', password: 'app-password-1234', testCa: TLS.cert },
        { name: 'Made Up Accountants Ltd', address: 'practice@example.org' },
        'replies@example.org',
        EMAIL
      )
      expect(r.messageId).toMatch(/@/)
      expect(server.received).toHaveLength(1)
      const m = server.received[0]
      expect(m).toMatchObject({ from: 'practice@example.org', to: ['client@example.org'], user: 'practice@example.org', secure: true })
      expect(m.raw).toMatch(/^From: Made Up Accountants Ltd <practice@example.org>/m)
      expect(m.raw).toMatch(/^Reply-To: replies@example.org/m)
      expect(m.raw).toMatch(/^Subject: Your accounts/m)
      expect(m.raw).toMatch(/Content-Type: text\/plain/)
      expect(m.raw).toContain('Your accounts are ready.')
    } finally {
      await server.close()
    }
  })

  it('explains a wrong password, and never sends without TLS', async () => {
    const server = await mailServer()
    const noTls = await mailServer({ offerTls: false })
    try {
      await expect(
        sendBySmtp({ host: '127.0.0.1', port: server.port, security: 'starttls', username: 'practice@example.org', password: 'wrong', testCa: TLS.cert }, { name: 'P', address: 'practice@example.org' }, null, EMAIL)
      ).rejects.toThrow(/app password/)
      await expect(
        sendBySmtp({ host: '127.0.0.1', port: noTls.port, security: 'starttls', username: 'practice@example.org', password: 'app-password-1234', testCa: TLS.cert }, { name: 'P', address: 'practice@example.org' }, null, EMAIL)
      ).rejects.toThrow()
      // A certificate the PC doesn't trust: refused.
      await expect(
        sendBySmtp({ host: '127.0.0.1', port: server.port, security: 'starttls', username: 'practice@example.org', password: 'app-password-1234' }, { name: 'P', address: 'practice@example.org' }, null, EMAIL)
      ).rejects.toThrow()
      expect(server.received).toHaveLength(0)
      expect(noTls.received).toHaveLength(0)
    } finally {
      await server.close()
      await noTls.close()
    }
  })
})

describe('sending by Resend', () => {
  it('posts the message with the key, and explains refusals', async () => {
    const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = []
    const ok: FetchLike = async (url, init) => {
      calls.push({ url, init })
      return response(200, { id: 're-123' })
    }
    const r = await sendByResend(ok, 're_test_key_1234', { name: 'Made Up Accountants Ltd', address: 'office@example.org' }, null, EMAIL)
    expect(r.messageId).toBe('re-123')
    expect(calls[0].url).toBe('https://api.resend.com/emails')
    expect(calls[0].init?.headers).toMatchObject({ Authorization: 'Bearer re_test_key_1234' })
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ from: 'Made Up Accountants Ltd <office@example.org>', to: ['client@example.org'], subject: 'Your accounts', text: EMAIL.body })
    await expect(sendByResend(async () => response(401, { message: 'API key is invalid' }), 're_x_12345678', { name: 'P', address: 'o@example.org' }, null, EMAIL)).rejects.toThrow(/refused the API key/)
    await expect(sendByResend(async () => response(422, { message: 'The example.org domain is not verified.' }), 're_x_12345678', { name: 'P', address: 'o@example.org' }, null, EMAIL)).rejects.toThrow(/not verified/)
  })
})

describe('Microsoft 365', () => {
  const TENANT = 'madeup.onmicrosoft.com'
  const CLIENT = '11111111-2222-3333-4444-555555555555'
  const AUTH = 'https://login.example.test'
  const GRAPH = 'https://graph.example.test'

  /** Stands in for Microsoft: the token endpoint and Graph. */
  function microsoft() {
    const state = { challenge: '', refreshes: 0, sent: [] as unknown[], token: 'access-1', refreshValid: true, failNextSend: 0 }
    const fetch: FetchLike = async (url, init) => {
      if (url === `${AUTH}/${TENANT}/oauth2/v2.0/token`) {
        const form = new URLSearchParams(init?.body ?? '')
        expect(form.get('client_id')).toBe(CLIENT)
        if (form.get('grant_type') === 'authorization_code') {
          expect(form.get('code')).toBe('the-code')
          const challenge = createHash('sha256').update(form.get('code_verifier') as string).digest('base64url')
          expect(challenge).toBe(state.challenge)
          return response(200, { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 })
        }
        if (form.get('grant_type') === 'refresh_token') {
          state.refreshes++
          if (!state.refreshValid) return response(400, { error: 'invalid_grant', error_description: 'AADSTS70043: The refresh token has expired.' })
          state.token = `access-${state.refreshes + 1}`
          return response(200, { access_token: state.token, refresh_token: `refresh-${state.refreshes + 1}`, expires_in: 3600 })
        }
      }
      if (url.startsWith(`${GRAPH}/v1.0/me?`)) return response(200, { mail: 'office@madeup.example.org', userPrincipalName: 'office@madeup.onmicrosoft.com' })
      if (url === `${GRAPH}/v1.0/me/sendMail`) {
        if (init?.headers?.Authorization !== `Bearer ${state.token}` || state.failNextSend-- > 0) return response(401, { error: { message: 'expired' } })
        state.sent.push(JSON.parse(init?.body as string))
        return response(202, '')
      }
      return response(404, {})
    }
    // Stands in for the browser: follows the sign-in link straight back to the app.
    const openBrowser = async (link: string, answer: (u: URL) => string = (u) => `code=the-code&state=${u.searchParams.get('state')}`): Promise<void> => {
      const u = new URL(link)
      state.challenge = u.searchParams.get('code_challenge') as string
      expect(u.origin + u.pathname).toBe(`${AUTH}/${TENANT}/oauth2/v2.0/authorize`)
      expect(u.searchParams.get('code_challenge_method')).toBe('S256')
      expect(u.searchParams.get('scope')).toContain('Mail.Send')
      const back = `${u.searchParams.get('redirect_uri')?.replace('localhost', '127.0.0.1')}/?${answer(u)}`
      await new Promise<void>((resolve, reject) => get(back, (res) => { res.resume(); res.on('end', () => resolve()) }).on('error', reject))
    }
    return { state, fetch, openBrowser }
  }

  it('signs in in the browser with PKCE, then sends through Graph', async () => {
    const ms = microsoft()
    const signed = await signIn({ tenant: TENANT, clientId: CLIENT, fetch: ms.fetch, openBrowser: (u) => ms.openBrowser(u), endpoints: { authority: AUTH, graph: GRAPH } })
    expect(signed).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1', account: 'office@madeup.example.org' })
    await graphSendMail(ms.fetch, 'access-1', { ...EMAIL, cc: ['partner@example.org'] }, { authority: AUTH, graph: GRAPH })
    expect(ms.state.sent[0]).toEqual({
      message: { subject: 'Your accounts', body: { contentType: 'Text', content: EMAIL.body }, toRecipients: [{ emailAddress: { address: 'client@example.org' } }], ccRecipients: [{ emailAddress: { address: 'partner@example.org' } }] },
      saveToSentItems: true
    })
  })

  it('says why a sign-in failed, and ignores a reply that isn’t for this sign-in', async () => {
    const ms = microsoft()
    await expect(
      signIn({ tenant: TENANT, clientId: CLIENT, fetch: ms.fetch, endpoints: { authority: AUTH, graph: GRAPH }, openBrowser: (u) => ms.openBrowser(u, (x) => `error=access_denied&error_description=cancelled&state=${x.searchParams.get('state')}`) })
    ).rejects.toThrow(/cancelled/)
    await expect(
      signIn({ tenant: TENANT, clientId: CLIENT, fetch: ms.fetch, endpoints: { authority: AUTH, graph: GRAPH }, timeoutMs: 1500, openBrowser: (u) => ms.openBrowser(u, () => 'code=the-code&state=someone-else') })
    ).rejects.toThrow(/5 minutes/)
    await expect(signIn({ tenant: 'not a tenant', clientId: CLIENT, fetch: ms.fetch, openBrowser: async () => undefined })).rejects.toThrow(/tenant/)
    expect(explainSignInError('invalid_client', 'AADSTS7000218: The request body must contain client_assertion')).toMatch(/Allow public client flows/)
    expect(explainSignInError('invalid_request', 'AADSTS50011: The redirect URI does not match')).toMatch(/http:\/\/localhost/)
    expect(authorizeUrl({ authority: AUTH, graph: GRAPH }, TENANT, CLIENT, 'http://localhost:1234', 'c', 's')).toContain('prompt=select_account')
  })

  it('keeps the sign-in encrypted, refreshes it when it expires, and asks to sign in again when it stops working', async () => {
    const p = practice()
    const ms = microsoft()
    const svc = new EmailService({
      db: () => p.db, secrets: () => FieldCipher.fromDatabaseKey(KEY), fetch: ms.fetch, openExternal: async () => undefined, openBrowser: (u) => ms.openBrowser(u),
      copyToClipboard: () => undefined, firmName: () => 'Made Up Accountants Ltd', microsoft: { authority: AUTH, graph: GRAPH }
    })
    const partner = { id: 1, name: 'Pat Partner', role: 'partner' as const }
    expect(() => svc.saveSettings({ method: 'microsoft365', microsoft365: { tenant: TENANT, clientId: CLIENT } }, partner)).toThrow(/Sign in to Microsoft 365 first/)
    svc.saveSettings({ microsoft365: { tenant: TENANT, clientId: CLIENT } }, partner)
    expect(await svc.microsoftSignIn(partner)).toEqual({ account: 'office@madeup.example.org' })
    svc.saveSettings({ method: 'microsoft365' }, partner)
    const stored = (p.db.prepare("SELECT value FROM app_settings WHERE key = 'm365_refresh_token_enc'").get() as { value: string }).value
    expect(stored).toMatch(/^enc:v1:/)
    expect(stored).not.toContain('refresh-1')

    expect(await svc.send(partner, { clientRef: 'CL0001', to: 'client@example.org', subject: 'Hello', body: 'Hi' })).toMatchObject({ success: true, status: 'sent', via: 'microsoft365' })
    // The access token is rejected: refreshed once, then sent.
    ms.state.failNextSend = 1
    expect(await svc.send(partner, { clientRef: 'CL0001', to: 'client@example.org', subject: 'Again', body: 'Hi' })).toMatchObject({ success: true, status: 'sent' })
    expect(ms.state.refreshes).toBe(1)
    // The refresh token stops working: the send fails, recorded, and the sign-in is dropped.
    ms.state.failNextSend = 1
    ms.state.refreshValid = false
    const failed = await svc.send(partner, { clientRef: 'CL0001', to: 'client@example.org', subject: 'Third', body: 'Hi' })
    expect(failed).toMatchObject({ success: false, status: 'failed' })
    expect(!failed.success && failed.error).toMatch(/sign in again/)
    expect(svc.settings().microsoft365.connected).toBe(false)
    expect(svc.status()).toMatchObject({ method: 'microsoft365', ready: false })
    const log = p.db.prepare("SELECT subject, status, sent_via FROM communication_log WHERE client_ref = 'CL0001' ORDER BY id").all()
    expect(log).toEqual([
      { subject: 'Hello', status: 'sent', sent_via: 'microsoft365' },
      { subject: 'Again', status: 'sent', sent_via: 'microsoft365' },
      { subject: 'Third', status: 'failed', sent_via: 'microsoft365' }
    ])
    svc.microsoftSignOut(partner)
    expect(svc.method()).toBe('mail-app')
  })
})

describe('the email service', () => {
  function service(extra: Partial<ConstructorParameters<typeof EmailService>[0]> = {}) {
    const p = practice()
    p.db.exec("UPDATE clients SET assigned_to = 'Sam Staff' WHERE ref = 'CL0001'")
    const opened: string[] = []
    const clipboard: string[] = []
    const svc = new EmailService({
      db: () => p.db, secrets: () => FieldCipher.fromDatabaseKey(KEY), fetch: async () => response(500, {}),
      openExternal: async (u) => void opened.push(u), openBrowser: async () => undefined, copyToClipboard: (t) => void clipboard.push(t),
      firmName: () => 'Made Up Accountants Ltd', ...extra
    })
    return { p, svc, opened, clipboard }
  }
  const partner = { id: 1, name: 'Pat Partner', role: 'partner' as const }
  const staff = { id: 2, name: 'Sam Staff', role: 'staff' as const }

  it('opens the mail app by default and records it as opened, for the client’s own staff only', async () => {
    const { p, svc, opened, clipboard } = service()
    expect(svc.status()).toEqual({ method: 'mail-app', sendsDirectly: false, from: 'the mail app on this computer', ready: true, problem: null })
    const r = await svc.send(staff, { clientRef: 'CL0001', to: 'client@example.org', subject: 'Documents we need', body: 'Please send your bank statements.', templateKey: 'document_request' })
    expect(r).toEqual({ success: true, status: 'opened', via: 'mail-app', logId: expect.any(Number), onClipboard: false })
    expect(opened[0]).toMatch(/^mailto:client@example.org\?subject=Documents%20we%20need/)
    expect(p.db.prepare('SELECT status, sent_via, recipients, template_key, sent_by, body FROM communication_log').get()).toEqual({
      status: 'opened', sent_via: 'mail-app', recipients: 'client@example.org', template_key: 'document_request', sent_by: 'Sam Staff', body: 'Please send your bank statements.'
    })
    expect(await svc.send(staff, { clientRef: 'CL0002', to: 'other@example.org', subject: 'Hi', body: 'Hi' })).toMatchObject({ success: false })
    await svc.send(partner, { clientRef: 'CL0002', to: 'other@example.org', subject: 'Long one', body: 'A long message. '.repeat(300) })
    expect(clipboard).toHaveLength(1)
  })

  it('sends by SMTP once set up, recording sent or failed with the reason; secrets never come back', async () => {
    const server = await mailServer()
    const { p, svc } = service({ smtpTestCa: TLS.cert })
    try {
      expect(() => svc.saveSettings({ method: 'smtp' }, partner)).toThrow(/SMTP server/)
      svc.saveSettings({ method: 'smtp', smtp: { host: '127.0.0.1', port: server.port, security: 'starttls', username: 'practice@example.org', from: 'practice@example.org', password: 'app-password-1234' } }, partner)
      const s = svc.settings()
      expect(s.smtp).toEqual({ host: '127.0.0.1', port: server.port, security: 'starttls', username: 'practice@example.org', from: 'practice@example.org', hasPassword: true })
      expect(JSON.stringify(s)).not.toContain('app-password-1234')
      expect(JSON.stringify(p.db.prepare('SELECT * FROM app_settings').all())).not.toContain('app-password-1234')
      expect(JSON.stringify(p.db.prepare('SELECT * FROM audit_log').all())).not.toContain('app-password-1234')
      expect(svc.status()).toMatchObject({ sendsDirectly: true, ready: true, from: 'Made Up Accountants Ltd <practice@example.org> via SMTP' })

      const sent = await svc.send(partner, { clientRef: 'CL0001', to: 'client@example.org', cc: 'director@example.org', subject: 'Year end', body: 'Your accounts are ready.' })
      expect(sent).toMatchObject({ success: true, status: 'sent', via: 'smtp' })
      expect(server.received[0].to).toEqual(['client@example.org', 'director@example.org'])
      const row = p.db.prepare('SELECT status, message_id, recipients, error FROM communication_log').get() as { status: string; message_id: string; recipients: string; error: string | null }
      expect(row).toMatchObject({ status: 'sent', recipients: 'client@example.org; cc director@example.org', error: null })
      expect(row.message_id).toMatch(/@/)
      expect(await svc.sendTest(partner, 'pat@example.org')).toEqual({ to: 'pat@example.org', via: 'smtp', status: 'sent' })

      svc.saveSettings({ smtp: { password: 'wrong-password' } }, partner)
      const failed = await svc.send(partner, { clientRef: 'CL0001', to: 'client@example.org', subject: 'Second', body: 'x' })
      expect(failed).toMatchObject({ success: false, status: 'failed', via: 'smtp' })
      expect(p.db.prepare("SELECT status, error FROM communication_log WHERE subject = 'Second'").get()).toMatchObject({ status: 'failed', error: expect.stringMatching(/username or password/) })
      const actions = (p.db.prepare("SELECT action FROM audit_log WHERE table_name = 'communication_log' ORDER BY id").all() as Array<{ action: string }>).map((a) => a.action)
      expect(actions).toEqual(['Sending a message', 'Message sent', 'Sending a message', 'Message not sent'])
      expect((p.db.prepare("SELECT new_value FROM audit_log WHERE action = 'Changed the email settings' ORDER BY id DESC").get() as { new_value: string }).new_value).toContain('secrets_replaced')
    } finally {
      await server.close()
    }
  })
})
