/**
 * The pieces the Client file's register panels share, so each reads and
 * behaves the same: loading, empty and error states; a short note when
 * something is saved; Change and Remove buttons named for what they change;
 * and text boxes that suggest the usual answers.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { IpcResult } from '@shared/types'
import { confirmAction } from '@renderer/components/ui/Confirm'
import { dangerButton, inputClass, Notice, smallButton } from '../references/ui'

/**
 * A panel's list: loaded on open, again whenever `key` changes (the client),
 * and after each change, with what went wrong and what was just done.
 */
export function usePanelList<T>(fetch: () => Promise<IpcResult<T>>, key: string): {
  data: T | null
  /** True once the first answer has come back (data can be null for "there is none"). */
  loaded: boolean
  error: string | null
  note: string | null
  setError: (message: string | null) => void
  reload: () => Promise<void>
  /** After a change: says what happened and reloads. */
  changed: (message: string) => Promise<void>
} {
  const [data, setData] = useState<T | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // The latest fetch, so a new function each render doesn't reload; `key` says when to.
  const latest = useRef(fetch)
  latest.current = fetch
  // Only the newest answer counts, should two be in flight at once.
  const ticket = useRef(0)
  const reload = useCallback(async () => {
    const mine = ++ticket.current
    try {
      const r = await latest.current()
      if (mine !== ticket.current) return
      if (r.ok) {
        setData(r.data)
        setLoaded(true)
        setError(null)
      } else setError(r.error)
    } catch (err) {
      if (mine === ticket.current) setError(err instanceof Error ? err.message : String(err))
    }
  }, [])
  useEffect(() => {
    setData(null)
    setLoaded(false)
    setNote(null)
    void reload()
  }, [key, reload])
  const changed = useCallback(
    async (message: string) => {
      setNote(message)
      await reload()
    },
    [reload]
  )
  return { data, loaded, error, note, setError, reload, changed }
}

/** What went wrong, and what was just done, at the top of a panel. */
export function PanelMessages({ error, note }: { error: string | null; note: string | null }): JSX.Element | null {
  if (!error && !note) return null
  return (
    <div className="mb-3 space-y-2">
      {error && <Notice tone="error">{error}</Notice>}
      {note && !error && (
        <p role="status" className="text-sm text-emerald-200/90">
          {note}
        </p>
      )}
    </div>
  )
}

/** Loading, empty, or the list itself. */
export function ListState({ loading, empty, emptyText, loadingText, children }: { loading: boolean; empty: boolean; emptyText: string; loadingText: string; children: ReactNode }): JSX.Element {
  if (loading) {
    return (
      <p className="text-sm text-white/55" aria-busy="true">
        {loadingText}
      </p>
    )
  }
  if (empty) return <p className="text-sm text-white/55">{emptyText}</p>
  return <>{children}</>
}

/**
 * Change and Remove for one row. Each button's name says which row it is for
 * ("Change PAYE scheme 123/AB45678"), so a screen reader reads more than
 * "Change, Change, Change". Remove asks first.
 */
export function RowButtons({
  what,
  onChange,
  onRemove,
  removeQuestion,
  removeDetail,
  removeLabel = 'Remove',
  extra,
  testid
}: {
  /** "PAYE scheme 123/AB45678". */
  what: string
  onChange?: () => void
  onRemove?: () => Promise<void> | void
  removeQuestion?: string
  removeDetail?: string
  removeLabel?: string
  extra?: ReactNode
  testid?: string
}): JSX.Element {
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1">
      {extra}
      {onChange && (
        <button type="button" className={smallButton} onClick={onChange} aria-label={`Change ${what}`} data-testid={testid ? `${testid}-change` : undefined}>
          Change
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          className={dangerButton}
          aria-label={`${removeLabel} ${what}`}
          data-testid={testid ? `${testid}-remove` : undefined}
          onClick={() =>
            void (async () => {
              if (await confirmAction({ title: removeQuestion ?? `Remove ${what}?`, body: removeDetail, confirm: removeLabel, tone: 'danger' })) await onRemove()
            })()
          }
        >
          {removeLabel}
        </button>
      )}
    </span>
  )
}

/** A text box that offers the usual answers and takes any other. */
export function SuggestInput({
  value,
  onChange,
  suggestions,
  mono = false,
  placeholder,
  testid,
  inputMode
}: {
  value: string
  onChange: (value: string) => void
  suggestions: readonly string[]
  mono?: boolean
  placeholder?: string
  testid?: string
  inputMode?: 'text' | 'numeric'
}): JSX.Element {
  const id = useId()
  return (
    <>
      <input
        className={`${inputClass}${mono ? ' font-mono' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={`${id}-list`}
        placeholder={placeholder}
        autoComplete="off"
        inputMode={inputMode}
        data-testid={testid}
      />
      <datalist id={`${id}-list`}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  )
}

/** "" → null, else the trimmed text. */
export const orNull = (s: string): string | null => (s.trim() ? s.trim() : null)

/** A whole number typed in a box, or null when it is blank; NaN when it isn't a number. */
export const countOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s.trim()))

/** A small label beside a row's name. */
export function Tag({ children, tone = 'quiet' }: { children: ReactNode; tone?: 'quiet' | 'warn' }): JSX.Element {
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[11px] ${tone === 'warn' ? 'border-amber-300/30 text-amber-100/90' : 'border-white/15 text-white/65'}`}>
      {children}
    </span>
  )
}
