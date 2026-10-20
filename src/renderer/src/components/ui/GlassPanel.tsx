import { forwardRef, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { cx } from '../../lib/cx'

export type GlassTone = 'default' | 'raised' | 'sunken' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
export type GlassPadding = 'none' | 'sm' | 'md' | 'lg'

const TONE: Record<GlassTone, string> = {
  default: 'glass',
  raised: 'glass-raised',
  sunken: 'glass-sunken',
  accent: 'glass !border-accent/35 bg-accent/10',
  success: 'glass !border-success/35 bg-success/10',
  warning: 'glass !border-warning/35 bg-warning/10',
  danger: 'glass !border-danger/35 bg-danger/10',
  info: 'glass !border-info/35 bg-info/10'
}

const PADDING: Record<GlassPadding, string> = { none: 'p-0', sm: 'p-3', md: 'p-5', lg: 'p-7' }

/**
 * A glass surface: the base of every panel, card and section.
 *
 * @prop as          The element to render: 'div' (default), 'section', 'article', 'aside', 'header', 'footer', 'nav', 'li', 'form'.
 * @prop tone        'default' glass, 'raised' (dialogs, menus), 'sunken' (wells), or a semantic tint: 'accent' | 'success' | 'warning' | 'danger' | 'info'.
 * @prop padding     'none' | 'sm' | 'md' (default) | 'lg'.
 * @prop interactive Lifts on hover and shows a pointer: for a surface that is itself clickable (give it a role and a key handler, or use a button inside).
 * @prop radius      Corner radius: 'md' | 'lg' | 'xl' (default).
 * Every other HTML attribute passes through.
 */
export interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article' | 'aside' | 'header' | 'footer' | 'nav' | 'li' | 'form'
  tone?: GlassTone
  padding?: GlassPadding
  interactive?: boolean
  radius?: 'md' | 'lg' | 'xl'
}

export const GlassPanel = forwardRef<HTMLElement, GlassPanelProps>(function GlassPanel(
  { as: Tag = 'div', tone = 'default', padding = 'md', interactive = false, radius = 'xl', className, ...rest },
  ref
) {
  const Element = Tag as 'div'
  return (
    <Element
      ref={ref as Ref<HTMLDivElement>}
      className={cx(
        TONE[tone],
        PADDING[padding],
        radius === 'md' ? 'rounded-lg' : radius === 'lg' ? 'rounded-xl' : 'rounded-2xl',
        interactive && 'cursor-pointer transition duration-200 ease-glass hover:-translate-y-px hover:shadow-raised',
        className
      )}
      {...rest}
    />
  )
})

/**
 * A card: a glass panel with an optional header (title, subtitle, actions) and footer.
 *
 * @prop title        The card's heading.
 * @prop subtitle     A line under the heading.
 * @prop actions      Buttons at the header's right.
 * @prop footer       A row under the body, divided by a hairline.
 * @prop headingLevel The heading element: 2, 3 (default) or 4.
 * Plus every GlassPanel prop (tone, padding, interactive, as…).
 */
export interface GlassCardProps extends Omit<GlassPanelProps, 'title'> {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  headingLevel?: 2 | 3 | 4
}

export const GlassCard = forwardRef<HTMLElement, GlassCardProps>(function GlassCard(
  { title, subtitle, actions, footer, headingLevel = 3, children, padding = 'md', as = 'section', ...rest },
  ref
) {
  const Heading = `h${headingLevel}` as 'h3'
  const hasHeader = title !== undefined || subtitle !== undefined || actions !== undefined
  return (
    <GlassPanel ref={ref} as={as} padding={padding} {...rest}>
      {hasHeader && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title !== undefined && <Heading className="font-display text-[15px] font-semibold leading-6 text-fg">{title}</Heading>}
            {subtitle !== undefined && <p className="mt-0.5 text-[13px] text-fg-muted">{subtitle}</p>}
          </div>
          {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
      {footer !== undefined && <footer className="hairline -mx-5 mt-5 border-t px-5 pt-4">{footer}</footer>}
    </GlassPanel>
  )
})
