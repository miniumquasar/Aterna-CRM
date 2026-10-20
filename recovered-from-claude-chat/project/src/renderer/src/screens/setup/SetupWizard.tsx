import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, CircleDashed, Printer } from 'lucide-react'
import type { SessionUserInfo, SetupStatus, SetupStepKey, SystemStatus } from '@shared/types'
import { RestorePanel } from '@renderer/components/backup/RestorePanel'
import { ImportScreen } from '@renderer/screens/crm/Import'
import { dayCount, longDate, useLicence } from '@renderer/hooks/useLicence'
import { useMotionLevel } from '@renderer/lib/motion'

type View = 'welcome' | SetupStepKey | 'done'
const ORDER: readonly View[] = ['welcome', 'firm', 'partner', 'recovery', 'vault', 'licence', 'import', 'done']

const STEP_LABEL: Record<SetupStepKey, string> = {
  firm: 'Your firm',
  partner: 'First partner',
  recovery: 'Recovery sheet',
  vault: 'Vault passphrase',
  licence: 'Licence',
  import: 'Your clients'
}

/** Where to do a step that was left for later. */
const LATER: Partial<Record<SetupStepKey, string>> = {
  recovery: 'Settings → General → Backups, “Save or print it now”',
  vault: 'Settings → Practice details',
  licence: 'Settings → Licence',
  import: 'Settings → Import'
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white/90 placeholder:text-white/30 focus:border-aether/50 focus:outline-none disabled:opacity-50'
const primary = 'rounded-xl bg-aether/90 px-5 py-2.5 text-sm font-medium text-black hover:bg-aether disabled:opacity-50'
const secondary = 'rounded-xl border border-white/15 px-5 py-2.5 text-sm text-white/80 hover:bg-white/[0.06] disabled:opacity-50'
const quiet = 'rounded-xl px-4 py-2.5 text-sm text-white/55 hover:text-white disabled:opacity-50'

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs text-white/60">{label}</span>
      {children}
      {hint && <span className="text-xs text-white/35">{hint}</span>}
    </label>
  )
}

function Problem({ text }: { text: string | null }): JSX.Element | null {
  if (!text) return null
  return (
    <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
      {text}
    </p>
  )
}

function Done({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p role="status" className="flex items-start gap-2 rounded-xl border border-aether/25 bg-aether/[0.06] px-3 py-2 text-sm text-white/85">
      <Check size={16} className="mt-0.5 flex-shrink-0 text-aether" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function StepHeader({ title, children }: { title: string; children?: ReactNode }): JSX.Element {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-light tracking-tight text-white/95">{title}</h1>
      {children && <div className="max-w-prose space-y-2 text-sm leading-relaxed text-white/60">{children}</div>}
    </div>
  )
}

interface WizardProps {
  /** Nobody can sign in yet: the wizard creates the first partner. */
  firstRun: boolean
  user: SessionUserInfo | null
  system: SystemStatus | null
  onSignedIn: (user: SessionUserInfo) => void
  onFinished: () => void
}

/**
 * Setting up a new practice, once: the firm, the first partner, the recovery
 * sheet, the vault passphrase, the licence and the client workbook. Closing
 * the app part-way is fine: a partner signing in again carries on from the
 * first step not done (setup/service.ts reads that from the records).
 */
export function SetupWizard({ firstRun, user, system, onSignedIn, onFinished }: WizardProps): JSX.Element {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const motionLevel = useMotionLevel()

  const refresh = useCallback(async (): Promise<SetupStatus | null> => {
    const r = await window.api.setup.status()
    if (!r.ok) {
      setLoadError(r.error)
      return null
    }
    setLoadError(null)
    setStatus(r.data)
    return r.data
  }, [])

  useEffect(() => {
    void refresh().then((s) => {
      if (!s) return
      setView(s.firstRun && s.next === 'firm' ? 'welcome' : (s.next ?? 'done'))
    })
  }, [refresh])

  const stateOf = (key: SetupStepKey, s: SetupStatus | null = status): string => s?.steps.find((x) => x.key === key)?.state ?? 'todo'

  /** On to the next step still to do (steps already done are passed by). */
  const advance = async (from: View): Promise<void> => {
    const s = (await refresh()) ?? status
    const start = ORDER.indexOf(from) + 1
    const next = ORDER.slice(start).find((v) => v === 'done' || (v !== 'welcome' && stateOf(v as SetupStepKey, s) === 'todo'))
    setView(next ?? 'done')
  }

  /** Back to an earlier step that can be looked at again (not the partner account once made). */
  const back = (from: View): void => {
    const before = ORDER.slice(0, ORDER.indexOf(from)).reverse()
    const target = before.find((v) => v !== 'welcome' && v !== 'partner')
    if (target) setView(target)
  }
  const canGoBack = (v: View): boolean => !['welcome', 'firm', 'partner'].includes(v) || (v === 'firm' && false)

  const mark = async (step: SetupStepKey, state: 'done' | 'skipped', from: View): Promise<string | null> => {
    const r = await window.api.setup.mark(step, state)
    if (!r.ok) return r.error
    await advance(from)
    return null
  }

  const animate = motionLevel !== 'none'

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-void text-white" aria-label="Set up AETERNA CRM">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(0,245,232,0.08),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(245,216,160,0.06),transparent_50%)]" aria-hidden />

      {/* Steps */}
      <aside className="relative z-10 hidden w-72 flex-shrink-0 flex-col border-r border-white/5 px-8 pb-8 pt-16 md:flex">
        <p className="text-xs text-aether/80">AETERNA CRM</p>
        <p className="mt-1 text-lg font-light text-white/90">Setting up</p>
        <ol className="mt-8 space-y-1" aria-label="Steps">
          {(Object.keys(STEP_LABEL) as SetupStepKey[]).map((key, i) => {
            const state = stateOf(key)
            const current = view === key
            return (
              <li key={key} aria-current={current ? 'step' : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${current ? 'bg-white/[0.06] text-white' : 'text-white/55'}`}>
                <span
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-[11px] ${
                    state === 'done' ? 'border-aether/50 bg-aether/15 text-aether' : current ? 'border-white/40 text-white' : 'border-white/15 text-white/40'
                  }`}
                  aria-hidden
                >
                  {state === 'done' ? <Check size={12} /> : state === 'skipped' ? <CircleDashed size={12} /> : i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{STEP_LABEL[key]}</span>
                <span className="sr-only">{state === 'done' ? '(done)' : state === 'skipped' ? '(left for later)' : ''}</span>
                {state === 'skipped' && <span className="text-[10px] text-white/35">later</span>}
              </li>
            )
          })}
        </ol>
        <p className="mt-auto text-xs leading-relaxed text-white/35">
          About ten minutes. You can stop at any point: the next time a partner signs in, it carries on from here.
        </p>
      </aside>

      {/* The step */}
      <section className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-8 py-16">
          {system?.mode === 'in-memory-fallback' && (
            <p role="alert" className="mb-6 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              The app data folder can’t be written to, so nothing entered now will be saved. Check there is free disk space and that your account can write to the app’s folder, then restart.
            </p>
          )}
          <Problem text={loadError} />
          <AnimatePresence mode="wait" initial={false}>
            {view && (
              <motion.div
                key={view}
                initial={animate ? { opacity: 0, x: 16 } : false}
                animate={{ opacity: 1, x: 0 }}
                exit={animate ? { opacity: 0, x: -16 } : undefined}
                transition={{ duration: 0.2 }}
                className="space-y-6"
                data-testid={`setup-${view}`}
              >
                {view === 'welcome' && <WelcomeStep onStart={() => setView('firm')} />}
                {view === 'firm' && <FirmStep status={status} onSaved={() => void advance('firm')} />}
                {view === 'partner' && <PartnerStep onCreated={(u) => { onSignedIn(u); void advance('partner') }} />}
                {view === 'recovery' && <RecoveryStep status={status} onDone={() => void advance('recovery')} onLater={() => mark('recovery', 'skipped', 'recovery')} />}
                {view === 'vault' && <VaultStep done={stateOf('vault') === 'done'} onDone={() => void advance('vault')} onLater={() => mark('vault', 'skipped', 'vault')} />}
                {view === 'licence' && <LicenceStep onDone={() => mark('licence', 'done', 'licence')} />}
                {view === 'import' && <ImportStep done={stateOf('import') === 'done'} onDone={() => void advance('import')} onLater={() => mark('import', 'skipped', 'import')} />}
                {view === 'done' && <FinishStep status={status} userName={user?.name ?? null} onFinished={onFinished} />}

                {view !== 'welcome' && view !== 'done' && canGoBack(view) && (
                  <button type="button" className="text-xs text-white/40 hover:text-white/70" onClick={() => back(view)}>
                    ← Back
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {!view && !loadError && <p className="text-sm text-white/40" role="status">One moment…</p>}
          {firstRun && view === 'welcome' && null}
        </div>
      </section>
    </main>
  )
}

// ── Steps ──────────────────────────────────────────────────────────────────

function WelcomeStep({ onStart }: { onStart: () => void }): JSX.Element {
  const [restoring, setRestoring] = useState(false)
  if (restoring) {
    return (
      <>
        <StepHeader title="Restore from a backup">
          <p>Moving to a new computer, or starting again: bring the practice back from a backup and its recovery sheet.</p>
        </StepHeader>
        <RestorePanel mode="setup" onCancel={() => setRestoring(false)} />
      </>
    )
  }
  return (
    <>
      <StepHeader title="Welcome to AETERNA CRM">
        <p>Six short steps set the practice up on this computer:</p>
      </StepHeader>
      <ol className="grid gap-3 sm:grid-cols-2">
        {[
          ['Your firm', 'The name and contact details on reports and letters.'],
          ['First partner', 'Your own account. Partners invite everyone else later.'],
          ['Recovery sheet', 'The encryption key on paper, for restoring on another computer.'],
          ['Vault passphrase', 'Protects the clients’ stored logins and codes.'],
          ['Licence', 'Your 60-day free trial, or a licence key.'],
          ['Your clients', 'Bring in the master client workbook.']
        ].map(([title, text], i) => (
          <li key={title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-sm text-white/90">
              <span className="mr-2 text-aether/80">{i + 1}</span>
              {title}
            </p>
            <p className="mt-1 text-xs text-white/50">{text}</p>
          </li>
        ))}
      </ol>
      <p className="text-sm text-white/50">Everything stays on this computer. Nothing is sent anywhere.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primary} onClick={onStart} data-testid="setup-start" autoFocus>
          Start
        </button>
        <button type="button" className={quiet} onClick={() => setRestoring(true)} data-testid="setup-restore">
          Moving to a new computer? Restore from a backup
        </button>
      </div>
    </>
  )
}

function FirmStep({ status, onSaved }: { status: SetupStatus | null; onSaved: () => void }): JSX.Element {
  const f = status?.firm
  const [form, setForm] = useState({
    name: f?.name ?? '',
    address_line1: f?.address_line1 ?? '',
    address_line2: f?.address_line2 ?? '',
    city: f?.city ?? '',
    postcode: f?.postcode ?? '',
    country: f?.country ?? 'United Kingdom',
    email: f?.email ?? '',
    phone: f?.phone ?? '',
    registration_number: f?.registration_number ?? ''
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }): void => setForm((x) => ({ ...x, [k]: e.target.value }))

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const r = await window.api.setup.saveFirm(form)
    setBusy(false)
    if (r.ok) onSaved()
    else setError(r.error)
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-6">
      <StepHeader title="Your firm">
        <p>The firm’s name goes on reports, exports and the recovery sheet. Only the name is needed now; the rest can be added later in Settings.</p>
      </StepHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Firm name">
            <input className={inputClass} value={form.name} onChange={set('name')} autoFocus autoComplete="organization" data-testid="setup-firm-name" />
          </Field>
        </div>
        <Field label="Address">
          <input className={inputClass} value={form.address_line1} onChange={set('address_line1')} autoComplete="address-line1" />
        </Field>
        <Field label="Address, second line">
          <input className={inputClass} value={form.address_line2} onChange={set('address_line2')} autoComplete="address-line2" />
        </Field>
        <Field label="Town or city">
          <input className={inputClass} value={form.city} onChange={set('city')} autoComplete="address-level2" />
        </Field>
        <Field label="Postcode">
          <input className={inputClass} value={form.postcode} onChange={set('postcode')} autoComplete="postal-code" />
        </Field>
        <Field label="Country">
          <input className={inputClass} value={form.country} onChange={set('country')} autoComplete="country-name" />
        </Field>
        <Field label="Company number" hint="If the firm is a company or LLP.">
          <input className={inputClass} value={form.registration_number} onChange={set('registration_number')} />
        </Field>
        <Field label="Email">
          <input type="email" className={inputClass} value={form.email} onChange={set('email')} autoComplete="email" />
        </Field>
        <Field label="Phone">
          <input className={inputClass} value={form.phone} onChange={set('phone')} autoComplete="tel" />
        </Field>
      </div>
      <Problem text={error} />
      <button type="submit" className={primary} disabled={busy || !form.name.trim()} data-testid="setup-firm-save">
        {busy ? 'Saving…' : 'Save and continue'}
      </button>
    </form>
  )
}

function PartnerStep({ onCreated }: { onCreated: (user: SessionUserInfo) => void }): JSX.Element {
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }): void => setForm((x) => ({ ...x, [k]: e.target.value }))

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    if (form.password !== form.confirm) return setError('The two passwords don’t match.')
    setBusy(true)
    const r = await window.api.auth.createFirstPartner({ name: form.name, username: form.username, email: form.email, password: form.password })
    setBusy(false)
    if (r.success) onCreated(r.user)
    else setError(r.error)
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-6">
      <StepHeader title="The first partner">
        <p>Your own account. Partners manage people, backups and the licence; you invite managers and staff once setup is done.</p>
        <p>Sign-in is a username and password on this computer only.</p>
      </StepHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" hint="As it should appear on work you're assigned.">
          <input className={inputClass} value={form.name} onChange={set('name')} autoFocus autoComplete="name" data-testid="setup-partner-name" />
        </Field>
        <Field label="Email (optional)">
          <input type="email" className={inputClass} value={form.email} onChange={set('email')} autoComplete="email" />
        </Field>
        <Field label="Username" hint="3 to 60 letters, digits, dots, dashes or underscores.">
          <input className={inputClass} value={form.username} onChange={set('username')} autoComplete="username" data-testid="setup-partner-username" />
        </Field>
        <div />
        <Field label="Password" hint="At least 10 characters. A short phrase is easier to remember.">
          <input type="password" className={inputClass} value={form.password} onChange={set('password')} autoComplete="new-password" data-testid="setup-partner-password" />
        </Field>
        <Field label="Type the password again">
          <input type="password" className={inputClass} value={form.confirm} onChange={set('confirm')} autoComplete="new-password" data-testid="setup-partner-confirm" />
        </Field>
      </div>
      <Problem text={error} />
      <button type="submit" className={primary} disabled={busy || !form.name.trim() || !form.username.trim() || !form.password} data-testid="setup-partner-create">
        {busy ? 'Creating the account…' : 'Create the account'}
      </button>
    </form>
  )
}

function RecoveryStep({ status, onDone, onLater }: { status: SetupStatus | null; onDone: () => void; onLater: () => Promise<string | null> }): JSX.Element {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'pdf' | 'print' | 'later' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const note = status?.notes.recovery

  useEffect(() => {
    void window.api.recovery.getStatus().then((r) => {
      setFingerprint(r.fingerprint)
      if (r.done) setSaved(r.last?.how === 'print' ? 'Printed.' : 'Saved.')
    })
  }, [])

  const act = async (how: 'pdf' | 'print'): Promise<void> => {
    setError(null)
    setBusy(how)
    const r = how === 'pdf' ? await window.api.recovery.savePdf(password) : await window.api.recovery.print(password)
    setBusy(null)
    if (r.success) setSaved(how === 'pdf' ? 'Saved. Print it as well, then keep the paper sealed and locked away.' : 'Sent to the printer. Keep the sheet sealed and locked away.')
    else setError(r.error ?? 'That didn’t work.')
  }

  return (
    <>
      <StepHeader title="The recovery sheet">
        <p>
          The practice database and every backup are encrypted with a key kept on this computer. If the computer fails, a backup can only be restored with that key — so it goes on paper.
        </p>
        <p>Save the sheet as a PDF or print it, then keep the paper sealed and locked away, apart from the computer and its backups.</p>
      </StepHeader>
      {note ? (
        <Done>{note}</Done>
      ) : (
        <>
          {fingerprint && (
            <p className="text-sm text-white/55">
              Key fingerprint <span className="font-mono text-white/85">{fingerprint}</span>
            </p>
          )}
          <div className="max-w-sm">
            <Field label="Your password, to confirm it’s you">
              <input type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus data-testid="setup-recovery-password" />
            </Field>
          </div>
          <Problem text={error} />
          {saved && <Done>{saved}</Done>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondary} disabled={!password || busy !== null} onClick={() => void act('pdf')} data-testid="setup-recovery-pdf">
              {busy === 'pdf' ? 'Saving…' : 'Save as PDF…'}
            </button>
            <button type="button" className={secondary} disabled={!password || busy !== null} onClick={() => void act('print')}>
              {busy === 'print' ? 'Printing…' : 'Print…'}
            </button>
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-6">
        <button type="button" className={primary} disabled={!note && !saved} onClick={onDone} data-testid="setup-recovery-continue">
          Continue
        </button>
        {!note && !saved && (
          <button
            type="button"
            className={quiet}
            disabled={busy !== null}
            onClick={async () => {
              setBusy('later')
              const problem = await onLater()
              setBusy(null)
              if (problem) setError(problem)
            }}
          >
            Do this later
          </button>
        )}
      </div>
      {!note && !saved && <p className="text-xs text-white/40">Until it is done, a yellow reminder stays at the top of the app.</p>}
    </>
  )
}

function VaultStep({ done, onDone, onLater }: { done: boolean; onDone: () => void; onLater: () => Promise<string | null> }): JSX.Element {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [setUp, setSetUp] = useState(done)
  const [printed, setPrinted] = useState(false)
  const [busy, setBusy] = useState<'setup' | 'print' | 'later' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The passphrase is only in this screen's memory, and only until the step is left.
  useEffect(() => () => setPassphrase(''), [])

  const create = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    if (passphrase !== confirm) return setError('The two passphrases don’t match.')
    setBusy('setup')
    const r = await window.api.vault.setUp(passphrase)
    setBusy(null)
    if (r.ok) {
      setSetUp(true)
      setConfirm('')
    } else setError(r.error)
  }

  const print = async (): Promise<void> => {
    setError(null)
    setBusy('print')
    const r = await window.api.setup.printVaultSheet(passphrase)
    setBusy(null)
    if (r.ok) setPrinted(true)
    else setError(r.error)
  }

  const strength = passphrase.length === 0 ? null : passphrase.length < 12 ? `${12 - passphrase.length} more character${12 - passphrase.length === 1 ? '' : 's'} needed` : passphrase.split(/\s+/).filter(Boolean).length >= 4 || passphrase.length >= 20 ? 'Good' : 'Long enough. Four or more words is stronger.'

  return (
    <>
      <StepHeader title="The vault passphrase">
        <p>
          The vault keeps the clients’ stored logins, authentication codes and other secrets, each encrypted with a key made from this passphrase. A partner or manager types it to open the vault; it locks itself after 15 minutes without use.
        </p>
        <p className="text-amber-100/80">
          The passphrase isn’t stored anywhere — not in the app, not in any backup. If it is lost, the vault can’t be opened again, even after a restore.
        </p>
      </StepHeader>

      {!setUp ? (
        <form onSubmit={(e) => void create(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vault passphrase" hint={strength ?? 'At least 12 characters. A phrase of four or more words is easy to remember and hard to guess.'}>
              <input type="password" className={inputClass} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="new-password" autoFocus data-testid="setup-vault-passphrase" />
            </Field>
            <Field label="Type it again">
              <input type="password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" data-testid="setup-vault-confirm" />
            </Field>
          </div>
          <Problem text={error} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={primary} disabled={passphrase.length < 12 || busy !== null} data-testid="setup-vault-create">
              {busy === 'setup' ? 'Setting up…' : 'Set up the vault'}
            </button>
            <button
              type="button"
              className={quiet}
              disabled={busy !== null}
              onClick={async () => {
                setBusy('later')
                const problem = await onLater()
                setBusy(null)
                if (problem) setError(problem)
              }}
            >
              Set it up later
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <Done>The vault is set up.</Done>
          {passphrase ? (
            <div className="space-y-3 rounded-2xl border border-divine/25 bg-divine/[0.05] p-5">
              <p className="text-sm text-white/80">
                <strong className="font-medium text-divine">One chance to print it.</strong> The app forgets the passphrase as soon as you leave this step. Print the passphrase sheet now, seal it in an envelope and keep it in the safe, apart from the recovery sheet — or write it down by hand, or keep it in the partners’ password manager.
              </p>
              <Problem text={error} />
              {printed ? (
                <Done>Sent to the printer.</Done>
              ) : (
                <button type="button" className={secondary} disabled={busy !== null} onClick={() => void print()} data-testid="setup-vault-print">
                  <Printer size={14} className="mr-2 inline" aria-hidden />
                  {busy === 'print' ? 'Printing…' : 'Print the passphrase sheet…'}
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/50">It was set up earlier. A partner or manager can open it from Compliance → References and logins.</p>
          )}
          <div className="border-t border-white/5 pt-6">
            <button
              type="button"
              className={primary}
              onClick={() => {
                if (passphrase && !printed && !window.confirm('Continue without printing the passphrase sheet? Make sure the passphrase is written down somewhere safe first.')) return
                setPassphrase('')
                onDone()
              }}
              data-testid="setup-vault-continue"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function LicenceStep({ onDone }: { onDone: () => Promise<string | null> }): JSX.Element {
  const { status, activate } = useLicence()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState<'activate' | 'continue' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activated, setActivated] = useState<string | null>(null)

  const enter = async (): Promise<void> => {
    setError(null)
    setBusy('activate')
    const r = await activate(key)
    setBusy(null)
    if (r.ok) {
      setKey('')
      setActivated(`Licensed to ${r.data.licensedTo ?? 'the firm'} until ${longDate(r.data.newValidUntil)}.`)
    } else setError(r.error)
  }

  const trialLine =
    !status ? 'Checking…'
      : status.licensedTo ? `Licensed to ${status.licensedTo} until ${longDate(status.validUntil)}.`
        : status.state === 'trial' ? `Your free trial runs until ${longDate(status.trialEndsOn)} — ${dayCount(status.daysRemaining)} from today.`
          : 'There is no free trial left on this computer. Enter a licence key to make changes; until then the app is read-only.'

  return (
    <>
      <StepHeader title="Licence">
        <p>{trialLine}</p>
        <p>One licence covers the whole firm, on any number of its computers, for £175 a year. A key can be entered now or at any time from Settings → Licence.</p>
      </StepHeader>
      <Field label="Licence key (optional)">
        <textarea rows={3} className={`${inputClass} font-mono`} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste the key from your licence email" />
      </Field>
      <Problem text={error} />
      {activated && <Done>{activated}</Done>}
      <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-6">
        {key.trim() && (
          <button type="button" className={secondary} disabled={busy !== null} onClick={() => void enter()}>
            {busy === 'activate' ? 'Checking the key…' : 'Enter the key'}
          </button>
        )}
        <button
          type="button"
          className={primary}
          disabled={busy !== null}
          data-testid="setup-licence-continue"
          onClick={async () => {
            setBusy('continue')
            const problem = await onDone()
            setBusy(null)
            if (problem) setError(problem)
          }}
        >
          {status?.licensedTo || activated ? 'Continue' : 'Continue with the free trial'}
        </button>
      </div>
    </>
  )
}

function ImportStep({ done, onDone, onLater }: { done: boolean; onDone: () => void; onLater: () => Promise<string | null> }): JSX.Element {
  const [imported, setImported] = useState(done)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <StepHeader title="Your clients">
        <p>Bring in the master client workbook: clients, contacts, deadlines, services and the other registers in one go. The app reads the file, shows a report of what it would do, and only then imports.</p>
      </StepHeader>
      {done && <Done>Clients are already here. More can be imported at any time from Settings → Import.</Done>}
      {!done && <ImportScreen compact onImported={() => setImported(true)} />}
      <Problem text={error} />
      <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-6">
        <button type="button" className={primary} disabled={!imported} onClick={onDone} data-testid="setup-import-continue">
          Continue
        </button>
        {!imported && (
          <button
            type="button"
            className={quiet}
            disabled={busy}
            data-testid="setup-import-later"
            onClick={async () => {
              setBusy(true)
              const problem = await onLater()
              setBusy(false)
              if (problem) setError(problem)
            }}
          >
            Skip — start with no clients
          </button>
        )}
      </div>
    </>
  )
}

function FinishStep({ status, userName, onFinished }: { status: SetupStatus | null; userName: string | null; onFinished: () => void }): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const later = useMemo(() => status?.steps.filter((s) => s.state !== 'done') ?? [], [status])

  const finish = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    const r = await window.api.setup.finish()
    setBusy(false)
    if (r.ok) onFinished()
    else setError(r.error)
  }

  return (
    <>
      <StepHeader title={`All set${userName ? `, ${userName.split(/\s+/)[0]}` : ''}`}>
        <p>AETERNA CRM is ready.{later.length ? ' A few things were left for later:' : ' Everything is done.'}</p>
      </StepHeader>
      {later.length > 0 && (
        <ul className="space-y-2">
          {later.map((s) => (
            <li key={s.key} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm">
              <span className="text-white/85">{STEP_LABEL[s.key]}</span>
              {LATER[s.key] && <span className="block text-xs text-white/45">When you’re ready: {LATER[s.key]}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-white/55">Next: invite the rest of the team from Settings, and press Ctrl K (⌘K on a Mac) at any time to go to a client or a screen.</p>
      <Problem text={error} />
      <button type="button" className={primary} disabled={busy} onClick={() => void finish()} autoFocus data-testid="setup-finish">
        {busy ? 'One moment…' : 'Open AETERNA CRM'}
      </button>
    </>
  )
}
