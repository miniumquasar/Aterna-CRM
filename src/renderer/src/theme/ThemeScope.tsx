/**
 * Draws its children in another colour theme or mode: the variables of that
 * palette are set on a wrapper, so the ordinary glass classes inside take
 * them up. Used for the live previews in Settings → Appearance and the
 * design gallery's side-by-side themes. Never use `dark:` classes inside a
 * scope; the scope says its own scheme.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { EffectsLevel } from '@shared/theme/appearance'
import { tokensFor, type PaletteId, type ResolvedMode } from '@shared/theme/palettes'
import { themeVariables } from '@shared/theme/variables'
import { cx } from '../lib/cx'
import { useTheme } from './context'

export interface ThemeScopeProps {
  palette: PaletteId
  mode: ResolvedMode
  /** Defaults to the current effects level. */
  effects?: EffectsLevel
  /** 'div' (default), or 'span' inside a button or other phrasing content (style it as a block). */
  as?: 'div' | 'span'
  className?: string
  style?: CSSProperties
  children?: ReactNode
  'aria-hidden'?: boolean
}

export function ThemeScope({ palette, mode, effects, as: Tag = 'div', className, style, children, 'aria-hidden': ariaHidden }: ThemeScopeProps): JSX.Element {
  const { prefs, reducedTransparency } = useTheme()
  const tokens = tokensFor(palette, mode)
  const vars = themeVariables(tokens, { effects: effects ?? prefs.effects, reduceTransparency: reducedTransparency })
  return (
    <Tag
      data-theme-scope
      data-mode={mode}
      data-scheme={tokens.scheme}
      data-palette={palette}
      aria-hidden={ariaHidden}
      className={cx('text-fg', className)}
      style={{ ...(vars as CSSProperties), colorScheme: tokens.scheme, ...style }}
    >
      {children}
    </Tag>
  )
}
