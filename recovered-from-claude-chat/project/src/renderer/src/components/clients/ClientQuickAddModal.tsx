import React from 'react'
import { UserPlus, Mail, Phone } from 'lucide-react'
import { GlassModal, GlassButton } from '@aether/index'
import type { Client, ClientCategory } from '@shared/types'
import { CLIENT_CATEGORY_LABELS } from '@shared/types'
import { useClientStatuses } from '@renderer/components/forms/client-status'
import { GlassField } from './glass-fields'

interface ClientQuickAddModalProps {
  onClose: () => void
  onSave: (data: Partial<Client>) => void | Promise<void>
}

const v = (val: string | number | null | undefined): string => (val == null ? '' : String(val))

/** Adds a client with the few details needed to start: the full record is filled in on the client file. */
export function ClientQuickAddModal({ onClose, onSave }: ClientQuickAddModalProps): JSX.Element {
  const [newClient, setNewClient] = React.useState<Partial<Client>>({
    client_name: '',
    status: 'Active',
    client_category: 'company',
    email: '',
    phone: '',
    ref: ''
  })
  const [saving, setSaving] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const statuses = useClientStatuses(newClient.status)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!newClient.client_name?.trim()) {
      setProblem('Enter the client’s name.')
      return
    }
    setProblem(null)
    setSaving(true)
    try {
      await onSave({ ...newClient, client_name: newClient.client_name.trim(), ref: newClient.ref?.trim() || null })
    } finally {
      setSaving(false)
    }
  }

  const updateField = <K extends keyof Client>(field: K, value: Client[K]): void => {
    setNewClient((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <GlassModal open={true} onClose={saving ? () => undefined : onClose} title="Add a client" size="md">
      <form onSubmit={handleSubmit} noValidate className="space-y-6 py-2" data-testid="quick-add-client">
        <div className="space-y-4">
          <GlassField label="Client name" value={v(newClient.client_name)} onChange={(val) => updateField('client_name', val)} required autoFocus testid="quick-add-name" />

          <div className="grid grid-cols-2 gap-4">
            <GlassField label="Type of client" type="select" value={newClient.client_category || 'company'} onChange={(val) => updateField('client_category', val as ClientCategory)}>
              {Object.entries(CLIENT_CATEGORY_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </GlassField>
            <GlassField label="Client code" hint="Leave empty to add it later." value={v(newClient.ref)} onChange={(val) => updateField('ref', val)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <GlassField label="Status" type="select" value={newClient.status || 'Active'} onChange={(val) => updateField('status', val)}>
              {statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </GlassField>
            <GlassField label="Email" type="email" value={v(newClient.email)} onChange={(val) => updateField('email', val)} icon={<Mail aria-hidden size={12} />} />
          </div>

          <GlassField label="Phone" type="tel" value={v(newClient.phone)} onChange={(val) => updateField('phone', val)} icon={<Phone aria-hidden size={12} />} />
        </div>

        {problem && (
          <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {problem}
          </p>
        )}

        <div className="flex justify-end items-center gap-3 pt-6 border-t border-white/5">
          <GlassButton type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </GlassButton>
          <GlassButton variant="primary" type="submit" loading={saving} data-testid="quick-add-save">
            <UserPlus aria-hidden size={14} className="mr-2" /> Add client
          </GlassButton>
        </div>
      </form>
    </GlassModal>
  )
}
