import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Plus } from 'lucide-react'
import type { Task } from '@shared/types'
import { useAuthStore } from '@renderer/stores/crm/auth'
import { dayText, todayIso } from '@renderer/lib/dates'
import { openClient } from '@renderer/lib/open-client'
import { ClientCombobox } from '@renderer/components/forms/ClientCombobox'
import { FormDialog, primaryButton } from '@renderer/components/forms/FormDialog'
import { PersonSelect, useClientOptions, usePeople } from '@renderer/components/forms/people'
import { confirmAction } from '@renderer/components/ui/Confirm'
import { dangerButton, Field, inputClass, Notice, smallButton } from './references/ui'

export const PRIORITY_LABELS: Record<Task['priority'], string> = { urgent: 'Urgent', high: 'High', medium: 'Normal', low: 'Low' }
export const TASK_STATUS_LABELS: Record<Task['status'], string> = { pending: 'Not started', in_progress: 'In progress', completed: 'Done', cancelled: 'Cancelled' }

const isOpen = (t: Pick<Task, 'status'>): boolean => t.status === 'pending' || t.status === 'in_progress'
const daysUntil = (date: string, today: string): number => Math.round((Date.parse(`${date.slice(0, 10)}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000)

/** Where an open task sits on the list: the four headings, soonest first. */
export type TaskGroup = 'overdue' | 'today' | 'week' | 'later'
export const GROUP_LABELS: Record<TaskGroup, string> = { overdue: 'Overdue', today: 'Due today', week: 'In the next 7 days', later: 'Later' }

export function groupOf(due: string | null, today: string): TaskGroup {
  if (!due || !/^\d{4}-\d{2}-\d{2}/.test(due)) return 'later'
  const d = daysUntil(due, today)
  return d < 0 ? 'overdue' : d === 0 ? 'today' : d <= 7 ? 'week' : 'later'
}

/** "3 days overdue", "Due today", "In 4 days", "12 Nov 2026". */
export function dueWords(due: string | null, today: string): string {
  if (!due || !/^\d{4}-\d{2}-\d{2}/.test(due)) return 'No date'
  const d = daysUntil(due, today)
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`
  if (d === 0) return 'Due today'
  if (d <= 7) return `In ${d} day${d === 1 ? '' : 's'}`
  return dayText(due.slice(0, 10))
}

type Whose = 'all' | 'mine' | 'nobody'

interface Draft {
  id: number | null
  description: string
  client_ref: string | null
  assigned_to: string | null
  due_date: string
  priority: Task['priority']
  status: Task['status']
  notes: string
}

const newDraft = (me: string | null): Draft => ({ id: null, description: '', client_ref: null, assigned_to: me, due_date: todayIso(), priority: 'medium', status: 'pending', notes: '' })
const draftFrom = (t: Task): Draft => ({
  id: t.id,
  description: t.description,
  client_ref: t.client_ref,
  assigned_to: t.assigned_to,
  due_date: (t.due_date ?? '').slice(0, 10),
  priority: t.priority,
  status: t.status,
  notes: t.notes ?? ''
})

function TaskDialog({ draft, onChange, onClose, onSaved }: { draft: Draft; onChange: (d: Draft) => void; onClose: () => void; onSaved: (message: string) => void }): JSX.Element {
  const { clients } = useClientOptions()
  const people = usePeople()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => onChange({ ...draft, [key]: value })

  const save = async (): Promise<void> => {
    setError(null)
    if (!draft.description.trim()) return setError('Describe the task.')
    if (!draft.due_date) return setError('Choose the date the task is due.')
    const values: Partial<Task> = {
      description: draft.description.trim(),
      client_ref: draft.client_ref,
      assigned_to: draft.assigned_to,
      due_date: draft.due_date,
      priority: draft.priority,
      status: draft.status,
      notes: draft.notes.trim() || null
    }
    setBusy(true)
    const res = draft.id === null ? await window.api.createTask(values) : await window.api.updateTask(draft.id, values)
    setBusy(false)
    if (!res.success) return setError(res.error || 'The task couldn’t be saved.')
    onSaved(draft.id === null ? 'Task added.' : 'Task saved.')
  }

  const remove = async (): Promise<void> => {
    if (draft.id === null) return
    if (!(await confirmAction({ title: 'Delete this task?', body: draft.description, confirm: 'Delete task', tone: 'danger' }))) return
    setBusy(true)
    const res = await window.api.deleteTask(draft.id)
    setBusy(false)
    if (!res.success) return setError(res.error || 'The task couldn’t be deleted.')
    onSaved('Task deleted.')
  }

  return (
    <FormDialog
      open
      title={draft.id === null ? 'New task' : 'Task'}
      onClose={onClose}
      onSubmit={save}
      submitLabel={draft.id === null ? 'Add task' : 'Save'}
      busy={busy}
      error={error}
      testid="task-dialog"
      actions={
        draft.id !== null ? (
          <button type="button" className={dangerButton} onClick={() => void remove()} disabled={busy}>
            Delete
          </button>
        ) : undefined
      }
    >
      <Field label="What needs doing">
        <input className={inputClass} value={draft.description} onChange={(e) => set('description', e.target.value)} maxLength={500} data-testid="task-description" />
      </Field>
      <ClientCombobox clients={clients} value={draft.client_ref} onChange={(ref) => set('client_ref', ref)} allowNone noneLabel="No client: a practice task" testid="task-client" />
      <div className="grid gap-3 sm:grid-cols-2">
        <PersonSelect label="Who is doing it" value={draft.assigned_to} onChange={(v) => set('assigned_to', v)} people={people} />
        <Field label="Due">
          <input type="date" className={inputClass} value={draft.due_date} onChange={(e) => set('due_date', e.target.value)} data-testid="task-due" />
        </Field>
        <Field label="Priority">
          <select className={inputClass} value={draft.priority} onChange={(e) => set('priority', e.target.value as Task['priority'])}>
            {(['urgent', 'high', 'medium', 'low'] as const).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Where it stands">
          <select className={inputClass} value={draft.status} onChange={(e) => set('status', e.target.value as Task['status'])}>
            {(['pending', 'in_progress', 'completed', 'cancelled'] as const).map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Notes">
        <textarea className={`${inputClass} min-h-[4rem]`} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormDialog>
  )
}

function TaskRow({ task, today, onDone, onChange }: { task: Task; today: string; onDone: (t: Task) => void; onChange: (t: Task) => void }): JSX.Element {
  const late = isOpen(task) && groupOf(task.due_date, today) === 'overdue'
  const done = task.status === 'completed'
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3" data-testid="task-row">
      <button
        type="button"
        onClick={() => onDone(task)}
        aria-pressed={done}
        aria-label={done ? `Mark “${task.description}” not done` : `Mark “${task.description}” done`}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${done ? 'border-emerald-400/60 bg-emerald-400/20 text-emerald-200' : 'border-white/30 text-transparent hover:border-aether/60'}`}
      >
        <Check size={13} aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${done ? 'text-white/55 line-through' : 'text-white/90'}`}>{task.description}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/60">
          {task.client_ref ? (
            <button type="button" className="text-aether/90 underline-offset-2 hover:underline" onClick={() => openClient({ id: 0, ref: task.client_ref })}>
              {task.client_name ?? task.client_ref}
            </button>
          ) : (
            <span>Practice task</span>
          )}
          <span className={late ? 'inline-flex items-center gap-1 text-rose-200' : undefined}>
            {late && <AlertTriangle size={11} aria-hidden />}
            {dueWords(task.due_date, today)}
          </span>
          <span>{task.assigned_to ?? 'Nobody yet'}</span>
          {task.status === 'in_progress' && <span>In progress</span>}
          {task.status === 'cancelled' && <span>Cancelled</span>}
          {(task.priority === 'urgent' || task.priority === 'high') && !done && (
            <span className={task.priority === 'urgent' ? 'text-amber-200' : 'text-white/70'}>{PRIORITY_LABELS[task.priority]}</span>
          )}
        </p>
      </div>
      <button type="button" className={smallButton} onClick={() => onChange(task)} aria-label={`Change “${task.description}”`}>
        Change
      </button>
    </li>
  )
}

/**
 * Work → Tasks: what needs doing, grouped by when — overdue, today, the next
 * seven days, later — with done ones out of the way. Staff see their own
 * clients' tasks and those given to them.
 */
export function Tasks(): JSX.Element {
  const me = useAuthStore((s) => s.user)
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [whose, setWhose] = useState<Whose>('all')
  const [showDone, setShowDone] = useState(false)
  const [editing, setEditing] = useState<Draft | null>(null)

  const load = useCallback(async () => {
    try {
      setTasks(await window.api.getTasks())
      setError(null)
    } catch (err) {
      setError(`The tasks couldn’t be read: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const today = todayIso()
  const myName = (me?.name ?? '').trim().toLowerCase()
  const shown = useMemo(
    () => (tasks ?? []).filter((t) => (whose === 'all' ? true : whose === 'mine' ? (t.assigned_to ?? '').trim().toLowerCase() === myName : !t.assigned_to)),
    [tasks, whose, myName]
  )
  const open = shown.filter(isOpen)
  const closed = shown.filter((t) => !isOpen(t))
  const groups = (Object.keys(GROUP_LABELS) as TaskGroup[]).map((g) => ({ g, rows: open.filter((t) => groupOf(t.due_date, today) === g) })).filter((x) => x.rows.length)

  const changed = async (message: string): Promise<void> => {
    setEditing(null)
    setNote(message)
    await load()
  }
  const toggleDone = async (t: Task): Promise<void> => {
    const res = await window.api.updateTask(t.id, { status: t.status === 'completed' ? 'pending' : 'completed' })
    if (!res.success) setError(res.error || 'The task couldn’t be changed.')
    else await changed(t.status === 'completed' ? `“${t.description}” is open again.` : `“${t.description}” done.`)
  }

  return (
    <div className="max-w-6xl space-y-5" data-testid="tasks-screen">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Whose tasks">
          {(
            [
              ['all', 'Everything I can see'],
              ['mine', 'Given to me'],
              ['nobody', 'Nobody’s yet']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={whose === value}
              onClick={() => setWhose(value)}
              className={`rounded-lg border px-3 py-2 text-xs ${whose === value ? 'border-aether/50 bg-aether/[0.1] text-white' : 'border-white/10 text-white/65 hover:border-white/20'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className={`${primaryButton} inline-flex items-center gap-1.5`} onClick={() => setEditing(newDraft(me?.name ?? null))} data-testid="task-new">
          <Plus size={14} aria-hidden /> New task
        </button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {note && !error && (
        <p role="status" className="text-sm text-emerald-200/90">
          {note}
        </p>
      )}

      {tasks === null && !error ? (
        <p className="text-sm text-white/55" aria-busy="true">
          Reading the tasks…
        </p>
      ) : tasks !== null && open.length === 0 ? (
        <Notice>{whose === 'mine' ? 'Nothing open is given to you.' : whose === 'nobody' ? 'Every open task is with someone.' : 'Nothing open. New tasks show here, soonest first.'}</Notice>
      ) : (
        groups.map(({ g, rows }) => (
          <section key={g} aria-labelledby={`tasks-${g}`}>
            <h2 id={`tasks-${g}`} className={`mb-2 flex items-center gap-1.5 text-sm ${g === 'overdue' ? 'text-rose-200' : 'text-white/80'}`}>
              {g === 'overdue' && <AlertTriangle size={13} aria-hidden />}
              {GROUP_LABELS[g]} <span className="text-white/55">({rows.length})</span>
            </h2>
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
              {rows.map((t) => (
                <TaskRow key={t.id} task={t} today={today} onDone={(x) => void toggleDone(x)} onChange={(x) => setEditing(draftFrom(x))} />
              ))}
            </ul>
          </section>
        ))
      )}

      {closed.length > 0 && (
        <div>
          <button type="button" className="text-xs text-aether/90 underline-offset-2 hover:underline" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Hide' : 'Show'} done and cancelled ({closed.length})
          </button>
          {showDone && (
            <ul className="mt-2 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]" data-testid="tasks-done">
              {closed.map((t) => (
                <TaskRow key={t.id} task={t} today={today} onDone={(x) => void toggleDone(x)} onChange={(x) => setEditing(draftFrom(x))} />
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && <TaskDialog draft={editing} onChange={setEditing} onClose={() => setEditing(null)} onSaved={(m) => void changed(m)} />}
    </div>
  )
}
