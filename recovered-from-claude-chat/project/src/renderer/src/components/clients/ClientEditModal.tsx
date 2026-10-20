import React, { useId } from 'react'
import { Save, User, Phone, Mail, Building, Shield, FileText } from 'lucide-react'
import { GlassModal, GlassButton } from '@aether/index'
import type { AssignableUser, Client, ClientCategory } from '@shared/types'
import { CLIENT_CATEGORY_LABELS, CLIENT_CATEGORY_ICONS } from '@shared/types'
import { checkCompanyNumber, checkNino, checkUtr, checkVatNumber, type ReferenceCheckResult } from '@shared/references'
import { useClientStatuses } from '@renderer/components/forms/client-status'
import { GlassCheckbox, GlassField } from './glass-fields'

interface ClientEditModalProps {
  client: Client
  onClose: () => void
  onSave: (client: Client) => void | Promise<void>
}

const v = (val: string | number | null | undefined): string => (val == null ? '' : String(val))

/** What a typed reference looks like to the shared checks: nothing to say, or a gentle note. Saving is never blocked. */
export function referenceNote(value: string | null | undefined, check: (raw: string) => ReferenceCheckResult): string | undefined {
  const raw = (value ?? '').trim()
  if (!raw) return undefined
  const r = check(raw)
  if (!r.ok) return `${r.error} It will still be saved.`
  return r.warning
}

/** Edits a client's main details. References get a gentle check as they are typed; the full set is on the client file. */
export function ClientEditModal({ client, onClose, onSave }: ClientEditModalProps): JSX.Element {
  const [editingClient, setEditingClient] = React.useState<Client>({ ...client })
  const [saving, setSaving] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const statuses = useClientStatuses(client.status)
  const remarksId = useId()
  // Only partners and managers assign clients: for staff the list comes back empty and the field is read-only.
  const [people, setPeople] = React.useState<AssignableUser[]>([])
  React.useEffect(() => {
    window.api.getAssignableUsers().then(setPeople).catch(() => setPeople([]))
  }, [])

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!editingClient.client_name?.trim()) {
      setProblem('Enter the client’s name.')
      return
    }
    setProblem(null)
    setSaving(true)
    try {
      await onSave(editingClient)
    } finally {
      setSaving(false)
    }
  }

  const updateField = <K extends keyof Client>(field: K, value: Client[K]): void => {
    setEditingClient((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <GlassModal open={true} onClose={saving ? () => undefined : onClose} title={`Edit ${client.client_name}`} size="lg">
      <form onSubmit={handleSubmit} noValidate className="space-y-8 py-2" data-testid="edit-client">
        <div className="flex items-center gap-4">
          <div aria-hidden className="w-12 h-12 rounded-2xl bg-aether/10 flex items-center justify-center text-aether text-xl border border-aether/20">
            {CLIENT_CATEGORY_ICONS[editingClient.client_category]}
          </div>
          <div>
            <p className="text-lg font-light text-white tracking-tight">{editingClient.client_name || 'No name yet'}</p>
            <p className="text-xs text-white/60">
              {CLIENT_CATEGORY_LABELS[editingClient.client_category]}
              {editingClient.ref ? ` · ${editingClient.ref}` : ''}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="space-y-4" aria-labelledby="edit-who">
            <h3 id="edit-who" className="flex items-center gap-2 text-xs font-semibold text-aether pb-2 border-b border-white/10">
              <User aria-hidden size={12} /> Who they are
            </h3>
            <div className="space-y-3">
              <GlassField label="Client name" value={v(editingClient.client_name)} onChange={(val) => updateField('client_name', val)} required testid="edit-client-name" />
              <div className="grid grid-cols-2 gap-3">
                <GlassField label="Client code" value={v(editingClient.ref)} onChange={(val) => updateField('ref', val)} hint={client.ref ? 'Partners and managers can change it.' : undefined} />
                <GlassField label="Type of client" type="select" value={editingClient.client_category} onChange={(val) => updateField('client_category', val as ClientCategory)}>
                  {Object.entries(CLIENT_CATEGORY_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </GlassField>
              </div>
              <GlassField label="Trading name" value={v(editingClient.business_name)} onChange={(val) => updateField('business_name', val)} />
              <div className="grid grid-cols-2 gap-3">
                <GlassField label="Status" type="select" value={editingClient.status || 'Active'} onChange={(val) => updateField('status', val)} testid="edit-client-status">
                  {statuses.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </GlassField>
                {people.length > 0 ? (
                  <GlassField label="Assigned to" type="select" value={v(editingClient.assigned_to)} onChange={(val) => updateField('assigned_to', val || null)}>
                    <option value="">Nobody</option>
                    {client.assigned_to && !people.some((p) => p.name === client.assigned_to) && <option value={client.assigned_to}>{client.assigned_to} (no account here)</option>}
                    {people.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </GlassField>
                ) : (
                  <GlassField label="Assigned to" value={v(editingClient.assigned_to) || 'Nobody'} onChange={() => undefined} disabled hint="Partners and managers assign clients." />
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="edit-contact">
            <h3 id="edit-contact" className="flex items-center gap-2 text-xs font-semibold text-divine pb-2 border-b border-white/10">
              <Mail aria-hidden size={12} /> Contact
            </h3>
            <div className="space-y-3">
              <GlassField label="Contact name" value={v(editingClient.contact_name)} onChange={(val) => updateField('contact_name', val)} />
              <GlassField label="Email" type="email" value={v(editingClient.email)} onChange={(val) => updateField('email', val)} icon={<Mail aria-hidden size={12} />} />
              <GlassField label="Phone" type="tel" value={v(editingClient.phone)} onChange={(val) => updateField('phone', val)} icon={<Phone aria-hidden size={12} />} />
              <GlassField label="Director or main person" value={v(editingClient.director)} onChange={(val) => updateField('director', val)} />
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="edit-refs">
            <h3 id="edit-refs" className="flex items-center gap-2 text-xs font-semibold text-rose-200 pb-2 border-b border-white/10">
              <Shield aria-hidden size={12} /> Tax and company references
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <GlassField label="UTR" value={v(editingClient.utr)} onChange={(val) => updateField('utr', val)} hint={referenceNote(editingClient.utr, checkUtr)} testid="edit-client-utr" />
                <GlassField label="National Insurance number" value={v(editingClient.nino)} onChange={(val) => updateField('nino', val)} hint={referenceNote(editingClient.nino, checkNino)} />
              </div>
              <GlassField
                label="Company number"
                value={v(editingClient.reg_no)}
                onChange={(val) => updateField('reg_no', val)}
                icon={<Building aria-hidden size={12} />}
                hint={referenceNote(editingClient.reg_no, checkCompanyNumber)}
              />
              <div className="grid grid-cols-2 gap-3">
                <GlassField label="VAT number" value={v(editingClient.vat_no)} onChange={(val) => updateField('vat_no', val)} hint={referenceNote(editingClient.vat_no, checkVatNumber)} />
                <GlassField label="Corporation Tax reference" value={v(editingClient.ct_ref)} onChange={(val) => updateField('ct_ref', val)} />
              </div>
              <p className="text-[11px] text-white/55">Every other reference, and who can see it, is on the client file under References.</p>
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="edit-flags">
            <h3 id="edit-flags" className="flex items-center gap-2 text-xs font-semibold text-white/70 pb-2 border-b border-white/10">
              <FileText aria-hidden size={12} /> Paperwork and notes
            </h3>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <GlassCheckbox label="Engagement letter signed" checked={!!editingClient.engagement_letter} onChange={(val) => updateField('engagement_letter', val ? 1 : 0)} testid="edit-client-engagement" />
              <GlassCheckbox label="64-8 authority signed" checked={!!editingClient.signed_64_8} onChange={(val) => updateField('signed_64_8', val ? 1 : 0)} />
              <GlassCheckbox label="Dormant" checked={!!editingClient.dormant} onChange={(val) => updateField('dormant', val ? 1 : 0)} />
              <GlassCheckbox label="Audit needed" checked={!!editingClient.audit_required} onChange={(val) => updateField('audit_required', val ? 1 : 0)} />
            </div>
            <div className="pt-2">
              <label htmlFor={remarksId} className="text-[11px] font-semibold text-white/65 block mb-2">
                Notes
              </label>
              <textarea
                id={remarksId}
                value={v(editingClient.remarks)}
                onChange={(e) => updateField('remarks', e.target.value)}
                className="w-full h-24 bg-white/[0.03] border border-white/10 rounded-xl p-3 text-xs text-white/85 placeholder:text-white/45 focus:outline-none focus:border-aether/60 transition-colors resize-none"
                placeholder="Notes for the team"
              />
            </div>
          </section>
        </div>

        {problem && (
          <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {problem}
          </p>
        )}

        <div className="flex justify-end items-center gap-4 pt-6 border-t border-white/10">
          <GlassButton type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </GlassButton>
          <GlassButton variant="primary" type="submit" loading={saving} data-testid="edit-client-save">
            <Save aria-hidden size={14} className="mr-2" /> Save changes
          </GlassButton>
        </div>
      </form>
    </GlassModal>
  )
}
