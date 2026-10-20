import { useCallback, useEffect, useState } from 'react'
import { create } from 'zustand'
import type { EmailSendResult, EmailStatus } from '@shared/types'
import { unfilled } from '@renderer/lib/placeholders'
import { Modal } from '@renderer/components/ui/Modal'

/** How "Send" behaves (the mail app, or sending from the app), shared by every screen. */
const useEmailStatusStore = create<{ status: EmailStatus | null; load: () => Promise<void> }>((set) => ({
  status: null,
  load: async () => {
    try {
      set({ status: await window.api.email.status() })
    } catch {
      /* not signed in yet */
    }
  }
}))

/** Reloads the shared status (after the email settings change). */
export const refreshEmailStatus = (): Promise<void> => useEmailStatusStore.getState().load()

export function useEmailStatus(): EmailStatus | null {
  const status = useEmailStatusStore((s) => s.status)
  useEffect(() => {
    if (!status) void useEmailStatusStore.getState().load()
  }, [status])
  return status
}

export interface EmailDraft {
  clientRef?: string | null
  to: string
  cc?: string
  subject: string
  body: string
  templateKey?: string | null
}

/** What happened, in a sentence for a toast. */
export function sentence(r: EmailSendResult): string {
  if (!r.success) return r.error
  if (r.status === 'opened') {
    return r.onClipboard
      ? 'Opened in your mail app. The message was too long to pass across, so it is on the clipboard: paste it into the email.'
      : 'Opened in your mail app — check it and send it from there.'
  }
  return 'Sent.'
}

const field = 'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 focus:border-aether/50 focus:outline-none'

/**
 * One way to send email from any screen. With the mail app (the default),
 * `compose` opens the message there at once. When the practice sends from the
 * app (SMTP, Microsoft 365, Resend), it first shows the message to check —
 * who it goes to, from whom — and sends only when "Send" is pressed.
 */
/** `onDone` gets the result, or null when the person cancelled. */
export function useEmailSender(onDone: (result: EmailSendResult | null) => void): {
  status: EmailStatus | null
  /** "Open in mail app" or "Send email…" */
  actionLabel: string
  compose: (draft: EmailDraft) => Promise<void>
  dialog: JSX.Element | null
} {
  const status = useEmailStatus()
  const [draft, setDraft] = useState<EmailDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(
    async (d: EmailDraft): Promise<EmailSendResult> =>
      window.api.email.send({ clientRef: d.clientRef ?? null, to: d.to, cc: d.cc || undefined, subject: d.subject, body: d.body, templateKey: d.templateKey ?? null }),
    []
  )

  const compose = useCallback(
    async (d: EmailDraft): Promise<void> => {
      const s = status ?? (await window.api.email.status().catch(() => null))
      if (!s || !s.sendsDirectly) {
        onDone(await send(d))
        return
      }
      setError(s.ready ? null : `Email isn’t set up: ${s.problem ?? 'see Settings → Email'}.`)
      setDraft(d)
    },
    [status, send, onDone]
  )

  const submit = async (): Promise<void> => {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      const r = await send(draft)
      if (r.success) {
        setDraft(null)
        onDone(r)
      } else setError(r.logId ? `${r.error} (Recorded in the client’s messages as not sent.)` : r.error)
    } finally {
      setBusy(false)
    }
  }

  const blanks = draft ? unfilled(`${draft.subject}\n${draft.body}`) : []
  const cancel = (): void => {
    setDraft(null)
    onDone(null)
  }
  const dialog = draft && status ? (
    <Modal open onClose={busy ? undefined : cancel} labelledBy="send-email-title" width="max-w-2xl" className="max-h-[92vh] space-y-4 overflow-y-auto text-white">
        <div>
          <h2 id="send-email-title" className="text-xl font-light">Send this email?</h2>
          <p className="mt-1 text-sm text-white/55">From {status.from}</p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-white/60">
          To
          <input className={field} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} autoComplete="off" data-testid="send-email-to" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-white/60">
          Cc (optional)
          <input className={field} value={draft.cc ?? ''} onChange={(e) => setDraft({ ...draft, cc: e.target.value })} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-white/60">
          Subject
          <input className={field} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-white/60">
          Message
          <textarea className={`${field} min-h-[12rem] leading-relaxed`} rows={10} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
        </label>
        {blanks.length > 0 && (
          <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-50" data-testid="send-email-blanks">
            Still to fill in: {blanks.join(', ')}. Edit the message above before sending.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => void submit()} disabled={busy || !status.ready || !draft.to.trim()} className="rounded-xl bg-aether/90 px-5 py-2 text-sm font-medium text-black hover:bg-aether disabled:opacity-50" data-testid="send-email-go">
            {busy ? 'Sending…' : blanks.length ? 'Send as it is' : 'Send'}
          </button>
          <button type="button" onClick={cancel} disabled={busy} className="ml-auto rounded-xl px-4 py-2 text-sm text-white/60 hover:text-white">
            Cancel
          </button>
        </div>
    </Modal>
  ) : null

  return { status, actionLabel: status?.sendsDirectly ? 'Send email…' : 'Open in mail app', compose, dialog }
}
