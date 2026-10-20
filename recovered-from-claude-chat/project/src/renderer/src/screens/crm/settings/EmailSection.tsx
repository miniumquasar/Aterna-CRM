import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, LogIn, LogOut, Mail, Send } from 'lucide-react'
import type { EmailMethod, EmailSettings, UserRole } from '@shared/types'
import { refreshEmailStatus } from '@renderer/components/email/useEmailSender'

const field = 'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 focus:border-aether/50 focus:outline-none'
const button = 'inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/[0.06] disabled:opacity-40'

const METHODS: Array<{ key: EmailMethod; title: string; text: string }> = [
  { key: 'mail-app', title: 'Your mail app (the default)', text: 'Messages open in Outlook, Apple Mail or whichever mail app this computer uses, ready to check and send from there. Nothing to set up.' },
  { key: 'smtp', title: 'SMTP server', text: 'Sent from AETERNA CRM through your mail provider’s server. Gmail, iCloud, Yahoo and most others need an app password, not the account password.' },
  { key: 'microsoft365', title: 'Microsoft 365', text: 'Sent from AETERNA CRM through the practice’s Microsoft 365 mailbox, after a one-off app registration and a sign-in.' },
  { key: 'resend', title: 'Resend', text: 'Sent through Resend, an email delivery service, from a domain you have verified there.' }
]

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-xs text-white/60">
      {label}
      {children}
      {hint && <span className="text-[11px] text-white/40">{hint}</span>}
    </label>
  )
}

/** Settings → Email: how emails go out. Partners and managers. */
export function EmailSection({ role, myEmail }: { role: UserRole | undefined; myEmail: string | null }): JSX.Element | null {
  const canManage = role === 'partner' || role === 'manager'
  const [saved, setSaved] = useState<EmailSettings | null>(null)
  const [form, setForm] = useState<EmailSettings | null>(null)
  const [smtpPassword, setSmtpPassword] = useState('')
  const [resendKey, setResendKey] = useState('')
  const [testTo, setTestTo] = useState(myEmail ?? '')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<'save' | 'test' | 'sign-in' | null>(null)
  const [howTo, setHowTo] = useState(false)

  const load = async (): Promise<void> => {
    const r = await window.api.email.getSettings()
    if (r.success) {
      setSaved(r.settings)
      setForm(r.settings)
    }
  }
  useEffect(() => {
    if (canManage) void load()
  }, [canManage])

  if (!canManage || !form || !saved) return null
  const say = (ok: boolean, text: string): void => setMessage({ ok, text })
  const set = <K extends keyof EmailSettings>(k: K, v: EmailSettings[K]): void => setForm({ ...form, [k]: v })

  const save = async (method: EmailMethod = form.method): Promise<boolean> => {
    setBusy('save')
    setMessage(null)
    try {
      const r = await window.api.email.saveSettings({
        method,
        fromName: form.fromName,
        replyTo: form.replyTo || null,
        smtp: { host: form.smtp.host, port: form.smtp.port, security: form.smtp.security, username: form.smtp.username, from: form.smtp.from, password: smtpPassword || undefined },
        microsoft365: { tenant: form.microsoft365.tenant, clientId: form.microsoft365.clientId },
        resend: { from: form.resend.from, apiKey: resendKey || undefined }
      })
      if (!r.success) {
        say(false, r.error)
        return false
      }
      setSaved(r.settings)
      setForm(r.settings)
      setSmtpPassword('')
      setResendKey('')
      await refreshEmailStatus()
      say(true, method === 'mail-app' ? 'Saved. Emails open in the mail app on this computer.' : `Saved. Emails are sent with ${METHODS.find((m) => m.key === method)?.title}. Send a test email to check.`)
      return true
    } finally {
      setBusy(null)
    }
  }

  const signIn = async (): Promise<void> => {
    // The IDs are saved first: the sign-in uses the saved ones.
    const keep = saved.method
    if (!(await save(keep))) return
    setForm((f) => (f ? { ...f, method: 'microsoft365' } : f))
    setBusy('sign-in')
    say(true, 'A sign-in page has opened in your browser. Sign in with the mailbox the practice sends from, then come back here.')
    try {
      const r = await window.api.email.microsoftSignIn()
      if (!r.success) return say(false, r.error)
      const switched = await window.api.email.saveSettings({ method: 'microsoft365' })
      if (switched.success) {
        setSaved(switched.settings)
        setForm(switched.settings)
      }
      await refreshEmailStatus()
      say(true, `Signed in as ${r.account}. Emails are now sent through Microsoft 365 — send a test email to check.`)
    } finally {
      setBusy(null)
    }
  }

  const signOut = async (): Promise<void> => {
    const r = await window.api.email.microsoftSignOut()
    if (!r.success) return say(false, r.error)
    await load()
    await refreshEmailStatus()
    say(true, 'Signed out of Microsoft 365. Emails open in the mail app until another way is chosen.')
  }

  const test = async (): Promise<void> => {
    setBusy('test')
    setMessage(null)
    try {
      const r = await window.api.email.sendTest(testTo)
      if (!r.success) say(false, r.error)
      else say(true, r.status === 'opened' ? `The test email opened in your mail app, addressed to ${r.to}. Send it from there.` : `Test email sent to ${r.to}. Check it arrived (and isn’t in junk).`)
    } finally {
      setBusy(null)
    }
  }

  const changed = JSON.stringify(form) !== JSON.stringify(saved) || !!smtpPassword || !!resendKey

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white" data-testid="email-section">
      <div className="flex items-center gap-2">
        <Mail size={16} className="text-aether" />
        <h3 className="text-sm font-semibold">Email</h3>
      </div>
      <p className="text-sm text-white/60">
        How emails to clients go out. Every email is recorded in the client’s messages, with who sent it, who it went to and the full text.
      </p>

      <div className="grid gap-2 md:grid-cols-2" role="radiogroup" aria-label="How emails go out">
        {METHODS.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={form.method === m.key}
            onClick={() => set('method', m.key)}
            className={`rounded-xl border p-3 text-left transition-colors ${form.method === m.key ? 'border-aether/50 bg-aether/[0.07]' : 'border-white/10 hover:bg-white/[0.04]'}`}
            data-testid={`email-method-${m.key}`}
          >
            <p className="flex items-center gap-2 text-sm font-medium text-white/90">
              {form.method === m.key && <CheckCircle2 size={14} className="text-aether" />} {m.title}
              {saved.method === m.key && <span className="text-[10px] font-normal text-white/45">in use</span>}
            </p>
            <p className="mt-1 text-xs text-white/50">{m.text}</p>
          </button>
        ))}
      </div>

      {form.method !== 'mail-app' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name emails come from">
            <input className={field} value={form.fromName} onChange={(e) => set('fromName', e.target.value)} />
          </Field>
          <Field label="Replies go to (optional)" hint="Leave empty for replies to go to the sending address.">
            <input className={field} value={form.replyTo ?? ''} onChange={(e) => set('replyTo', e.target.value)} placeholder="office@yourpractice.co.uk" />
          </Field>
        </div>
      )}

      {form.method === 'smtp' && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Server">
              <input className={field} value={form.smtp.host} onChange={(e) => set('smtp', { ...form.smtp, host: e.target.value })} placeholder="smtp.example.com" />
            </Field>
            <Field label="Port">
              <input className={field} inputMode="numeric" value={form.smtp.port} onChange={(e) => set('smtp', { ...form.smtp, port: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
            </Field>
            <Field label="Security">
              <select className={field} value={form.smtp.security} onChange={(e) => set('smtp', { ...form.smtp, security: e.target.value as 'starttls' | 'tls', port: e.target.value === 'tls' ? 465 : 587 })}>
                <option value="starttls">STARTTLS (usually port 587)</option>
                <option value="tls">TLS (usually port 465)</option>
              </select>
            </Field>
            <Field label="Username">
              <input className={field} value={form.smtp.username} onChange={(e) => set('smtp', { ...form.smtp, username: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Password" hint={saved.smtp.hasPassword && !smtpPassword ? 'Saved. Type a new one to replace it.' : 'An app password, for most providers.'}>
              <input type="password" className={field} value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} autoComplete="new-password" placeholder={saved.smtp.hasPassword ? '••••••••' : ''} />
            </Field>
            <Field label="Emails come from">
              <input className={field} value={form.smtp.from} onChange={(e) => set('smtp', { ...form.smtp, from: e.target.value })} placeholder="office@yourpractice.co.uk" />
            </Field>
          </div>
          <p className="text-xs text-white/45">
            Microsoft 365 mailboxes: choose Microsoft 365 instead. Microsoft is switching off password sign-in for SMTP, so SMTP with a Microsoft 365 password will stop working.
          </p>
        </div>
      )}

      {form.method === 'microsoft365' && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tenant ID (or the organisation’s domain)">
              <input className={field} value={form.microsoft365.tenant} onChange={(e) => set('microsoft365', { ...form.microsoft365, tenant: e.target.value.trim() })} placeholder="yourpractice.onmicrosoft.com" />
            </Field>
            <Field label="Application (client) ID">
              <input className={field} value={form.microsoft365.clientId} onChange={(e) => set('microsoft365', { ...form.microsoft365, clientId: e.target.value.trim() })} placeholder="1a2b3c4d-…" />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {saved.microsoft365.connected ? (
              <>
                <span className="text-sm text-emerald-300">Signed in as {saved.microsoft365.account}</span>
                <button type="button" className={button} onClick={() => void signOut()}>
                  <LogOut size={13} /> Sign out
                </button>
              </>
            ) : (
              <button type="button" className={button} disabled={busy !== null || !form.microsoft365.tenant || !form.microsoft365.clientId} onClick={() => void signIn()}>
                <LogIn size={13} /> {busy === 'sign-in' ? 'Waiting for the browser…' : 'Sign in to Microsoft 365…'}
              </button>
            )}
          </div>
          <button type="button" className="flex items-center gap-1 text-xs text-aether/90 hover:underline" onClick={() => setHowTo(!howTo)} aria-expanded={howTo}>
            {howTo ? <ChevronDown size={12} /> : <ChevronRight size={12} />} How to register AETERNA CRM in Microsoft 365 (once, by an administrator)
          </button>
          {howTo && (
            <ol className="list-decimal space-y-1 pl-5 text-xs text-white/60">
              <li>Sign in to the Microsoft Entra admin centre (entra.microsoft.com) as an administrator.</li>
              <li>App registrations → New registration. Name: AETERNA CRM. Accounts in this organisational directory only.</li>
              <li>Redirect URI: choose “Public client/native (mobile & desktop)” and enter http://localhost. Register.</li>
              <li>Authentication → Advanced settings → Allow public client flows: Yes. Save.</li>
              <li>API permissions → Add a permission → Microsoft Graph → Delegated: Mail.Send and User.Read. Then “Grant admin consent”.</li>
              <li>From Overview, copy the Directory (tenant) ID and the Application (client) ID into the boxes above, then sign in.</li>
            </ol>
          )}
        </div>
      )}

      {form.method === 'resend' && (
        <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:grid-cols-2">
          <Field label="API key" hint={saved.resend.hasKey && !resendKey ? 'Saved. Type a new one to replace it.' : 'From resend.com → API Keys (sending access is enough).'}>
            <input type="password" className={field} value={resendKey} onChange={(e) => setResendKey(e.target.value)} autoComplete="new-password" placeholder={saved.resend.hasKey ? '••••••••' : 're_…'} />
          </Field>
          <Field label="Emails come from" hint="On a domain verified in Resend.">
            <input className={field} value={form.resend.from} onChange={(e) => set('resend', { ...form.resend, from: e.target.value })} placeholder="office@yourpractice.co.uk" />
          </Field>
        </div>
      )}

      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`rounded-xl border px-3 py-2 text-sm ${message.ok ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-50' : 'border-rose-400/30 bg-rose-500/10 text-rose-100'}`} data-testid="email-message">
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <button type="button" disabled={busy !== null || !changed} onClick={() => void save()} className="rounded-xl bg-aether/90 px-4 py-2 text-sm font-medium text-black hover:bg-aether disabled:opacity-40" data-testid="email-save">
          {busy === 'save' ? 'Saving…' : 'Save email settings'}
        </button>
        <div className="flex flex-1 flex-wrap items-end gap-2">
          <Field label="Send a test email to">
            <input className={`${field} min-w-[16rem]`} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@yourpractice.co.uk" />
          </Field>
          <button type="button" className={button} disabled={busy !== null || !testTo.trim() || changed} onClick={() => void test()} title={changed ? 'Save first' : undefined}>
            <Send size={13} /> {busy === 'test' ? 'Sending…' : 'Send a test'}
          </button>
        </div>
      </div>
    </div>
  )
}
