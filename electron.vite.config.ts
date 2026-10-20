/**
 * Build configuration for the three Electron targets.
 *
 *   main      src/main/index.ts      → out/main/index.js     (Node, CommonJS)
 *   preload   src/preload/index.ts   → out/preload/index.js  (sandboxed, CommonJS)
 *   renderer  src/renderer/index.html → out/renderer/        (the React app)
 *
 * Path aliases match tsconfig.base.json and vitest.config.ts. Every runtime
 * dependency (the native SQLite module included) stays external to the main
 * bundle, so electron-builder ships the build that matches Electron's ABI.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }

const alias = {
  '@shared': resolve('src/shared'),
  '@main': resolve('src/main'),
  '@renderer': resolve('src/renderer/src')
}

/**
 * The page's Content-Security-Policy is strict (no inline script, no remote
 * connections). The Vite dev server needs an inline React Refresh preamble and
 * a websocket for hot reload, so in development only those two are allowed.
 */
function devContentSecurityPolicy(): Plugin {
  return {
    name: 'aeterna-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws://localhost:* http://localhost:*")
    }
  }
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      externalizeDeps: true,
      sourcemap: true
    }
  },
  preload: {
    resolve: { alias },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    build: {
      externalizeDeps: true
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias },
    plugins: [react(), devContentSecurityPolicy()],
    build: {
      sourcemap: false,
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') }
      }
    }
  }
})
