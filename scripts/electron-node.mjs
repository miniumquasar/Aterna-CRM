#!/usr/bin/env node
/**
 * Runs a Node script under Electron's own Node (ELECTRON_RUN_AS_NODE=1), so the
 * one native SQLite build that electron-builder installed for Electron serves
 * both the app and the tests.
 *
 *   node scripts/electron-node.mjs <script> [args…]
 *
 * Arguments pass straight through; the exit code is Electron's.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
/** The electron package's main export is the path to its binary when required from Node. */
const electronPath = require('electron')

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node scripts/electron-node.mjs <script> [args…]')
  process.exit(2)
}

const child = spawn(electronPath, args, {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('error', (err) => {
  console.error(`Could not start Electron as Node: ${err.message}`)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Electron stopped on ${signal}.`)
    process.exit(1)
  }
  process.exit(code ?? 1)
})
