import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Client, ClientFile as ClientFileData } from '@shared/types'
import { formatPence } from '@shared/money'
import { AssistantBriefing } from '@renderer/components/assistant/AssistantPanels'
import { useMotionLevel } from '@renderer/lib/motion'
import { useUiStore } from '@renderer/stores/ui'
import { ClientPicker, pickerClients } from './ClientReferences'
import { useReferenceTarget } from './references/target'
import { call, formatDate, Notice, Section, smallButton } from './references/ui'
import { RegisterTable } from './data/RegisterTable'
import { useClientFileTarget, useCommsTarget, useDataTarget } from './data/target'
import { ContactsPanel } from './clientfile/ContactsPanel'
import { DeadlinesPanel } from './clientfile/DeadlinesPanel'
import { IssuesPanel } from './clientfile/IssuesPanel'
import { LinksPanel } from './clientfile/LinksPanel'
import { PayrollPanel } from './clientfile/PayrollPanel'
import { PensionsPanel } from './clientfile/PensionsPanel'
import { SelfAssessmentPanel } from './clientfile/SelfAssessmentPanel'

/** Registers worked on in their own panels above; the read-only tables below leave them out. */
const EDITED_HERE = new Set([
  'compliance_periods', 'client_contacts', 'data_issues', 'payroll_schemes', 'payroll_scheme_years', 'pension_schemes', 'sa_registrations',
  'client_income_sources', 'client_relationships', 'client_aliases'
])

/** The parts of a client's file, for the row of links at the top. */
const PARTS = [
  { id: 'cf-deadlines', label: 'Deadlines' },
  { id: 'cf-contacts', label: 'Contacts' },
  { id: 'cf-payroll', label: 'PAYE' },
  { id: 'cf-pensions', label: 'Pensions' },
  { id: 'cf-sa', label: 'Self Assessment' },
  { id: 'cf-links', label: 'Links and names' },
  { id: 'cf-record', label: 'Client record' },
  { id: 'cf-registers', label: 'Other registers' }
] as const

function Metric({ label, value, tone = 'normal' }: { label: string; value: string | number; tone?: 'normal' | 'alert' | 'quiet' }): JSX.Element {
  const colour = tone === 'alert' ? 'text-rose-300' : tone === 'quiet' ? 'text-white/55' : 'text-white/90'
  return (
    <div>
      <dt className="text-xs text-white/55">{label}</dt>
      <dd className={`text-lg font-light tabular-nums ${colour}`}>{value}</dd>
    </div>
  )
}

/**
 * Everything held about one client, register by register. Its deadlines,
 * issues, contacts, PAYE schemes, workplace pensions, Self Assessment
 * registration, links and other names are worked on here; the other registers
 * are shown as they are, each with a way into the Data screen.
 */
export function ClientFile(): JSX.Element {
  const navigateTo = useUiStore((s) => s.navigateTo)
  const motion = useMotionLevel()
  const target = useClientFileTarget((s) => s.clientRef)
  const setTarget = useClientFileTarget((s) => s.setClientRef)
  const openData = useDataTarget((s) => s.open)
  const openReferences = useReferenceTarget((s) => s.setClientRef)
  const openConversation = useCommsTarget((s) => s.open)
  const [clients, setClients] = useState<Client[]>([])
  const [file, setFile] = useState<ClientFileData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.api
      .getClients()
      .then(setClients)
      .catch((err: unknown) => setError(`The client list couldn’t be read: ${err instanceof Error ? err.message : String(err)}`))
  }, [])
  const picker = useMemo(() => pickerClients(clients), [clients])

  const load = useCallback(async () => {
    if (!target) {
      setFile(null)
      return
    }
    setError(null)
    setLoading(true)
    const f = await call(window.api.data.getClientFile(target), setError)
    setLoading(false)
    setFile(f)
  }, [target])

  useEffect(() => {
    void load()
  }, [load])

  const o = file?.overview
  const recordUtr = file?.record.find((r) => r.column === 'utr')?.value
  const jump = (id: string): void => {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: motion === 'none' ? 'auto' : 'smooth', block: 'start' })
    // Move focus there too, so the keyboard carries on from the part chosen.
    el.focus({ preventScroll: true })
  }

  return (
    <div className="mx-auto max-w-[96rem] space-y-6">
      <header>
        <h1 className="text-2xl font-light text-white/90">Client file</h1>
        <p className="mt-1 max-w-prose text-sm text-white/60">Everything held about one client, from every register, in one place.</p>
      </header>

      <Section title={o ? o.name : 'Choose a client'} description={o ? `Client code ${o.ref}${o.category ? ` — ${o.category.replace(/_/g, ' ')}` : ''}${o.status ? `, ${o.status}` : ''}` : undefined}>
        <ClientPicker clients={picker} onPick={(ref) => setTarget(ref)} />
      </Section>

      {error && <Notice tone="error">{error}</Notice>}
      {loading && !file && (
        <p className="text-sm text-white/55" aria-busy="true">
          Opening the client file…
        </p>
      )}
      {!target && !error && <p className="text-sm text-white/55">Find a client above, by name, code, other name or one of its references, to open its file.</p>}

      {file && o && (
        <>
          <nav aria-label="Parts of this client file" className="flex flex-wrap gap-1.5">
            {PARTS.map((p) => (
              <button key={p.id} type="button" className={smallButton} onClick={() => jump(p.id)}>
                {p.label}
              </button>
            ))}
          </nav>

          <Section
            title="At a glance"
            actions={
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={smallButton}
                  onClick={() => {
                    openConversation(o.ref)
                    navigateTo('communications')
                  }}
                  data-testid="client-file-conversation"
                >
                  Conversation
                </button>
                <button
                  type="button"
                  className={smallButton}
                  onClick={() => {
                    openReferences(o.ref)
                    navigateTo('references')
                  }}
                >
                  References and logins
                </button>
              </div>
            }
          >
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5" data-testid="client-file-glance">
              <Metric label="Open deadlines" value={o.openDeadlines} />
              <Metric label="Overdue" value={o.overdueDeadlines} tone={o.overdueDeadlines ? 'alert' : 'quiet'} />
              <Metric label="Next due" value={o.nextDueDate ? formatDate(o.nextDueDate) : '—'} tone={o.nextDueDate ? 'normal' : 'quiet'} />
              <Metric label="Open data issues" value={o.openIssues} tone={o.openIssues ? 'normal' : 'quiet'} />
              <Metric label="Assigned to" value={o.assignedTo || 'Nobody'} tone={o.assignedTo ? 'normal' : 'alert'} />
              <Metric label="Active services" value={o.activeServices} />
              <Metric label="Contacts" value={o.contacts} />
              <Metric label="Authorisations in place" value={o.activeAuthorisations} />
              <Metric label="Stored logins" value={o.storedLogins} />
              <Metric label="Other references" value={o.otherReferences} />
            </dl>
          </Section>

          <Section
            title="Briefing from the assistant"
            description="A short briefing on this client, written by the assistant on this computer: what needs doing, most urgent first, and anything at risk. It is given the client’s deadlines, money owed, AML, open issues and recent contact — never a password, tax reference or NI number."
          >
            <AssistantBriefing key={`b-${o.ref}`} request={{ kind: 'client', clientRef: o.ref }} testid="client-briefing" />
          </Section>

          <div id="cf-deadlines" tabIndex={-1} className="scroll-mt-6 focus:outline-none">
            <DeadlinesPanel key={`d-${o.ref}`} clientRef={o.ref} onChanged={() => void load()} />
          </div>
          <IssuesPanel key={`i-${o.ref}`} clientRef={o.ref} refresh={file} onChanged={() => void load()} />
          <div id="cf-contacts" tabIndex={-1} className="scroll-mt-6 focus:outline-none">
            <ContactsPanel key={`c-${o.ref}`} clientRef={o.ref} onChanged={() => void load()} />
          </div>
          <div id="cf-payroll" tabIndex={-1} className="scroll-mt-6 focus:outline-none">
            <PayrollPanel key={`p-${o.ref}`} clientRef={o.ref} onChanged={() => void load()} />
          </div>
          <div id="cf-pensions" tabIndex={-1} className="scroll-mt-6 focus:outline-none">
            <PensionsPanel key={`a-${o.ref}`} clientRef={o.ref} onChanged={() => void load()} />
          </div>
          <div id="cf-sa" tabIndex={-1} className="scroll-mt-6 focus:outline-none">
            <SelfAssessmentPanel key={`s-${o.ref}`} clientRef={o.ref} recordUtr={typeof recordUtr === 'string' ? recordUtr : null} onChanged={() => void load()} />
          </div>
          <div id="cf-links" tabIndex={-1} className="scroll-mt-6 focus:outline-none">
            <LinksPanel
              key={`l-${o.ref}`}
              clientRef={o.ref}
              clientName={o.name}
              clients={clients}
              onChanged={() => {
                void load()
                // Other names are searched, so the lists that search them are read again.
                void window.api.getClients().then(setClients).catch(() => undefined)
              }}
            />
          </div>

          <div id="cf-record" tabIndex={-1} className="scroll-mt-6 focus:outline-none">
            <Section title="Client record" description="The fields filled in on the client record. Older columns are marked: their information now lives in a register.">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
                {file.record.map((r) => (
                  <div key={r.column} className="min-w-0">
                    <dt className="text-xs text-white/55">
                      {r.label}
                      {r.supersededBy && (
                        <span title={`Older column: this information now lives in ${r.supersededBy}`} className="ml-1.5 rounded border border-white/20 px-1 text-[10px] text-white/55">
                          older
                        </span>
                      )}
                    </dt>
                    <dd className={`truncate text-sm ${r.supersededBy ? 'text-white/55' : 'text-white/85'}`} title={r.treatment === 'money' && typeof r.value === 'number' ? formatPence(r.value) : String(r.value)}>
                      {r.treatment === 'money' && typeof r.value === 'number' ? formatPence(r.value) : typeof r.value === 'number' ? r.value.toLocaleString('en-GB') : r.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          </div>

          <div id="cf-registers" tabIndex={-1} className="scroll-mt-6 space-y-6 focus:outline-none">
            {file.sections
              .map((s) => ({ ...s, pages: s.pages.filter((p) => !EDITED_HERE.has(p.table)) }))
              .filter((s) => s.pages.length > 0)
              .map((s) => (
                <Section key={s.domain} title={s.domainLabel}>
                  <div className="space-y-6">
                    {s.pages.map((p) => (
                      <div key={p.table}>
                        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                          <h3 className="text-sm text-white/80">
                            {p.label}
                            <span className="ml-2 text-xs text-white/55">{p.total > p.rows.length ? `first ${p.rows.length} of ${p.total}` : `${p.total} row${p.total === 1 ? '' : 's'}`}</span>
                          </h3>
                          <button
                            type="button"
                            className={smallButton}
                            aria-label={`Open ${p.label} in Data`}
                            onClick={() => {
                              openData(p.table, o.ref)
                              navigateTo('data')
                            }}
                          >
                            Open in Data
                          </button>
                        </div>
                        <RegisterTable page={p} />
                      </div>
                    ))}
                  </div>
                </Section>
              ))}
          </div>
        </>
      )}
    </div>
  )
}
