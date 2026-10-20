import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { GlassCard } from '@aether/primitives/GlassCard'
import { GlassButton } from '@aether/primitives/GlassButton'
import type { LicenceStatus } from '@shared/types'
import { dayCount, longDate, useLicence } from '@renderer/hooks/useLicence'

const shortDate = (iso: string): string =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function headline(s: LicenceStatus): { label: string; detail: string; tone: string; glow: 'aether' | 'divine' | 'none' } {
  switch (s.state) {
    case 'licensed':
      return { label: 'Licensed until', detail: `${dayCount(s.daysRemaining)} of access left.`, tone: s.remind ? 'text-divine' : 'text-aether', glow: s.remind ? 'divine' : 'aether' }
    case 'trial':
      return { label: 'Free trial until', detail: `${dayCount(s.daysRemaining)} left. You can enter a licence key at any time.`, tone: s.remind ? 'text-divine' : 'text-white/90', glow: s.remind ? 'divine' : 'none' }
    case 'expired':
      return { label: 'Licence ended on', detail: 'The app is read-only. Enter a new licence key to make changes again.', tone: 'text-rose-200', glow: 'none' }
    default:
      return { label: 'Free trial ended on', detail: 'The app is read-only. Enter a licence key to make changes again.', tone: 'text-rose-200', glow: 'none' }
  }
}

function Notice({ children }: { children: ReactNode }): JSX.Element {
  return <p className="rounded-2xl border border-divine/30 bg-divine/[0.06] px-5 py-4 text-sm leading-relaxed text-divine">{children}</p>
}

export function Licence(): JSX.Element {
  const { status, activate } = useLicence()
  const reduce = useReducedMotion()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

  if (!status) return <p className="text-sm text-white/50">Loading licence…</p>
  const h = headline(status)

  const submit = async (): Promise<void> => {
    setBusy(true)
    setResult(null)
    try {
      const r = await activate(key)
      if (r.ok) {
        setKey('')
        setResult({
          ok: true,
          text: r.data.kind === 'clock_reset'
            ? 'Clock check reset. Days are counted from today’s date again.'
            : `Done — access extended to ${longDate(r.data.newValidUntil)} (+${r.data.added}).`
        })
      } else {
        setResult({ ok: false, text: r.error })
      }
    } catch {
      setResult({ ok: false, text: 'The licence service did not respond. Restart the app and try again.' })
    } finally {
      setBusy(false)
    }
  }

  const copyMachineCode = async (): Promise<void> => {
    await navigator.clipboard.writeText(status.machineCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-white/90">Licence</h1>
        <p className="mt-1 text-sm text-white/50">
          Licences run for a year. Renewing early never loses time: the new year starts when the current one ends.
        </p>
      </header>

      {!status.configured && (
        <Notice>This build cannot verify licence keys yet because no signing key is configured. See LICENSING.md.</Notice>
      )}
      {status.clockWarning && (
        <Notice>
          This computer’s clock is set earlier than a date the app has already seen. Days are counted from that later date,
          so changing the clock does not add time. Set the correct date and time.
        </Notice>
      )}
      {status.stateTampered && (
        <Notice>
          Licence information on this computer was changed outside the app, so the free trial no longer applies. Licence keys
          you have entered still count.
        </Notice>
      )}

      <GlassCard glow={h.glow} className="p-8">
        <p className="text-sm text-white/50">{h.label}</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={status.validUntil ?? 'none'}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className={`mt-2 text-5xl font-light tracking-tight tabular-nums ${h.tone}`}
          >
            {longDate(status.validUntil) || '—'}
          </motion.p>
        </AnimatePresence>
        <p className="mt-3 text-sm text-white/60">{h.detail}</p>
        {status.pendingFrom && (
          <p className="mt-2 text-sm text-white/50">A licence you have entered starts on {longDate(status.pendingFrom)}.</p>
        )}
      </GlassCard>

      <GlassCard glow="none" className="p-8">
        <label htmlFor="licence-key" className="text-sm font-medium text-white/80">
          Licence key
        </label>
        <textarea
          id="licence-key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          rows={4}
          spellCheck={false}
          autoComplete="off"
          placeholder="Paste the 128-character key from your licence email"
          className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-black/20 p-4 font-mono text-sm leading-relaxed text-white/90 placeholder:text-white/30 focus:border-aether/40 focus:outline-none"
        />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <GlassButton variant="primary" onClick={() => void submit()} loading={busy} disabled={busy || key.trim().length < 20}>
            Activate key
          </GlassButton>
          {result && (
            <p role="status" className={`text-sm ${result.ok ? 'text-aether' : 'text-rose-200'}`}>
              {result.text}
            </p>
          )}
        </div>
      </GlassCard>

      <GlassCard glow="none" className="p-8">
        <h2 className="text-sm font-medium text-white/80">This computer</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <code className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 font-mono text-base tracking-wide text-white/90">
            {status.machineCode}
          </code>
          <GlassButton variant="secondary" size="sm" onClick={() => void copyMachineCode()}>
            {copied ? 'Copied' : 'Copy machine code'}
          </GlassButton>
        </div>
        <p className="mt-3 text-sm text-white/50">Your supplier needs this code only for keys issued to a single computer.</p>
      </GlassCard>

      {status.periods.length > 0 && (
        <GlassCard glow="none" className="p-8">
          <h2 className="text-sm font-medium text-white/80">Keys on this computer</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-white/40">
                <tr>
                  <th scope="col" className="pb-2 pr-4 font-normal">Licence</th>
                  <th scope="col" className="pb-2 pr-4 font-normal">Term</th>
                  <th scope="col" className="pb-2 pr-4 font-normal">Issued</th>
                  <th scope="col" className="pb-2 pr-4 font-normal">Covers</th>
                  <th scope="col" className="pb-2 font-normal">Locked to this computer</th>
                </tr>
              </thead>
              <tbody className="text-white/70">
                {status.periods.map((p) => (
                  <tr key={p.serial} className="border-t border-white/5">
                    <td className="py-2 pr-4 tabular-nums">{p.serial}</td>
                    <td className="py-2 pr-4">{p.term}</td>
                    <td className="py-2 pr-4 tabular-nums">{shortDate(p.issuedOn)}</td>
                    <td className="py-2 pr-4 tabular-nums">{shortDate(p.startsOn)} – {shortDate(p.validUntil)}</td>
                    <td className="py-2">{p.machineBound ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  )
}
