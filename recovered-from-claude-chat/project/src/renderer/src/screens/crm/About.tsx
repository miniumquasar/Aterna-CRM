import { useEffect, useId, useState } from 'react'
import { ChevronRight, Mail, Phone } from 'lucide-react'
import { GlassCard } from '@aether/primitives/GlassCard'
import { GlassButton } from '@aether/primitives/GlassButton'
import type { AboutInfo, LicenceStatus } from '@shared/types'
import { dayCount, longDate, useLicence } from '@renderer/hooks/useLicence'
import { useAuthStore } from '@renderer/stores/crm/auth'
import { useUiStore } from '@renderer/stores/ui'
import { GUIDES, WHATS_NEW } from './help/guides'
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_TOPICS, supportEmail, type SupportTopic } from './help/support'

const PLATFORM: Readonly<Record<string, string>> = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }

/** One line on where the licence stands. */
function standing(s: LicenceStatus): string {
  switch (s.state) {
    case 'licensed':
      return `Licensed until ${longDate(s.validUntil)} — ${dayCount(s.daysRemaining)} left.`
    case 'grace':
      return `The licence ended on ${longDate(s.validUntil)}. Everything keeps working until ${longDate(s.graceEndsOn)}; then the app is read-only until a new key is entered.`
    case 'expired':
      return `The licence ended on ${longDate(s.validUntil)}. The app is read-only until a new key is entered.`
    case 'trial':
      return `Free trial until ${longDate(s.validUntil)} — ${dayCount(s.daysRemaining)} left.`
    default:
      return 'The free trial has ended. The app is read-only until a licence key is entered.'
  }
}

/** This copy's details, one per line, for support. */
function copyDetails(info: AboutInfo | null, status: LicenceStatus | null): string[] {
  if (!info) return []
  return [
    `${info.product} ${info.version}`,
    `${PLATFORM[info.platform] ?? info.platform} (${info.arch}) · Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}`,
    status ? `Licence: ${status.licensedTo ?? 'free trial'} · machine code ${status.machineCode}` : ''
  ].filter(Boolean)
}

/** The product, its version, whose licence it is, short guides, what's new, and how to get help. */
export function About({ onOpenLicence }: { onOpenLicence: () => void }): JSX.Element {
  const { status } = useLicence()
  const [info, setInfo] = useState<AboutInfo | null>(null)
  const [infoState, setInfoState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    window.api
      .getAbout()
      .then((i) => {
        setInfo(i)
        setInfoState('ready')
      })
      .catch(() => setInfoState('failed'))
  }, [])

  const copyToClipboard = async (): Promise<void> => {
    const lines = copyDetails(info, status)
    if (!lines.length) return
    await navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <p className="mt-1 text-sm text-white/60">Practice management for UK accounting firms. Your data stays on this computer.</p>
      </header>

      <GlassCard glow="aether" className="p-8">
        <p className="text-sm text-white/60">AETERNA CRM</p>
        <p className="mt-2 text-4xl font-light tracking-tight text-white/90 tabular-nums">{info ? `Version ${info.version}` : '—'}</p>
        {status && (
          <>
            <p className="mt-5 text-lg text-aether" data-testid="about-licensed-to">
              {status.licensedTo ? `Licensed to ${status.licensedTo}` : 'Not licensed yet — free trial'}
            </p>
            <p className="mt-1 text-sm text-white/65">{standing(status)}</p>
          </>
        )}
        <div className="mt-6">
          <GlassButton variant="primary" size="sm" onClick={onOpenLicence}>
            Open licence
          </GlassButton>
        </div>
      </GlassCard>

      <Guides />

      <SupportCard info={info} status={status} />

      <WhatsNew />

      <GlassCard glow="none" className="p-8">
        <h2 className="text-sm font-medium text-white/85">This copy</h2>
        {info ? (
          <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-white/60">Version</dt>
            <dd className="text-white/85 tabular-nums">{info.version}</dd>
            <dt className="text-white/60">System</dt>
            <dd className="text-white/85">
              {PLATFORM[info.platform] ?? info.platform} ({info.arch})
            </dd>
            <dt className="text-white/60">Built on</dt>
            <dd className="text-white/85 tabular-nums">
              Electron {info.electron} · Chromium {info.chrome} · Node {info.node}
            </dd>
            {status && (
              <>
                <dt className="text-white/60">Machine code</dt>
                <dd className="font-mono text-white/85">{status.machineCode}</dd>
              </>
            )}
          </dl>
        ) : infoState === 'failed' ? (
          <p role="alert" className="mt-4 text-sm text-rose-200">
            This copy’s details couldn’t be read. Restart the app to see them.
          </p>
        ) : (
          <p role="status" className="mt-4 text-sm text-white/60">
            Reading this copy’s details…
          </p>
        )}
        <div className="mt-5">
          <GlassButton variant="secondary" size="sm" onClick={() => void copyToClipboard()} disabled={!info}>
            {copied ? 'Copied' : 'Copy these details'}
          </GlassButton>
          {copied && (
            <span role="status" className="sr-only">
              The details are on the clipboard.
            </span>
          )}
        </div>
      </GlassCard>
    </div>
  )
}

/** Short guides, each opening to a few points and a way to the screen. */
function Guides(): JSX.Element {
  const navigateTo = useUiStore((s) => s.navigateTo)
  return (
    <section aria-labelledby="help-guides" className="space-y-3">
      <h2 id="help-guides" className="text-sm font-medium text-white/85">
        Guides
      </h2>
      <ul className="space-y-2" data-testid="help-guides">
        {GUIDES.map((g) => (
          <li key={g.id}>
            <details className="group rounded-2xl border border-white/10 bg-white/[0.02] open:bg-white/[0.04]" data-testid={`guide-${g.id}`}>
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-5 py-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-aether [&::-webkit-details-marker]:hidden">
                <ChevronRight aria-hidden size={14} className="flex-shrink-0 text-white/60 transition-transform group-open:rotate-90" />
                <span className="text-sm text-white/90">{g.title}</span>
                <span className="ml-auto text-xs text-white/55">{g.where}</span>
              </summary>
              <div className="space-y-3 px-5 pb-4 pl-12">
                <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-white/75 marker:text-white/40">
                  {g.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                {g.route && (
                  <button
                    type="button"
                    onClick={() => navigateTo(g.route!)}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-aether"
                  >
                    Open {g.where.split(',')[0].trim()}
                  </button>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
      <p className="text-xs text-white/55">The full guides come with each release, in the docs folder beside the installer.</p>
    </section>
  )
}

/**
 * Support by email or phone, and a form that writes the email: the PC's mail
 * app opens with it ready to check and send. Nothing is sent from the app.
 */
function SupportCard({ info, status }: { info: AboutInfo | null; status: LicenceStatus | null }): JSX.Element {
  const me = useAuthStore((s) => s.user)
  const id = useId()
  const [topic, setTopic] = useState<SupportTopic>('problem')
  const [message, setMessage] = useState('')
  const [withDetails, setWithDetails] = useState(true)
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const write = async (): Promise<void> => {
    if (!message.trim()) {
      setNote({ tone: 'error', text: 'Say what happened, or what you’d like to know, first.' })
      return
    }
    const email = supportEmail({
      topic,
      message,
      from: { name: me?.name, firm: status?.licensedTo },
      details: withDetails ? copyDetails(info, status) : []
    })
    if (email.tooLong) {
      try {
        await navigator.clipboard.writeText(email.body)
      } catch {
        setNote({ tone: 'error', text: 'The message is too long for the mail app and couldn’t be copied. Shorten it, or email it yourself.' })
        return
      }
    }
    window.open(email.url)
    setNote({
      tone: 'ok',
      text: email.tooLong
        ? 'Your mail app should open now. The message was too long to pass across, so it is on the clipboard: paste it into the email, check it, then send.'
        : 'Your mail app should open now with the message ready. Check it, then send.'
    })
  }

  return (
    <GlassCard glow="none" className="p-8">
      <h2 className="text-sm font-medium text-white/85">Ask for help</h2>
      <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt className="flex items-center gap-2 text-white/60">
          <Mail aria-hidden size={13} /> Email
        </dt>
        <dd>
          <a className="text-aether underline-offset-4 hover:underline" href={`mailto:${SUPPORT_EMAIL}?subject=AETERNA%20CRM%20support`}>
            {SUPPORT_EMAIL}
          </a>
        </dd>
        <dt className="flex items-center gap-2 text-white/60">
          <Phone aria-hidden size={13} /> Phone
        </dt>
        <dd className="text-white/85 tabular-nums">{SUPPORT_PHONE}</dd>
      </dl>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void write()
        }}
        className="mt-6 space-y-4 border-t border-white/10 pt-6"
        aria-describedby={`${id}-about`}
        data-testid="support-form"
      >
        <p id={`${id}-about`} className="text-sm text-white/65">
          Or write it here: your mail app opens with the message ready to check and send. Leave out clients’ details — support doesn’t need them.
        </p>
        <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
          <label className="flex flex-col gap-1.5 text-xs text-white/65">
            What it’s about
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value as SupportTopic)}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 focus:border-aether/50 focus:outline-none"
              data-testid="support-topic"
            >
              {(Object.keys(SUPPORT_TOPICS) as SupportTopic[]).map((k) => (
                <option key={k} value={k}>
                  {SUPPORT_TOPICS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-white/65">
            What happened, or what you’d like to know
            <textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value)
                setNote(null)
              }}
              rows={5}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm leading-relaxed text-white/90 placeholder:text-white/50 focus:border-aether/50 focus:outline-none"
              placeholder="For example: on the client file, saving a pension shows an error."
              data-testid="support-message"
            />
          </label>
        </div>
        <label className="flex items-start gap-2.5 text-sm text-white/75">
          <input type="checkbox" checked={withDetails} onChange={(e) => setWithDetails(e.target.checked)} className="mt-1 h-3.5 w-3.5 accent-[#00baba]" />
          <span>Add this copy’s details: the version, the system, the licence and the machine code.</span>
        </label>
        {note && (
          <p
            role={note.tone === 'error' ? 'alert' : 'status'}
            className={`rounded-xl border px-3 py-2 text-sm ${note.tone === 'ok' ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-50' : 'border-rose-400/30 bg-rose-500/10 text-rose-100'}`}
            data-testid="support-note"
          >
            {note.text}
          </p>
        )}
        <GlassButton type="submit" variant="primary" size="sm" data-testid="support-write">
          <Mail aria-hidden size={14} /> Write the email
        </GlassButton>
      </form>
    </GlassCard>
  )
}

function WhatsNew(): JSX.Element {
  return (
    <GlassCard glow="none" className="p-8">
      <h2 className="text-sm font-medium text-white/85">What’s new</h2>
      <div className="mt-4 space-y-6" data-testid="whats-new">
        {WHATS_NEW.map((r, i) => (
          <section key={r.bundle} aria-labelledby={`new-${r.bundle}`}>
            <h3 id={`new-${r.bundle}`} className="text-sm text-white/90">
              {r.title}
              {i === 0 && <span className="ml-2 rounded-full border border-aether/40 px-2 py-0.5 text-[11px] text-aether">This update</span>}
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-white/70 marker:text-white/40">
              {r.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </GlassCard>
  )
}
