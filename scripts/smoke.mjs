#!/usr/bin/env node
/**
 * npm run smoke: launches the BUILT app (out/) with Playwright and checks it
 * end to end (e2e/smoke.mjs). With no display (CI, a server) it runs under
 * xvfb-run. Build first: npx electron-vite build, or npm run build.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const file of ['out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html']) {
  if (!existsSync(join(root, file))) {
    console.error(`The app isn’t built (${file} is missing). Run “npx electron-vite build” or “npm run build” first.`)
    process.exit(2)
  }
}

const script = join(root, 'e2e', 'smoke.mjs')
const headless = process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY
const [command, args] = headless
  ? ['xvfb-run', ['--auto-servernum', '--server-args=-screen 0 1600x1000x24', process.execPath, script, ...process.argv.slice(2)]]
  : [process.execPath, [script, ...process.argv.slice(2)]]

const child = spawn(command, args, { stdio: 'inherit', cwd: root, env: process.env })
child.on('error', (err) => {
  console.error(headless ? `Couldn’t start xvfb-run (${err.message}). Install xvfb, or run with a display.` : err.message)
  process.exit(1)
})
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
