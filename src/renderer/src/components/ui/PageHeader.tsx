import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * The top of every screen: the screen's one h1 (in Source Serif 4, the only
 * place with the client file headers that uses it), a line about it, and
 * its main actions at the right. `children` sits underneath (tabs, filters).
 *
 * @prop title     The screen's name.
 * @prop subtitle  A line about it, or a count.
 * @prop eyebrow   A small line above the title (the group, a client code).
 * @prop icon      A lucide icon beside the title.
 * @prop actions   Buttons at the right (the main one last).
 */
export interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  eyebrow?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
  children?: ReactNode
}

export function PageHeader({ title, subtitle, eyebrow, icon: Icon, actions, children }: PageHeaderProps): JSX.Element {
  return (
    <header className="mb-[var(--gap-section)]">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-3.5">
          {Icon && (
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-accent-soft text-accent-text shadow-[inset_0_1px_0_0_rgb(var(--highlight)/var(--highlight-alpha))]"
              aria-hidden
            >
              <Icon size={21} strokeWidth={1.7} />
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-muted">{eyebrow}</p>}
            <h1 className="truncate font-serif text-[30px] font-semibold leading-[1.15] tracking-[-0.015em] text-fg">{title}</h1>
            {subtitle && <p className="mt-1 text-sm leading-5 text-fg-muted">{subtitle}</p>}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2" data-print="hide">
            {actions}
          </div>
        )}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </header>
  )
}
