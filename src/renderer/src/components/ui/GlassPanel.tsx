import { forwardRef, useImperativeHandle, useRef, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { cx } from '../../lib/cx'
import { useSpecular } from './specular'

export type GlassTone = 'default' | 'raised' | 'sunken' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
export type GlassPadding = 'none' | 'sm' | 'md' | 'lg'

const TONE: Record<GlassTone, string> = {
  default: 'glass',
  raised: 'glass-raised',
  sunken: 'glass-sunken',
  accent: 'glass tint-accent',
  success: 'glass tint-success',
  warning: 'glass tint-warning',
  danger: 'glass tint-danger',
  info: 'glass tint-info'
}

/** Padding follows Settings → Appearance → Density (Compact takes a third off). */
const PADDING: Record<GlassPadding, string> = { none: 'p-0', sm: 'p-pad-sm', md: 'p-pad-md', lg: 'p-pad-lg' }

/** The footer's hairline runs edge to edge, so it steps out of the padding. */
export const FOOTER_BLEED: Record<GlassPadding, string> = { none: '', sm: '-mx-pad-sm px-pad-sm', md: '-mx-pad-md px-pad-md', lg: '-mx-pad-lg px-pad-lg' }

const RADIUS = { md: 'rounded-xl', lg: 'rounded-2xl', xl: 'rounded-2xl', '2xl': 'rounded-panel' } as const

/**
 * A glass surface: the base of every panel, card and section. On the main
 * panel it is a card (L2: raised glass on the panel); at the top level of
 * a screen with no panel (sign-in, setup) it is a panel of its own (L1).
 *
 * @prop as          The element to render: 'div' (default), 'section', 'article', 'aside', 'header', 'footer', 'nav', 'li', 'form'.
 * @prop tone        'default' glass, 'raised' (dialogs, menus), 'sunken' (wells), or a semantic tint: 'accent' | 'success' | 'warning' | 'danger' | 'info'.
 * @prop padding     'none' | 'sm' | 'md' (default) | 'lg'.
 * @prop interactive Lifts on hover and shows a pointer: for a surface that is itself clickable (give it a role and a key handler, or use a button inside).
 * @prop radius      Corner radius: 'md' (12px) | 'lg' (16px) | 'xl' (default, 16px) | '2xl' (24px, a primary panel).
 * @prop specular    A soft light follows the pointer across it (Full effects only): for a screen's one primary panel.
 * Every other HTML attribute passes through.
 */
export interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article' | 'aside' | 'header' | 'footer' | 'nav' | 'li' | 'form'
  tone?: GlassTone
  padding?: GlassPadding
  interactive?: boolean
  radius?: 'md' | 'lg' | 'xl' | '2xl'
  specular?: boolean
}

export const GlassPanel = forwardRef<HTMLElement, GlassPanelProps>(function GlassPanel(
  { as: Tag = 'div', tone = 'default', padding = 'md', interactive = false, radius = 'xl', specular = false, className, children, ...rest },
  ref
) {
  const own = useRef<HTMLElement>(null)
  useImperativeHandle(ref, () => own.current as HTMLElement)
  const lit = useSpecular(own, specular)
  const Element = Tag as 'div'
  return (
    <Element
      ref={own as Ref<HTMLDivElement>}
      className={cx(TONE[tone], PADDING[padding], RADIUS[radius], interactive && 'lift cursor-pointer', specular && 'relative isolate', className)}
      {...rest}
    >
      {lit && <span className="specular" aria-hidden />}
      {children}
    </Element>
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
 * @prop eyebrow      A small capitalised label above the heading ('APPEARANCE', as in the brief).
 * Plus every GlassPanel prop (tone, padding, interactive, as…).
 */
export interface GlassCardProps extends Omit<GlassPanelProps, 'title'> {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  headingLevel?: 2 | 3 | 4
  eyebrow?: ReactNode
}

export const GlassCard = forwardRef<HTMLElement, GlassCardProps>(function GlassCard(
  { title, subtitle, actions, footer, headingLevel = 3, eyebrow, children, padding = 'md', as = 'section', ...rest },
  ref
) {
  const Heading = `h${headingLevel}` as 'h3'
  const hasHeader = title !== undefined || subtitle !== undefined || actions !== undefined || eyebrow !== undefined
  return (
    <GlassPanel ref={ref} as={as} padding={padding} {...rest}>
      {hasHeader && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow !== undefined && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle">{eyebrow}</p>}
            {title !== undefined && <Heading className="text-[15px] font-semibold leading-6 tracking-[-0.005em] text-fg">{title}</Heading>}
            {subtitle !== undefined && <p className="mt-0.5 text-[13px] leading-5 text-fg-muted">{subtitle}</p>}
          </div>
          {actions !== undefined && (
            <div className="flex shrink-0 items-center gap-2" data-print="hide">
              {actions}
            </div>
          )}
        </header>
      )}
      {children}
      {footer !== undefined && <footer className={cx('hairline mt-5 border-t pt-4', FOOTER_BLEED[padding])}>{footer}</footer>}
    </GlassPanel>
  )
})
