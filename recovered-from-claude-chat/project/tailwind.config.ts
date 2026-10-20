import type { Config } from 'tailwindcss'

/** A colour held as "R G B" channels in a CSS variable (index.css), so `/50` opacity works with it. */
const channel = (name: string): string => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#050007',
        voidDeep: '#020003',
        aether: {
          DEFAULT: '#00F5E8',
          50: '#e6fffd',
          200: '#b3fbf6',
          500: '#00F5E8',
          700: '#00b8ad'
        },
        divine: {
          DEFAULT: '#F5D8A0',
          500: '#F5D8A0',
          700: '#c8ae76'
        },
        // The colour names many screens use (bg-card, text-muted-foreground,
        // border-border, bg-primary…). Defined in index.css for the dark theme.
        background: channel('background'),
        foreground: channel('foreground'),
        card: { DEFAULT: channel('card'), foreground: channel('card-foreground') },
        popover: { DEFAULT: channel('popover'), foreground: channel('popover-foreground') },
        primary: { DEFAULT: channel('primary'), foreground: channel('primary-foreground') },
        secondary: { DEFAULT: channel('secondary'), foreground: channel('secondary-foreground') },
        muted: { DEFAULT: channel('muted'), foreground: channel('muted-foreground') },
        accent: { DEFAULT: channel('accent'), foreground: channel('accent-foreground') },
        destructive: { DEFAULT: channel('destructive'), foreground: channel('destructive-foreground') },
        danger: channel('danger'),
        border: channel('border'),
        input: channel('input'),
        ring: channel('ring')
      },
      fontFamily: {
        sans: [
          'Inter',
          'SF Pro Display',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'system-ui',
          'sans-serif'
        ],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace']
      },
      boxShadow: {
        aether: '0 0 80px -20px rgba(0, 245, 232, 0.4)',
        divine: '0 0 120px -30px rgba(245, 216, 160, 0.35)'
      },
      backdropBlur: {
        '4xl': '80px',
        '5xl': '120px'
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scan-sweep': 'scan-sweep 3s linear infinite'
      },
      keyframes: {
        'scan-sweep': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' }
        }
      }
    }
  },
  plugins: []
} satisfies Config
