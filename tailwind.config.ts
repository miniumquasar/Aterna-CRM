/**
 * Tailwind reads every colour from the theme's CSS variables (set by the
 * renderer's ThemeProvider from src/shared/theme/palettes.ts), so
 * `bg-accent/15` follows the chosen theme and mode. The default colour
 * palette is replaced, not extended: there is no `bg-red-500` to reach for.
 *
 *   surface, surface-raised, surface-sunken, surface-selected
 *                the glass layers made opaque (for anything that must not let
 *                content through: sticky bars, the skip link). Glass itself is
 *                the .glass, .glass-raised and .glass-sunken classes.
 *   line, line-strong   hairline colours (`border-line/20`); the tokens' own
 *                strength is the .hairline and .hairline-strong classes.
 *   fg, fg-muted, fg-subtle (= fg-faint)   the three text levels.
 *   accent, -hover, -active, -fg (text on the accent), -text (the accent as
 *                text on glass), -soft (the selection tint), -from / -to
 *                (the gradient ends); accent2.
 *   success, warning, danger, info, each with -soft (its pill tint).
 *   chart-1…8 (categorical), seq-1…5 (sequential), div-1…5 (diverging).
 */
import type { Config } from 'tailwindcss'

const channel = (name: string): string => `rgb(var(--${name}) / <alpha-value>)`

/**
 * A translucent token: its own alpha, times any opacity modifier (bg-accent-soft,
 * bg-success-soft/50). Tailwind calls a colour given as a function with the
 * opacity; its types only admit strings, hence the cast.
 */
const translucent = (name: string): string =>
  (({ opacityValue }: { opacityValue?: string }): string =>
    opacityValue === undefined || opacityValue === '1' ? `rgb(var(--${name}) / var(--${name}-alpha))` : `rgb(var(--${name}) / calc(var(--${name}-alpha) * ${opacityValue}))`) as unknown as string

const steps = (prefix: string, n: number): Record<string, string> => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), channel(`${prefix}-${i + 1}`)]))

const UI_FONT = ['InterVariable', 'Inter', '"Segoe UI Variable Text"', '"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif']

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-scheme="dark"]'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      white: '#ffffff',
      black: '#000000',
      window: channel('window'),
      surface: { DEFAULT: channel('solid-surface'), raised: channel('solid-raised'), sunken: channel('solid-sunken'), selected: channel('solid-selected') },
      line: { DEFAULT: channel('border'), strong: channel('border-strong') },
      highlight: channel('highlight'),
      shadow: channel('shadow'),
      fg: { DEFAULT: channel('text'), muted: channel('text-muted'), subtle: channel('text-subtle'), faint: channel('text-faint') },
      accent: {
        DEFAULT: channel('accent'),
        hover: channel('accent-hover'),
        active: channel('accent-active'),
        fg: channel('on-accent'),
        text: channel('accent-text'),
        soft: translucent('accent-soft'),
        from: channel('accent-gradient-from'),
        to: channel('accent-gradient-to')
      },
      accent2: channel('accent-2'),
      success: { DEFAULT: channel('success'), soft: translucent('success-soft') },
      warning: { DEFAULT: channel('warning'), soft: translucent('warning-soft') },
      danger: { DEFAULT: channel('danger'), soft: translucent('danger-soft') },
      info: { DEFAULT: channel('info'), soft: translucent('info-soft') },
      focus: channel('focus'),
      chart: steps('chart', 8),
      seq: steps('chart-seq', 5),
      div: steps('chart-div', 5)
    },
    extend: {
      fontFamily: {
        sans: UI_FONT,
        /** Inter's display cut (it switches optical size by itself at larger sizes). */
        display: UI_FONT,
        /** Source Serif 4: page titles, client file headers and empty-state headlines only. */
        serif: ['"Source Serif 4"', 'Georgia', '"Times New Roman"', 'serif'],
        mono: ['"Cascadia Mono"', 'Consolas', '"SF Mono"', 'Menlo', 'monospace']
      },
      borderRadius: {
        panel: '24px',
        card: '16px',
        control: '12px'
      },
      boxShadow: {
        glass: 'var(--inner-highlight), var(--glass-depth)',
        raised: 'var(--inner-highlight), var(--elev-1), var(--elev-pop)',
        focus: '0 0 0 2px rgb(var(--focus) / 0.9)'
      },
      spacing: {
        row: 'var(--row-h)',
        'pad-sm': 'var(--pad-sm)',
        'pad-md': 'var(--pad-md)',
        'pad-lg': 'var(--pad-lg)'
      },
      transitionTimingFunction: {
        glass: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'dialog-in': { from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' }, to: { opacity: '1', transform: 'none' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(10px) scale(0.98)' }, to: { opacity: '1', transform: 'none' } },
        'pop-in': { from: { opacity: '0', transform: 'translateY(-4px) scale(0.98)' }, to: { opacity: '1', transform: 'none' } },
        'rise-in': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } }
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out both',
        'dialog-in': 'dialog-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'toast-in': 'toast-in 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'pop-in': 'pop-in 160ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'rise-in': 'rise-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        shimmer: 'shimmer 1.6s linear infinite'
      }
    }
  },
  plugins: []
} satisfies Config
