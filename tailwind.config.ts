/**
 * Tailwind reads every colour from the theme's CSS variables (set by the
 * renderer's ThemeProvider from src/shared/theme/palettes.ts), so
 * `bg-accent/15` follows the chosen theme and mode. The default colour
 * palette is replaced, not extended: there is no `bg-red-500` to reach for.
 */
import type { Config } from 'tailwindcss'

const channel = (name: string): string => `rgb(var(--${name}) / <alpha-value>)`

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
      surface: { DEFAULT: channel('surface'), raised: channel('surface-raised') },
      line: channel('border'),
      highlight: channel('highlight'),
      shadow: channel('shadow'),
      fg: { DEFAULT: channel('text'), muted: channel('text-muted'), subtle: channel('text-subtle') },
      accent: { DEFAULT: channel('accent'), fg: channel('on-accent'), text: channel('accent-text') },
      accent2: channel('accent-2'),
      success: channel('success'),
      warning: channel('warning'),
      danger: channel('danger'),
      info: channel('info'),
      focus: channel('focus'),
      chart: {
        1: channel('chart-1'),
        2: channel('chart-2'),
        3: channel('chart-3'),
        4: channel('chart-4'),
        5: channel('chart-5'),
        6: channel('chart-6'),
        7: channel('chart-7'),
        8: channel('chart-8')
      }
    },
    extend: {
      fontFamily: {
        sans: ['"Segoe UI Variable Text"', '"Segoe UI"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        display: ['"Segoe UI Variable Display"', '"Segoe UI"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"Cascadia Mono"', 'Consolas', '"SF Mono"', 'Menlo', 'monospace']
      },
      boxShadow: {
        glass: 'inset 0 1px 0 0 rgb(var(--highlight) / var(--highlight-alpha)), 0 1px 2px 0 rgb(var(--shadow) / 0.08), 0 12px 32px -16px rgb(var(--shadow) / 0.35)',
        raised: 'inset 0 1px 0 0 rgb(var(--highlight) / var(--highlight-alpha)), 0 24px 64px -24px rgb(var(--shadow) / 0.55)',
        focus: '0 0 0 2px rgb(var(--focus) / 0.9)'
      },
      transitionTimingFunction: {
        glass: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'dialog-in': { from: { opacity: '0', transform: 'translateY(6px) scale(0.985)' }, to: { opacity: '1', transform: 'none' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } }
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out both',
        'dialog-in': 'dialog-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'toast-in': 'toast-in 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both'
      }
    }
  },
  plugins: []
} satisfies Config
