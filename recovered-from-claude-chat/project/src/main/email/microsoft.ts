/**
 * Microsoft 365: signing in, and sending through Microsoft Graph.
 *
 * Exchange Online is retiring password sign-in for SMTP, so Microsoft 365
 * mail goes through Graph (POST /me/sendMail) with OAuth 2.0 instead:
 *
 *   app       the practice registers AETERNA CRM once in its own Microsoft Entra
 *             admin centre, as a public client (no secret) with the redirect URI
 *             http://localhost, and the delegated permissions Mail.Send and
 *             User.Read. Its tenant ID and application (client) ID go in
 *             Settings → Email.
 *   sign-in   authorisation code with PKCE in the PC's own browser, so
 *             multi-factor sign-in and the organisation's access rules apply.
 *             A one-off web server on 127.0.0.1 receives the reply, only on
 *             "/", only with the state this sign-in sent, then stops.
 *   tokens    the refresh token is kept encrypted with the practice key; the
 *             access token only in memory. A refresh token that stops working
 *             (password changed, access withdrawn, unused for 90 days) means
 *             signing in again.
 *
 * Nothing here talks to Microsoft except through the `fetch` given, so the
 * whole flow is tested against a stand-in.
 */
import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { OutgoingEmail } from './message'

export interface FetchResponse {
  status: number
  headers: { get(name: string): string | null }
  text(): Promise<string>
}
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<FetchResponse>

export interface MicrosoftEndpoints {
  /** https://login.microsoftonline.com */
  authority: string
  /** https://graph.microsoft.com */
  graph: string
}
export const MICROSOFT: MicrosoftEndpoints = { authority: 'https://login.microsoftonline.com', graph: 'https://graph.microsoft.com' }
export const SCOPES = 'offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send'

export class MicrosoftError extends Error {
  constructor(message: string, readonly kind: 'sign-in-again' | 'not-allowed' | 'busy' | 'other' = 'other') {
    super(message)
  }
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DOMAIN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

/** A tenant: its ID, or its domain (practice.onmicrosoft.com, or the practice's own domain). */
export const validTenant = (t: string): boolean => GUID.test(t) || DOMAIN.test(t)
export const validClientId = (c: string): boolean => GUID.test(c)

const b64url = (b: Buffer): string => b.toString('base64url')

export function pkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32))
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) }
}

export function authorizeUrl(e: MicrosoftEndpoints, tenant: string, clientId: string, redirectUri: string, challenge: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  })
  return `${e.authority}/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${q.toString()}`
}

/** Plain words for the errors people actually meet when setting this up. */
export function explainSignInError(code: string, description: string): string {
  const d = `${code} ${description}`
  if (/AADSTS700016/.test(d)) return 'That application (client) ID isn’t registered in this Microsoft 365 organisation. Check both IDs in Settings → Email.'
  if (/AADSTS50011|redirect/i.test(d)) return 'The app registration needs the redirect URI http://localhost, under “Mobile and desktop applications”.'
  if (/AADSTS7000218|client_assertion|client_secret/.test(d)) return 'In the app registration, under Authentication, turn on “Allow public client flows”.'
  if (/AADSTS65001|consent/i.test(d)) return 'An administrator needs to grant consent for Mail.Send and User.Read to this app in the Microsoft Entra admin centre.'
  if (/AADSTS90002|AADSTS900023|tenant/i.test(d)) return 'That tenant wasn’t found. Use the tenant ID (a long code) or the organisation’s domain.'
  if (/AADSTS50076|AADSTS50079/.test(d)) return 'Multi-factor sign-in is required. Sign in again and complete it in the browser.'
  if (/AADSTS53003/.test(d)) return 'The organisation’s access rules blocked this sign-in. Ask your Microsoft 365 administrator.'
  if (code === 'access_denied') return 'The sign-in was cancelled, or permission wasn’t given.'
  if (code === 'invalid_grant') return 'Microsoft 365 needs you to sign in again (Settings → Email).'
  const first = description.split(/\r?\n/)[0].replace(/^AADSTS\d+:\s*/, '').trim()
  return first ? `Microsoft 365 said: ${first}` : `Microsoft 365 refused the sign-in (${code || 'unknown error'}).`
}

interface TokenReply {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

async function tokenRequest(fetch: FetchLike, e: MicrosoftEndpoints, tenant: string, form: Record<string, string>): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: number }> {
  const res = await fetch(`${e.authority}/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString()
  })
  let reply: TokenReply = {}
  try {
    reply = JSON.parse(await res.text()) as TokenReply
  } catch {
    /* not JSON */
  }
  if (res.status !== 200 || !reply.access_token) {
    const code = reply.error ?? `http_${res.status}`
    throw new MicrosoftError(explainSignInError(code, reply.error_description ?? ''), code === 'invalid_grant' ? 'sign-in-again' : 'other')
  }
  return { accessToken: reply.access_token, refreshToken: reply.refresh_token ?? null, expiresAt: Date.now() + Math.max(60, (reply.expires_in ?? 3600) - 120) * 1000 }
}

/** Who is signed in: their address. */
export async function whoAmI(fetch: FetchLike, accessToken: string, e: MicrosoftEndpoints = MICROSOFT): Promise<string> {
  const res = await fetch(`${e.graph}/v1.0/me?$select=mail,userPrincipalName`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (res.status !== 200) throw new MicrosoftError(`Signed in, but the account couldn’t be read (HTTP ${res.status}). Check the app has the User.Read permission.`)
  const me = JSON.parse(await res.text()) as { mail?: string | null; userPrincipalName?: string }
  return me.mail || me.userPrincipalName || 'the signed-in account'
}

const PAGE = (title: string, text: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font:16px system-ui,sans-serif;margin:15vh auto;max-width:32rem;color:#111}</style></head><body><h1>${title}</h1><p>${text}</p></body></html>`

export interface SignedIn {
  accessToken: string
  refreshToken: string
  expiresAt: number
  account: string
}

/**
 * The browser sign-in. Resolves once Microsoft sends the person back and the
 * code has been exchanged; rejects after `timeoutMs` (5 minutes).
 */
export async function signIn(opts: {
  tenant: string
  clientId: string
  fetch: FetchLike
  openBrowser: (url: string) => Promise<void>
  endpoints?: MicrosoftEndpoints
  timeoutMs?: number
}): Promise<SignedIn> {
  const e = opts.endpoints ?? MICROSOFT
  if (!validTenant(opts.tenant)) throw new MicrosoftError('Enter the tenant ID (a long code) or the organisation’s domain.')
  if (!validClientId(opts.clientId)) throw new MicrosoftError('Enter the application (client) ID from the app registration (a long code).')
  const { verifier, challenge } = pkce()
  const state = b64url(randomBytes(16))
  const servers: Server[] = []
  let settle: { resolve: (code: string) => void; reject: (err: Error) => void } | null = null
  const waiting = new Promise<string>((resolve, reject) => (settle = { resolve, reject }))
  // The reply can come before anything awaits it (a fast browser): never an unhandled rejection.
  waiting.catch(() => undefined)
  const handler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (req.method !== 'GET' || url.pathname !== '/') {
      res.writeHead(404).end()
      return
    }
    const q = url.searchParams
    if (q.get('state') !== state) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(PAGE('This sign-in doesn’t match', 'Start the sign-in again from AETERNA CRM.'))
      return
    }
    if (q.get('error')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(PAGE('Not signed in', 'Go back to AETERNA CRM to see why.'))
      settle?.reject(new MicrosoftError(explainSignInError(q.get('error') ?? '', q.get('error_description') ?? '')))
      return
    }
    const code = q.get('code')
    if (!code) {
      res.writeHead(400).end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(PAGE('Signed in', 'You can close this tab and go back to AETERNA CRM.'))
    settle?.resolve(code)
  }

  const main = createServer(handler)
  servers.push(main)
  await new Promise<void>((resolve, reject) => {
    main.once('error', reject)
    main.listen(0, '127.0.0.1', () => resolve())
  })
  const port = (main.address() as { port: number }).port
  // Browsers may try ::1 for "localhost" first: answer there too when that port is free.
  const v6 = createServer(handler)
  await new Promise<void>((resolve) => {
    v6.once('error', () => resolve())
    v6.listen(port, '::1', () => {
      servers.push(v6)
      resolve()
    })
  })
  const redirectUri = `http://localhost:${port}`
  const timer = setTimeout(() => settle?.reject(new MicrosoftError('The sign-in wasn’t finished within 5 minutes. Start it again.')), opts.timeoutMs ?? 5 * 60_000)
  try {
    await opts.openBrowser(authorizeUrl(e, opts.tenant, opts.clientId, redirectUri, challenge, state))
    const code = await waiting
    const tokens = await tokenRequest(opts.fetch, e, opts.tenant, {
      client_id: opts.clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      scope: SCOPES
    })
    if (!tokens.refreshToken) throw new MicrosoftError('Microsoft 365 didn’t allow staying signed in. Check the app registration asks for offline_access.')
    const account = await whoAmI(opts.fetch, tokens.accessToken, e)
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, account }
  } finally {
    clearTimeout(timer)
    for (const s of servers) s.close()
  }
}

export async function refreshTokens(opts: { tenant: string; clientId: string; refreshToken: string; fetch: FetchLike; endpoints?: MicrosoftEndpoints }): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
  const t = await tokenRequest(opts.fetch, opts.endpoints ?? MICROSOFT, opts.tenant, {
    client_id: opts.clientId,
    grant_type: 'refresh_token',
    refresh_token: opts.refreshToken,
    scope: SCOPES
  })
  return { accessToken: t.accessToken, refreshToken: t.refreshToken ?? opts.refreshToken, expiresAt: t.expiresAt }
}

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Sends with Graph. A 401 throws `sign-in-again` so the caller can refresh the
 * token once and try again; busy replies (429, 503, 504) are retried twice,
 * waiting as Microsoft asks (at most 10 seconds).
 */
export async function graphSendMail(fetch: FetchLike, accessToken: string, email: OutgoingEmail, e: MicrosoftEndpoints = MICROSOFT): Promise<void> {
  const payload = JSON.stringify({
    message: {
      subject: email.subject,
      body: { contentType: 'Text', content: email.body },
      toRecipients: email.to.map((address) => ({ emailAddress: { address } })),
      ccRecipients: email.cc.map((address) => ({ emailAddress: { address } }))
    },
    saveToSentItems: true
  })
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${e.graph}/v1.0/me/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: payload
    })
    if (res.status === 202 || res.status === 200) return
    let message = ''
    try {
      message = (JSON.parse(await res.text()) as { error?: { message?: string } }).error?.message ?? ''
    } catch {
      /* not JSON */
    }
    if (res.status === 401) throw new MicrosoftError('Microsoft 365 needs you to sign in again (Settings → Email).', 'sign-in-again')
    if (res.status === 403) {
      throw new MicrosoftError('This Microsoft 365 account isn’t allowed to send mail from AETERNA CRM. Ask your administrator to grant the Mail.Send permission, and check the mailbox has an Exchange Online licence.', 'not-allowed')
    }
    if ([429, 503, 504].includes(res.status) && attempt < 3) {
      const wait = Math.min(10, Number(res.headers.get('retry-after')) || 2 * attempt)
      await pause(wait * 1000)
      continue
    }
    if ([429, 503, 504].includes(res.status)) throw new MicrosoftError('Microsoft 365 is busy right now. Try again in a few minutes.', 'busy')
    throw new MicrosoftError(message ? `Microsoft 365 didn’t send it: ${message}` : `Microsoft 365 didn’t send it (HTTP ${res.status}).`)
  }
}
