import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Search, User } from 'lucide-react'
import type { Client } from '@shared/types'
import { useAuthStore } from '@renderer/stores/crm/auth'
import { useDataStore } from '@renderer/stores/crm/data'
import { useMotionLevel } from '@renderer/lib/motion'
import { openClient } from '@renderer/lib/open-client'
import { navTargets, type NavTarget } from '@renderer/navigation/nav'
import { rankClients, rankScreens } from '@renderer/navigation/search'
import { noLongerLabel } from '@shared/client-status'
import type { NavRoute } from '@renderer/navigation/routes'

type Item = { kind: 'client'; key: string; client: Client } | { kind: 'screen'; key: string; target: NavTarget }

/**
 * Go to… (⌘K or Ctrl+K): type part of a client's name, code, trading name,
 * company number or one of their other names (a maiden name, a former company
 * name), or the name of a screen, then Enter. Arrow keys move through the
 * results; Escape closes.
 */
export function GoToPalette({ open, onClose, onNavigate }: { open: boolean; onClose: () => void; onNavigate: (route: NavRoute) => void }): JSX.Element {
  const role = useAuthStore((s) => s.user?.role)
  const clients = useDataStore((s) => s.clients)
  const fetchClients = useDataStore((s) => s.fetchClients)
  const motionLevel = useMotionLevel()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement | null
    setQuery('')
    setActive(0)
    void fetchClients()
    requestAnimationFrame(() => inputRef.current?.focus())
    return () => returnFocus.current?.focus?.()
  }, [open, fetchClients])

  const targets = useMemo(() => navTargets(role), [role])
  const items: Item[] = useMemo(() => {
    const found = rankClients(clients, query, 8).map((client): Item => ({ kind: 'client', key: `c${client.id}`, client }))
    const screens = rankScreens(targets, query, query ? 6 : 8).map((target): Item => ({ kind: 'screen', key: `s${target.route}`, target }))
    // With a name typed, clients first; with nothing typed, just the screens.
    return query.trim() ? [...found, ...screens] : screens
  }, [clients, query, targets])

  useEffect(() => setActive(0), [query])

  const choose = (item: Item | undefined): void => {
    if (!item) return
    onClose()
    if (item.kind === 'client') openClient(item.client)
    else onNavigate(item.target.route)
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(items[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Tab') {
      e.preventDefault() // the palette keeps focus until it closes
    }
  }

  const listId = 'goto-results'
  const activeId = items[active] ? `goto-${items[active].key}` : undefined
  const animate = motionLevel !== 'none'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center px-6 pt-[12vh]"
          initial={animate ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={animate ? { opacity: 0 } : undefined}
          transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Go to a client or screen"
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#0d0a12]/95 shadow-2xl"
            initial={animate ? { y: -8, scale: 0.98 } : false}
            animate={{ y: 0, scale: 1 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex items-center gap-3 border-b border-white/10 px-4">
              <Search size={16} className="text-white/40" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder="A client’s name, code, company number or other name, or a screen…"
                aria-label="Go to a client or a screen"
                className="h-12 flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/50 focus:outline-none"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={activeId}
                aria-autocomplete="list"
                data-testid="goto-input"
              />
              <kbd className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-white/40">Esc</kbd>
            </div>
            <ul id={listId} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
              {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-white/40">Nothing matches “{query}”.</li>}
              {items.map((item, i) => {
                const selected = i === active
                const first = i === 0 || items[i - 1].kind !== item.kind
                return (
                  <li key={item.key} role="presentation">
                    {first && (
                      <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.2em] text-white/30" aria-hidden>
                        {item.kind === 'client' ? 'Clients' : 'Screens'}
                      </p>
                    )}
                    <div
                      id={`goto-${item.key}`}
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(item)}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm ${selected ? 'bg-aether/10 text-aether' : 'text-white/75'}`}
                    >
                      {item.kind === 'client' ? (
                        <>
                          <User size={14} className="flex-shrink-0 opacity-60" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">
                            {item.client.client_name}
                            {noLongerLabel(item.client) && <span className="ml-2 rounded-full border border-white/15 px-1.5 text-[11px] text-white/65">{noLongerLabel(item.client)}</span>}
                          </span>
                          <span className="font-mono text-[11px] text-white/40">{item.client.ref ?? 'no code'}</span>
                        </>
                      ) : (
                        <>
                          <ArrowRight size={14} className="flex-shrink-0 opacity-60" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{item.target.title}</span>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="border-t border-white/10 px-4 py-2 text-[11px] text-white/35">↑ ↓ to move · Enter to open · a client opens in its client file</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
