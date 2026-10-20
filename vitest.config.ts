/**
 * Tests run under Electron's own Node (npm test → scripts/electron-node.mjs),
 * so the native SQLite build serves both the app and the tests.
 *
 * The default environment is Node. A renderer test that needs the DOM opts in
 * with a first-line comment: // @vitest-environment jsdom
 */
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  esbuild: {
    jsx: 'automatic'
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    restoreMocks: true,
    testTimeout: 20_000,
    hookTimeout: 20_000
  }
})
