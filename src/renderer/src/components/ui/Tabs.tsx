import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
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
 * `children` is the chosen tab's panel. When the tabs don't fit, the strip
 * scrolls sideways: the chosen tab is kept in view, the cut-off end fades,
 * and a chevron at that end scrolls it (for a mouse with no sideways wheel).
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
  const strip = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  // Which ends are cut off, as the strip is resized or scrolled.
  useEffect(() => {
    const el = strip.current
    if (!el) return
    const measure = (): void => {
      const start = el.scrollLeft > 1
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      setEdges((e) => (e.start === start && e.end === end ? e : { start, end }))
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    return () => {
      observer?.disconnect()
      el.removeEventListener('scroll', measure)
    }
  }, [])

  // Keep the chosen tab in view, scrolling only the strip (never the page).
  useEffect(() => {
    const el = strip.current
    const tab = refs.current[current]
    if (!el || !tab) return
    const s = el.getBoundingClientRect()
    const t = tab.getBoundingClientRect()
    if (t.left < s.left) el.scrollLeft -= s.left - t.left + 32
    else if (t.right > s.right) el.scrollLeft += t.right - s.right + 32
  }, [current])

  const scrollStrip = (direction: -1 | 1): void => {
    const el = strip.current
    if (!el) return
    const behavior = document.documentElement.dataset.motion === 'reduce' ? 'auto' : 'smooth'
    el.scrollBy({ left: direction * Math.max(120, el.clientWidth * 0.7), behavior })
  }
  // Fade whichever end is cut off.
  const mask: CSSProperties | undefined =
    edges.start || edges.end
      ? {
          maskImage: `linear-gradient(to right, ${edges.start ? 'transparent, #000 2.5rem' : '#000'}, ${edges.end ? '#000 calc(100% - 2.5rem), transparent' : '#000'})`
        }
      : undefined

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
      <div className={cx('relative', variant === 'pill' && 'inline-flex max-w-full')}>
        <div
          ref={strip}
          role="tablist"
          aria-label={label}
          style={mask}
          className={cx('scroll-strip flex gap-1', variant === 'line' ? 'hairline border-b' : 'glass-sunken inline-flex rounded-xl p-[3px]')}
        >
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
                  'inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[13px] font-medium transition-colors duration-150',
                  'focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-40',
                  variant === 'line'
                    ? cx('-mb-px rounded-t-lg border-b-2 px-3 py-2.5', selected ? 'border-accent-text text-fg' : 'border-transparent text-fg-muted hover:border-line/25 hover:text-fg')
                    : cx('rounded-[9px] px-3 py-1.5', selected ? 'segment-on' : 'text-fg-muted hover:bg-fg/[0.05] hover:text-fg')
                )}
              >
                {Icon && <Icon size={15} aria-hidden strokeWidth={1.9} className={selected ? 'text-accent-text' : undefined} />}
                {t.label}
                {t.badge !== undefined && <span className="tabular rounded-full bg-fg/[0.07] px-1.5 text-[11px] leading-[18px] text-fg-muted">{t.badge}</span>}
              </button>
            )
          })}
        </div>
        {(['start', 'end'] as const).map((end) =>
          edges[end] ? (
            <button
              key={end}
              type="button"
              tabIndex={-1}
              aria-label={end === 'start' ? 'Show earlier tabs' : 'Show more tabs'}
              onClick={() => scrollStrip(end === 'start' ? -1 : 1)}
              className={cx(
                'glass-raised absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-fg-muted transition-colors hover:text-fg',
                end === 'start' ? 'left-0' : 'right-0'
              )}
            >
              {end === 'start' ? <ChevronLeft size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
            </button>
          ) : null
        )}
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${tabs[current]?.id ?? ''}`} tabIndex={0} className={cx('outline-none', panelClassName ?? 'pt-5')}>
        {children}
      </div>
    </div>
  )
}
