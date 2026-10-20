import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * The top of every screen: the screen's one h1, a line about it, and its
 * main actions at the right. `children` sits underneath (tabs, filters).
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
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="glass flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-accent-text" aria-hidden>
              <Icon size={20} strokeWidth={1.8} />
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">{eyebrow}</p>}
            <h1 className="truncate font-display text-[26px] font-semibold leading-tight tracking-tight text-fg">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </header>
  )
}
