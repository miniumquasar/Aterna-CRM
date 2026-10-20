/**
 * The calm frame around signing in, choosing a new password and joining
 * from an invitation: the backdrop, the window's title bar, one glass card
 * in the middle with the product mark, and the Day / Night switch beneath.
 * Owned by the auth domain.
 */
import type { ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { PRODUCT_NAME } from '@shared/product'
import { BrandMark } from '@renderer/components/layout/BrandMark'
import { ModeSwitch } from '@renderer/components/layout/ModeSwitch'
import { GlassPanel } from '@renderer/components/ui'

export interface AuthCardProps {
  /** The card's id, for its heading. */
  id: string
  /** A small line above the heading. */
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  /** Quiet links under the card's body, divided by a hairline. */
  links?: ReactNode
}

export function AuthLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="relative flex h-full flex-col">
      <div className="app-backdrop" aria-hidden />
      <header className="titlebar relative z-10 flex shrink-0 items-center gap-2.5 pl-5">
        <BrandMark size={22} />
        <span className="font-display text-[13px] font-semibold tracking-[0.18em] text-fg">{PRODUCT_NAME}</span>
      </header>
      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-8">
        <div className="my-auto flex w-full max-w-[25rem] flex-col items-center gap-6">
          {children}
          <div className="flex flex-col items-center gap-3">
            <ModeSwitch />
            <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
              <ShieldCheck size={13} aria-hidden />
              Everything stays on this PC.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

/** The glass card with the mark, the heading and the body. */
export function AuthCard({ id, eyebrow, title, subtitle, children, links }: AuthCardProps): JSX.Element {
  return (
    <GlassPanel tone="raised" padding="none" as="section" aria-labelledby={id} className="w-full overflow-hidden">
      <div className="px-8 pb-7 pt-8">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="relative flex items-center justify-center" aria-hidden>
            <span className="absolute h-20 w-20 rounded-full bg-accent/25 blur-2xl" />
            <span className="relative">
              <BrandMark size={52} />
            </span>
          </span>
          {eyebrow && <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-subtle">{eyebrow}</p>}
          <h1 id={id} className={eyebrow ? 'mt-1.5 font-display text-[22px] font-semibold leading-tight text-fg' : 'mt-5 font-display text-[22px] font-semibold leading-tight text-fg'}>
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
      {links && <div className="hairline flex flex-wrap items-center justify-center gap-x-1 gap-y-1 border-t bg-fg/[0.025] px-6 py-3">{links}</div>}
    </GlassPanel>
  )
}

/** A short note in the card: why the person is here, or what stopped them. */
export function AuthNotice({
  tone,
  icon: Icon,
  title,
  children,
  alert = false,
  strong = false
}: {
  tone: 'info' | 'warning' | 'danger'
  icon: typeof ShieldCheck
  title?: string
  children: ReactNode
  alert?: boolean
  /** The message itself in full-strength text (it says everything; there is no title). */
  strong?: boolean
}): JSX.Element {
  return (
    <GlassPanel tone={tone} padding="sm" radius="lg" role={alert ? 'alert' : 'status'} className="mb-5 flex items-start gap-3">
      <Icon size={18} aria-hidden className={tone === 'info' ? 'mt-0.5 shrink-0 text-info' : tone === 'warning' ? 'mt-0.5 shrink-0 text-warning' : 'mt-0.5 shrink-0 text-danger'} />
      <div className="min-w-0 text-[13px] leading-5 text-fg">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5 text-fg-muted' : strong ? 'font-medium text-fg' : 'text-fg-muted'}>{children}</div>
      </div>
    </GlassPanel>
  )
}
