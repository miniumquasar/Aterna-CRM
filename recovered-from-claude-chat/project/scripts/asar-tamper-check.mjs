#!/usr/bin/env node
/* global process, console */
/**
 * Checks that a packaged AETERNA CRM refuses to start when its app archive has
 * been edited (the asar integrity check, switched on in electron-builder.yml).
 *
 *   npm run build:unpack                     (builds release/win-unpacked on Windows)
 *   node scripts/asar-tamper-check.mjs release/win-unpacked
 *
 * 1. Control: the untouched build is started with AETERNA_CHECK_APP_STARTS=1,
 *    which makes the app's own code print a marker and exit at once — before it
 *    opens any data. The marker must appear.
 * 2. A copy is made, one letter inside out/main/index.js in the copy's app.asar
 *    is changed (a harmless one, in a log message), and the copy is started the
 *    same way. The app's code must never run: Electron stops it first.
 *
 * Windows and macOS only: Linux has no asar integrity check, so there the
 * edited copy runs and the result is reported as not applicable.
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const MARKER = 'AETERNA-APP-CODE-RAN'

// Under Electron's own Node (as the tests run), fs treats .asar files as folders; read them as plain files.
process.noAsar = true

/** Byte offset of out/main/index.js inside an asar file, and its size. */
export function locateInAsar(asar, filePath = 'out/main/index.js') {
  const headerSize = asar.readUInt32LE(4) // pickle: [4][header pickle size][payload size][string length][json]
  const jsonLength = asar.readUInt32LE(12)
  const header = JSON.parse(asar.subarray(16, 16 + jsonLength).toString('utf8'))
  let node = header
  for (const part of filePath.split('/')) {
    node = node.files?.[part]
    if (!node) throw new Error(`${filePath} is not in the archive`)
  }
  if (node.unpacked) throw new Error(`${filePath} is unpacked, not in the archive`)
  return { start: 8 + headerSize + Number(node.offset), size: node.size }
}

/** Changes "AETERNA CRM" to "AETERNB CRM" once inside out/main/index.js: same length, harmless to the code. */
export function tamper(asarPath) {
  const asar = readFileSync(asarPath)
  const { start, size } = locateInAsar(asar)
  const at = asar.subarray(start, start + size).indexOf(Buffer.from('AETERNA CRM'))
  if (at < 0) throw new Error('Could not find the text to change in out/main/index.js')
  asar[start + at + 6] = 'B'.charCodeAt(0)
  writeFileSync(asarPath, asar)
  return start + at + 6
}

function findApp(dir) {
  if (process.platform === 'darwin') {
    const app = readdirSync(dir).find((f) => f.endsWith('.app'))
    if (!app) throw new Error(`No .app in ${dir}`)
    const macos = join(dir, app, 'Contents', 'MacOS')
    return { exe: join(macos, readdirSync(macos)[0]), asar: join(dir, app, 'Contents', 'Resources', 'app.asar') }
  }
  const asar = join(dir, 'resources', 'app.asar')
  const skip = /^(chrome-sandbox|chrome_crashpad_handler|uninstall.*)$/i
  const exe = readdirSync(dir).find((f) => {
    const p = join(dir, f)
    if (!statSync(p).isFile() || skip.test(f)) return false
    return process.platform === 'win32' ? f.toLowerCase().endsWith('.exe') : (statSync(p).mode & 0o111) !== 0 && !/\.(so|so\.\d+|bin|pak|dat|json)$/.test(f)
  })
  if (!exe) throw new Error(`No app executable in ${dir}`)
  return { exe: join(dir, exe), asar }
}

/** Starts the app and reports whether its own code ran, how it ended, and what it logged. */
function launch(exe, seconds = 30) {
  return new Promise((done) => {
    const args = ['--enable-logging=stderr', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])]
    const child = spawn(exe, args, { env: { ...process.env, AETERNA_CHECK_APP_STARTS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    const timer = setTimeout(() => child.kill(), seconds * 1000)
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      done({ ran: out.includes(MARKER), code, signal, integrityMessage: /integrity check failed/i.test(out), log: out })
    })
  })
}

async function main() {
  const dir = resolve(process.argv[2] ?? (process.platform === 'win32' ? 'release/win-unpacked' : process.platform === 'darwin' ? 'release/mac' : 'release/linux-unpacked'))
  if (!existsSync(dir)) throw new Error(`${dir} not found — run "npm run build:unpack" first`)
  const { exe, asar } = findApp(dir)
  console.log(`App: ${exe}`)

  const control = await launch(exe)
  if (!control.ran) {
    console.log(control.log.slice(-2000))
    throw new Error('Control failed: the untouched app did not start, so the check would prove nothing')
  }
  console.log('Control: the untouched app starts.')

  const work = mkdtempSync(join(tmpdir(), 'aeterna-tamper-'))
  try {
    const copy = join(work, basename(dir))
    cpSync(dir, copy, { recursive: true, verbatimSymlinks: true })
    const copied = findApp(copy)
    const offset = tamper(copied.asar)
    console.log(`Edited one byte of ${relative(copy, copied.asar)} at offset ${offset}.`)
    const edited = await launch(copied.exe)
    if (process.platform === 'linux') {
      console.log(edited.ran
        ? 'NOT APPLICABLE: Linux has no asar integrity check, so the edited copy ran. Run this on Windows or macOS.'
        : 'The edited copy did not run on Linux — unexpected; see the log above.')
      return
    }
    if (edited.ran) {
      console.log(edited.log.slice(-2000))
      console.log('FAIL: the edited app ran its code. Check that electron-builder.yml has enableEmbeddedAsarIntegrityValidation: true.')
      process.exitCode = 1
      return
    }
    console.log(edited.integrityMessage
      ? 'PASS: the edited app refused to start ("Integrity check failed for asar archive").'
      : `PASS: the edited app refused to start (exit ${edited.code ?? edited.signal}); its code never ran.`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`✖ ${err.message}`)
    process.exit(1)
  })
}
