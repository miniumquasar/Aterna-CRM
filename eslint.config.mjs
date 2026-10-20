// ESLint: typescript-eslint's recommended rules and React's hooks rules,
// plus the architecture's boundaries (docs/ARCHITECTURE.md), so a wrong
// import fails the lint rather than a review.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

const noRecovered = {
  group: ['**/recovered-from-claude-chat/**'],
  message: 'Port from recovered-from-claude-chat/; never import from it.'
}

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'out/**', 'release/**', 'dist/**', 'coverage/**', 'test-results/**', 'recovered-from-claude-chat/**', 'docs/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'always' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-restricted-imports': ['error', { patterns: [noRecovered] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'off'
    }
  },
  // Node code: main, preload, shared, tools, tests, scripts and configs.
  {
    files: ['src/main/**', 'src/preload/**', 'src/shared/**', 'tools/**', 'scripts/**', 'e2e/**', 'tests/**', '*.config.*', 'eslint.config.mjs'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    files: ['postcss.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } }
  },
  // The renderer: browser code, React hooks rules, and no reaching into main or Electron.
  {
    files: ['src/renderer/**/*.{ts,tsx}', 'tests/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'electron', message: 'The renderer reaches the main process only through lib/api.ts.' },
            { name: 'better-sqlite3-multiple-ciphers', message: 'The renderer never touches the database.' }
          ],
          patterns: [
            noRecovered,
            { group: ['@main/*', '**/src/main/**'], message: 'The renderer never imports from the main process.' },
            { group: ['node:*'], message: 'The renderer has no Node APIs.' }
          ]
        }
      ]
    }
  },
  // Only lib/api.ts talks to the bridge.
  {
    files: ['src/renderer/src/**/*.{ts,tsx}'],
    ignores: ['src/renderer/src/lib/api.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='window'][property.name='aeterna']",
          message: 'Use lib/api.ts (invoke, useApiQuery, useApiMutation, onEvent); screens never touch window.aeterna.'
        }
      ]
    }
  },
  // Main and preload never import the renderer; shared code imports neither side.
  {
    files: ['src/main/**', 'src/preload/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [noRecovered, { group: ['@renderer/*', '**/src/renderer/**'], message: 'Main and preload never import from the renderer.' }] }
      ]
    }
  },
  {
    files: ['src/shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'electron', message: 'Shared code runs in both processes; keep Electron out of it.' }],
          patterns: [
            noRecovered,
            { group: ['@main/*', '@renderer/*', '**/src/main/**', '**/src/renderer/**'], message: 'Shared code imports neither process.' }
          ]
        }
      ]
    }
  },
  // Only the preload uses ipcRenderer.
  {
    files: ['src/**'],
    ignores: ['src/preload/**'],
    rules: {
      'no-restricted-properties': ['error', { object: 'ipcRenderer', message: 'Only src/preload/index.ts uses ipcRenderer.' }]
    }
  }
)
