/**
 * Go to… (Ctrl+K): type part of a client's name or code, or a screen's
 * name; ↑ ↓ to move, Enter to open, Escape to close. Results come from the
 * providers in navigation/searchProviders.ts, in their order.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import type { Role } from '@shared/domain/roles'
import { cx } from '../../lib/cx'
import { SEARCH_PROVIDERS, type SearchContext, type SearchResult } from '../../navigation/searchProviders'
import { navigate } from '../../stores/router'
import { Dialog, Kbd } from '../ui'

interface Group {
  heading: string
  results: readonly SearchResult[]
}

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  role: Role
}

export function CommandPalette({ open, onClose, role }: CommandPaletteProps): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} label="Go to a client or a screen" placement="top" className="glass-raised max-w-xl overflow-hidden rounded-2xl">
      <PaletteBody onClose={onClose} role={role} />
    </Dialog>
  )
}

function PaletteBody({ onClose, role }: { onClose: () => void; role: Role }): JSX.Element {
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const ctx = useMemo<SearchContext>(() => ({ role, dev: import.meta.env.DEV, navigate: (id, params) => navigate(id, params) }), [role])

  useEffect(() => {
    let live = true
    const providers = SEARCH_PROVIDERS.filter((p) => query.trim().length >= p.minQueryLength)
    void Promise.all(
      providers.map(async (p) => {
        try {
          return { heading: p.heading, results: await p.search(query, ctx) }
        } catch {
          return { heading: p.heading, results: [] }
        }
      })
    ).then((found) => {
      if (!live) return
      setGroups(found.filter((g) => g.results.length > 0))
      setActive(0)
    })
    return () => {
      live = false
    }
  }, [query, ctx])

  const flat = groups.flatMap((g) => g.results)
  const choose = (result: SearchResult | undefined): void => {
    if (!result) return
    onClose()
    result.perform(ctx)
  }

  const onKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(flat.length - 1, i + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(flat[active])
    }
  }

  const offsets = groups.reduce<number[]>((acc, g, i) => [...acc, i === 0 ? 0 : acc[i - 1] + groups[i - 1].results.length], [])
  const activeId = flat[active] ? `${listId}-${flat[active].id}` : undefined
  return (
    <>
      <div className="hairline flex items-center gap-3 border-b px-4">
        <Search size={16} className="text-fg-subtle" aria-hidden />
        <input
          ref={input}
          data-autofocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="A client’s name or code, or a screen…"
          aria-label="Go to a client or a screen"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          className="h-12 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
          data-testid="palette-input"
        />
        <Kbd>Esc</Kbd>
      </div>
      <div id={listId} role="listbox" aria-label="Results" className="max-h-[55vh] overflow-y-auto p-2">
        {flat.length === 0 && <p className="px-3 py-8 text-center text-sm text-fg-muted">{query.trim() ? `Nothing matches “${query.trim()}”.` : 'Start typing to search.'}</p>}
        {groups.map((g, gi) => (
          <div key={g.heading} role="group" aria-label={g.heading}>
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle" aria-hidden>
              {g.heading}
            </p>
            {g.results.map((r, ri) => {
              const i = offsets[gi] + ri
              const selected = i === active
              const Icon = r.icon ?? ArrowRight
              return (
                <div
                  key={r.id}
                  id={`${listId}-${r.id}`}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(r)}
                  className={cx('flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2', selected ? 'bg-accent/15 text-fg' : 'text-fg-muted')}
                >
                  <Icon size={16} aria-hidden className={selected ? 'text-accent-text' : 'text-fg-subtle'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{r.title}</span>
                    {r.subtitle && <span className="block truncate text-xs text-fg-subtle">{r.subtitle}</span>}
                  </span>
                  {r.hint && <span className="text-[11px] text-fg-subtle">{r.hint}</span>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <p className="hairline border-t px-4 py-2 text-[11px] text-fg-subtle">↑ ↓ to move · Enter to open · Esc to close</p>
    </>
  )
}
