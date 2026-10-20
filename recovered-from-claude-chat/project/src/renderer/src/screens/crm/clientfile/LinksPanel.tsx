import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { AliasType, Client, ClientAlias, ClientRelationship, LookupValue, RelationshipInput } from '@shared/types'
import { ALIAS_TYPE_LABELS } from '@shared/types'
import { ClientCombobox } from '@renderer/components/forms/ClientCombobox'
import { FormDialog } from '@renderer/components/forms/FormDialog'
import { openClient } from '@renderer/lib/open-client'
import { useDataStore } from '@renderer/stores/crm/data'
import { call, Field, inputClass, Section, smallButton } from '../references/ui'
import { ListState, orNull, PanelMessages, RowButtons, usePanelList } from './panel-kit'

/** The practice's kinds of link, with the usual ones when the list hasn't loaded. */
const FALLBACK_KINDS: Array<Pick<LookupValue, 'value_key' | 'label'>> = [
  { value_key: 'director_of', label: 'Director of' },
  { value_key: 'shareholder_of', label: 'Shareholder of' },
  { value_key: 'connected_to', label: 'Connected to' },
  { value_key: 'spouse_or_partner', label: 'Spouse / partner' },
  { value_key: 'group_member', label: 'Group member' }
]

/** Links that read the same both ways round (as the main process treats them). */
const BOTH_WAYS = new Set(['connected_to', 'spouse_or_partner', 'group_member'])

/**
 * A link as a sentence from this client's point of view: "Director of Alpha
 * Ltd", "Alpha Ltd is a director of this client", "Connected to Alpha Ltd".
 */
export function linkSentence(type: string, label: string, direction: 'outgoing' | 'incoming', other: string): string {
  switch (type) {
    case 'director_of':
      return direction === 'outgoing' ? `Director of ${other}` : `${other} is a director of this client`
    case 'shareholder_of':
      return direction === 'outgoing' ? `Shareholder of ${other}` : `${other} is a shareholder of this client`
    case 'connected_to':
      return `Connected to ${other}`
    case 'spouse_or_partner':
      return `Spouse or partner of ${other}`
    case 'group_member':
      return `In the same group as ${other}`
    default:
      return direction === 'outgoing' ? `${label} ${other}` : `${other} is ${label.toLowerCase()} this client`
  }
}

/** "Gamma Ltd is a director of Alpha Ltd": one way round of a link, for choosing which. */
export function linkStatement(type: string, label: string, subject: string, object: string): string {
  if (type === 'director_of') return `${subject} is a director of ${object}`
  if (type === 'shareholder_of') return `${subject} is a shareholder of ${object}`
  return `${subject} is ${label.toLowerCase()} ${object}`
}

interface LinkDraft {
  id: number | null
  other: string | null
  type: string
  direction: 'outgoing' | 'incoming'
  basis: string
}

function LinkDialog({ clientRef, clientName, clients, kinds, initial, onClose, onSaved }: {
  clientRef: string
  clientName: string
  clients: readonly Client[]
  kinds: ReadonlyArray<Pick<LookupValue, 'value_key' | 'label'>>
  initial: LinkDraft
  onClose: () => void
  onSaved: (message: string) => void
}): JSX.Element {
  const [d, setD] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const others = useMemo(() => clients.filter((c) => c.ref && c.ref !== clientRef), [clients, clientRef])
  const kind = kinds.find((k) => k.value_key === d.type)
  const otherName = others.find((c) => c.ref === d.other)?.client_name ?? 'the other client'
  const save = async (): Promise<void> => {
    setError(null)
    if (!d.other) return setError('Choose the other client.')
    const input: RelationshipInput = {
      ...(d.id === null ? {} : { id: d.id }),
      client_ref: clientRef,
      other_client_ref: d.other,
      relationship_type: d.type,
      direction: BOTH_WAYS.has(d.type) ? 'outgoing' : d.direction,
      basis: orNull(d.basis)
    }
    setBusy(true)
    const r = await window.api.registers.saveRelationship(input)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onSaved(d.id === null ? 'Link added.' : 'Link saved.')
  }
  return (
    <FormDialog open title={d.id === null ? 'Link to another client' : 'Change the link'} onClose={onClose} onSubmit={save} submitLabel={d.id === null ? 'Add link' : 'Save'} busy={busy} error={error} testid="link-dialog">
      <ClientCombobox clients={others} value={d.other} onChange={(ref) => setD({ ...d, other: ref })} label="The other client" testid="link-other" />
      <Field label="How they are linked">
        <select className={inputClass} value={d.type} onChange={(e) => setD({ ...d, type: e.target.value })} data-testid="link-type">
          {kinds.map((k) => (
            <option key={k.value_key} value={k.value_key}>
              {k.label}
            </option>
          ))}
          {!kinds.some((k) => k.value_key === d.type) && <option value={d.type}>{d.type}</option>}
        </select>
      </Field>
      {!BOTH_WAYS.has(d.type) && (
        <fieldset className="space-y-2 rounded-xl border border-white/10 p-3">
          <legend className="px-1 text-xs text-white/60">Which way round</legend>
          {(['outgoing', 'incoming'] as const).map((dir) => (
            <label key={dir} className="flex items-start gap-2 text-sm text-white/80">
              <input type="radio" name="link-direction" className="mt-1" checked={d.direction === dir} onChange={() => setD({ ...d, direction: dir })} />
              <span>
                {dir === 'outgoing'
                  ? linkStatement(d.type, kind?.label ?? d.type, clientName, otherName)
                  : linkStatement(d.type, kind?.label ?? d.type, otherName, clientName)}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <Field label="How you know" hint="A Companies House appointment, the client told us, the share register…">
        <input className={inputClass} value={d.basis} onChange={(e) => setD({ ...d, basis: e.target.value })} />
      </Field>
    </FormDialog>
  )
}

function AliasDialog({ clientRef, initial, onClose, onSaved }: { clientRef: string; initial: { id: number | null; alias: string; alias_type: AliasType }; onClose: () => void; onSaved: (message: string) => void }): JSX.Element {
  const [d, setD] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (): Promise<void> => {
    setError(null)
    if (!d.alias.trim()) return setError('Write the other name.')
    setBusy(true)
    const r = await window.api.registers.saveAlias({ ...(d.id === null ? { client_ref: clientRef } : { id: d.id }), alias: d.alias.trim(), alias_type: d.alias_type })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onSaved(`“${r.data.alias}” ${d.id === null ? 'added' : 'saved'}.`)
  }
  return (
    <FormDialog open title={d.id === null ? 'Add another name' : initial.alias} onClose={onClose} onSubmit={save} submitLabel={d.id === null ? 'Add name' : 'Save'} busy={busy} error={error} testid="alias-dialog">
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Field label="Name">
          <input className={inputClass} value={d.alias} onChange={(e) => setD({ ...d, alias: e.target.value })} data-testid="alias-name" />
        </Field>
        <Field label="Kind">
          <select className={inputClass} value={d.alias_type} onChange={(e) => setD({ ...d, alias_type: e.target.value as AliasType })}>
            {(Object.keys(ALIAS_TYPE_LABELS) as AliasType[]).map((t) => (
              <option key={t} value={t}>
                {ALIAS_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </FormDialog>
  )
}

/** How the client is linked to other clients, and the other names it goes by. */
export function LinksPanel({ clientRef, clientName, clients, onChanged }: { clientRef: string; clientName: string; clients: readonly Client[]; onChanged?: () => void }): JSX.Element {
  const links = usePanelList(() => window.api.registers.getRelationships(clientRef), [clientRef])
  const names = usePanelList(() => window.api.registers.getAliases(clientRef), [clientRef])
  const [kinds, setKinds] = useState<ReadonlyArray<Pick<LookupValue, 'value_key' | 'label'>>>(FALLBACK_KINDS)
  const [link, setLink] = useState<LinkDraft | null>(null)
  const [alias, setAlias] = useState<{ id: number | null; alias: string; alias_type: AliasType } | null>(null)
  useEffect(() => {
    void call(window.api.registers.getLookups('relationship_type'), () => undefined).then((l) => l && l.length > 0 && setKinds(l))
  }, [])
  const labelOf = (type: string): string => kinds.find((k) => k.value_key === type)?.label ?? type
  const done = async (message: string, which: 'links' | 'names'): Promise<void> => {
    setLink(null)
    setAlias(null)
    await (which === 'links' ? links : names).changed(message)
    // Go to… and the client pickers find clients by their other names: give them the new ones now.
    if (which === 'names') void useDataStore.getState().fetchClients(true)
    onChanged?.()
  }
  const otherRef = (r: ClientRelationship): string => (r.direction === 'outgoing' ? r.to_client_ref : r.from_client_ref)

  return (
    <Section
      title="Links and other names"
      description="How this client is linked to other clients, and the other names it goes by. Go to… and the client pickers find a client by its other names too."
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm text-white/85">Linked clients</h3>
            <button
              type="button"
              className={`${smallButton} inline-flex items-center gap-1`}
              onClick={() => setLink({ id: null, other: null, type: kinds[0]?.value_key ?? 'connected_to', direction: 'outgoing', basis: '' })}
              data-testid="link-new"
            >
              <Plus size={12} aria-hidden /> Link to another client
            </button>
          </div>
          <PanelMessages error={links.error} note={links.note} />
          <ListState loading={!links.loaded && !links.error} empty={(links.data ?? []).length === 0} loadingText="Loading links…" emptyText="Not linked to another client.">
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10" data-testid="client-links">
              {(links.data ?? []).map((r) => {
                const ref = otherRef(r)
                const visible = r.other_client_name !== null
                const other = r.other_client_name ?? `a client you don’t work on (${ref})`
                const sentence = linkSentence(r.relationship_type, labelOf(r.relationship_type), r.direction, other)
                return (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="text-white/85">{sentence}</p>
                      {r.basis && <p className="text-xs text-white/55">{r.basis}</p>}
                    </div>
                    {visible && (
                      <RowButtons
                        what={`the link: ${sentence}`}
                        extra={
                          <button type="button" className={smallButton} onClick={() => openClient({ id: 0, ref })} aria-label={`Open ${other}`}>
                            Open
                          </button>
                        }
                        onChange={() => setLink({ id: r.id, other: ref, type: r.relationship_type, direction: r.direction, basis: r.basis ?? '' })}
                        removeQuestion="Remove this link?"
                        removeDetail={`${sentence}. The two clients themselves aren’t changed.`}
                        onRemove={async () => {
                          const res = await window.api.registers.deleteRelationship(r.id, clientRef)
                          if (!res.ok) links.setError(res.error)
                          else await done('Link removed.', 'links')
                        }}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </ListState>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm text-white/85">Other names</h3>
            <button type="button" className={`${smallButton} inline-flex items-center gap-1`} onClick={() => setAlias({ id: null, alias: '', alias_type: 'trading_as' })} data-testid="alias-new">
              <Plus size={12} aria-hidden /> Add another name
            </button>
          </div>
          <PanelMessages error={names.error} note={names.note} />
          <ListState loading={!names.loaded && !names.error} empty={(names.data ?? []).length === 0} loadingText="Loading other names…" emptyText="No other names.">
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10" data-testid="client-aliases">
              {(names.data ?? []).map((a: ClientAlias) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 text-white/85">
                    {a.alias}
                    <span className="ml-2 text-xs text-white/55">{ALIAS_TYPE_LABELS[a.alias_type as AliasType] ?? a.alias_type}</span>
                  </span>
                  <RowButtons
                    what={`the name ${a.alias}`}
                    onChange={() => setAlias({ id: a.id, alias: a.alias, alias_type: (a.alias_type in ALIAS_TYPE_LABELS ? a.alias_type : 'also_known_as') as AliasType })}
                    removeQuestion={`Remove “${a.alias}”?`}
                    removeDetail="Searches stop finding the client by this name."
                    onRemove={async () => {
                      const res = await window.api.registers.deleteAlias(a.id)
                      if (!res.ok) names.setError(res.error)
                      else await done(`“${a.alias}” removed.`, 'names')
                    }}
                  />
                </li>
              ))}
            </ul>
          </ListState>
        </div>
      </div>
      {link && (
        <LinkDialog clientRef={clientRef} clientName={clientName} clients={clients} kinds={kinds} initial={link} onClose={() => setLink(null)} onSaved={(m) => void done(m, 'links')} />
      )}
      {alias && <AliasDialog clientRef={clientRef} initial={alias} onClose={() => setAlias(null)} onSaved={(m) => void done(m, 'names')} />}
    </Section>
  )
}
