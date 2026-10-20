import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cx } from '../../lib/cx'

export interface TabItem {
  id: string
  label: string
  icon?: LucideIcon
  /** A count or status beside the label. */
  badge?: ReactNode
  disabled?: boolean
}

/**
 * Tabs (role="tablist"): ← → Home End move between tabs and show them.
 * `children` is the chosen tab's panel.
 *
 * @prop tabs      The tabs.
 * @prop value     The chosen tab's id.
 * @prop onChange  Called with a tab's id.
 * @prop label     The tab list's name for screen readers ('Client file').
 * @prop variant   'line' (default, under a header) or 'pill' (inside a card).
 * @prop idBase    Prefix for the tab and panel ids, when they must be stable.
 */
export interface TabsProps {
  tabs: readonly TabItem[]
  value: string
  onChange: (id: string) => void
  label: string
  variant?: 'line' | 'pill'
  idBase?: string
  className?: string
  panelClassName?: string
  children?: ReactNode
}

export function Tabs({ tabs, value, onChange, label, variant = 'line', idBase, className, panelClassName, children }: TabsProps): JSX.Element {
  const auto = useId()
  const base = idBase ?? `tabs-${auto}`
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const enabled = tabs.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0)
  const current = Math.max(0, tabs.findIndex((t) => t.id === value))

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, from: number): void => {
    let next: number | undefined
    const at = enabled.indexOf(from)
    if (event.key === 'ArrowRight') next = enabled[(at + 1) % enabled.length]
    else if (event.key === 'ArrowLeft') next = enabled[(at - 1 + enabled.length) % enabled.length]
    else if (event.key === 'Home') next = enabled[0]
    else if (event.key === 'End') next = enabled[enabled.length - 1]
    if (next === undefined) return
    event.preventDefault()
    onChange(tabs[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className={cx('scroll-strip flex gap-1', variant === 'line' ? 'hairline border-b' : 'glass-sunken inline-flex rounded-xl p-1')}>
        {tabs.map((t, i) => {
          const selected = i === current
          const Icon = t.icon
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el
              }}
              id={`${base}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              disabled={t.disabled}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cx(
                'inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[13px] font-medium transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-40',
                variant === 'line'
                  ? cx('-mb-px rounded-t-lg border-b-2 px-3 py-2.5', selected ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg')
                  : cx('rounded-lg px-3 py-1.5', selected ? 'bg-surface-raised text-fg shadow-glass' : 'text-fg-muted hover:text-fg')
              )}
            >
              {Icon && <Icon size={15} aria-hidden strokeWidth={1.9} />}
              {t.label}
              {t.badge !== undefined && <span className="text-xs text-fg-subtle">{t.badge}</span>}
            </button>
          )
        })}
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${tabs[current]?.id ?? ''}`} tabIndex={0} className={cx('outline-none', panelClassName ?? 'pt-5')}>
        {children}
      </div>
    </div>
  )
}
