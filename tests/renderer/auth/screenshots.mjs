#!/usr/bin/env node
/* global window, document */
/**
 * Screenshots of the auth domain's screens with made-up people in them, for
 * checking how they look in Day and Night. Not part of npm test.
 *
 *   npx electron-vite build && xvfb-run -a node tests/renderer/auth/screenshots.mjs
 *
 * It launches the built app on a fresh, temporary data folder, goes through
 * the wizard, then seeds people, invitations, a lock and a temporary
 * password through the app's own handlers (window.aeterna.invoke, as the
 * screens call them). Screenshots go to test-results/auth/. No real client
 * data is used, and the data folder is deleted afterwards.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const require = createRequire(import.meta.url)
const shots = join(root, 'test-results', 'auth')
rmSync(shots, { recursive: true, force: true })
mkdirSync(shots, { recursive: true })
const dataDir = mkdtempSync(join(tmpdir(), 'aeterna-auth-shots-'))
const env = { ...process.env, AETERNA_DATA_DIR: dataDir }
delete env.ELECTRON_RENDERER_URL
delete env.ELECTRON_RUN_AS_NODE
const args = []
if (process.platform === 'linux' && process.getuid?.() === 0) args.push('--no-sandbox')
args.push('--disable-dev-shm-usage', '.')

const PASSWORD = 'a made-up partner password'
const problems = []
let app
try {
  app = await electron.launch({ executablePath: require('electron'), args, cwd: root, env, timeout: 60_000 })
  const page = await app.firstWindow()
  page.setDefaultTimeout(20_000)
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()))
  page.on('pageerror', (e) => problems.push(e.message))
  await page.setViewportSize({ width: 1400, height: 900 })

  const invoke = async (channel, req) => {
    const r = await page.evaluate(([c, q]) => window.aeterna.invoke(c, q), [channel, req])
    if (!r.ok) throw new Error(`${channel}: ${r.error.code}: ${r.error.message}`)
    return r.data
  }
  const attempt = (channel, req) => page.evaluate(([c, q]) => window.aeterna.invoke(c, q), [channel, req])
  const shot = (name) => page.screenshot({ path: join(shots, `${name}.png`) })
  const mode = async (m) => {
    await page.getByRole('radio', { name: m === 'day' ? 'Day' : 'Night', exact: true }).first().click()
    await page.waitForFunction((x) => document.documentElement.dataset.mode === x, m)
  }
  const settled = () => page.waitForFunction(() => !document.querySelector('main [role="status"]'), undefined, { timeout: 8_000 }).catch(() => undefined)

  // ── The wizard ───────────────────────────────────────────────────────────
  await page.getByTestId('setup-firm-name').fill('Alder & Birch LLP')
  await page.getByLabel('Town or city').fill('Leeds')
  await page.getByLabel('Postcode').fill('ls1 4ap')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByTestId('setup-partner-name').fill('Pat Partner')
  await page.getByTestId('setup-partner-password').fill('short')
  await page.getByRole('button', { name: 'Create partner account' }).click()
  await shot('setup-partner-day')
  await mode('night')
  await shot('setup-partner-night')
  await mode('day')
  await page.getByTestId('setup-partner-password').fill(PASSWORD)
  await page.getByTestId('setup-partner-confirm').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create partner account' }).click()
  for (const title of ['Recovery sheet', 'Vault passphrase', 'Trial or licence', 'Import']) {
    await page.locator('#setup-step-title', { hasText: title }).waitFor()
    await page.getByRole('button', { name: 'Skip for now' }).click()
  }
  await page.locator('#setup-step-title', { hasText: 'Ready' }).waitFor()
  await page.getByTestId('setup-finish').click()
  await page.getByTestId('title-bar').waitFor()

  // ── Made-up people, through the app's own handlers ──────────────────────
  await invoke('firm.update', {
    name: 'Alder & Birch LLP',
    addressLine1: '12 Park Row',
    town: 'Leeds',
    postcode: 'LS1 4AP',
    email: 'office@alderbirch.example',
    phone: '0113 496 0000',
    companyNumber: 'oc123456',
    vatNumber: 'GB 999 9999 74',
    utr: '1234567802',
    payeRef: '123/ab45678'
  })
  const codes = {}
  for (const [name, role] of [
    ['Morgan Manager', 'manager'],
    ['Sam Staff', 'staff'],
    ['Jo Junior', 'staff'],
    ['Chris Former', 'staff'],
    ['Alex Newman', 'staff'],
    ['Robin Reed', 'manager']
  ]) {
    codes[name] = (await invoke('people.invite', { name, email: `${name.split(' ')[0].toLowerCase()}@alderbirch.example`, role, expiresInDays: 7 })).code
  }
  await invoke('auth.signOut', undefined)
  for (const name of ['Morgan Manager', 'Sam Staff', 'Jo Junior', 'Chris Former']) {
    const username = name.toLowerCase().replace(' ', '.')
    await invoke('auth.acceptInvite', { code: codes[name], name, username, password: `${username} made-up password` })
    await invoke('auth.signOut', undefined)
  }
  for (let i = 0; i < 5; i++) await attempt('auth.signIn', { username: 'jo.junior', password: 'not the password' })
  await attempt('auth.signIn', { username: 'sam.staff', password: 'not the password' })
  await invoke('auth.signIn', { username: 'pat.partner', password: PASSWORD })
  const list = await invoke('people.list', undefined)
  const id = (n) => list.people.find((p) => p.name === n).id
  await invoke('people.setAccess', { id: id('Chris Former'), active: false })
  await invoke('people.resetPassword', { id: id('Morgan Manager'), temporaryPassword: 'temporary pass 1' })
  await page.reload()
  await page.getByTestId('title-bar').waitFor()

  // ── Settings → People, Firm details, Your sign-in ────────────────────────
  for (const m of ['day', 'night']) {
    await mode(m)
    for (const section of ['people', 'firm', 'account']) {
      await page.evaluate((s) => {
        window.location.hash = `#/settings?section=${s}`
      }, section)
      await page.locator('main h2', { hasText: section === 'people' ? 'People' : section === 'firm' ? 'Firm details' : 'Your sign-in' }).first().waitFor()
      await settled()
      await page.waitForTimeout(300)
      await shot(`${m}-settings-${section}`)
      if (section === 'firm') {
        await page.locator('main').evaluate((el) => el.scrollTo(0, el.scrollHeight))
        await page.waitForTimeout(200)
        await shot(`${m}-settings-firm-bottom`)
      }
    }
  }
  await mode('day')
  await page.evaluate(() => {
    window.location.hash = '#/settings?section=people'
  })
  await page.getByRole('row', { name: 'Open Jo Junior' }).click()
  await page.getByRole('dialog', { name: 'Jo Junior' }).waitFor()
  await shot('day-person-locked')
  await page.getByRole('dialog', { name: 'Jo Junior' }).getByRole('button', { name: 'Set a temporary password' }).click()
  await page.getByRole('button', { name: 'Suggest one' }).click()
  await shot('day-reset-password')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.getByRole('row', { name: 'Open Morgan Manager' }).click()
  await page.getByRole('dialog', { name: 'Morgan Manager' }).getByRole('button', { name: 'Remove from the practice' }).click()
  await page.getByRole('button', { name: 'Remove Morgan Manager' }).waitFor()
  await shot('day-remove-confirm')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await mode('night')
  await page.getByTestId('people-invite').click()
  await page.getByTestId('invite-name').fill('Taylor Trainee')
  await shot('night-invite-form')
  await page.getByRole('button', { name: 'Create invitation' }).click()
  await page.getByTestId('invite-code-shown').waitFor()
  await shot('night-invite-code')
  await page.getByRole('button', { name: 'Done' }).click()

  // ── The idle warning (the page's clock moved on) ─────────────────────────
  await page.clock.install()
  await page.reload()
  await page.getByTestId('title-bar').waitFor()
  await invoke('account.setIdle', { minutes: 5 })
  await page.reload()
  await page.getByTestId('title-bar').waitFor()
  await page.clock.fastForward('04:10')
  await page.getByRole('alertdialog', { name: 'Are you still there?' }).waitFor()
  await shot('night-idle-warning')
  await page.getByRole('button', { name: 'Stay signed in' }).click()
  await page.getByRole('radio', { name: 'Day', exact: true }).first().click()
  await page.clock.fastForward('04:10')
  await page.getByRole('alertdialog', { name: 'Are you still there?' }).waitFor()
  await shot('day-idle-warning')
  await page.clock.fastForward('01:05')
  await page.getByTestId('sign-in-username').waitFor()
  await shot('day-sign-in-after-idle')

  // ── Sign-in answers, a temporary password, an invitation ─────────────────
  await page.getByTestId('sign-in-username').fill('jo.junior')
  await page.getByTestId('sign-in-password').fill('still not it')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByText(/locked after too many wrong passwords/).waitFor()
  await shot('day-sign-in-locked')
  await mode('night')
  await shot('night-sign-in-locked')
  await page.getByTestId('sign-in-username').fill('chris.former')
  await page.getByTestId('sign-in-password').fill('chris.former made-up password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByText(/access to AETERNA CRM is turned off/).waitFor()
  await shot('night-sign-in-access-off')
  await page.getByTestId('sign-in-username').fill('morgan.manager')
  await page.getByTestId('sign-in-password').fill('temporary pass 1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByTestId('new-password').fill('Morgan new pass 7')
  await shot('night-new-password')
  await page.getByRole('button', { name: 'Back to the sign-in page' }).click()
  await page.getByRole('button', { name: 'I have an invitation code' }).click()
  await page.getByTestId('invite-code').fill(codes['Alex Newman'])
  await shot('night-invite-enter-code')
  await page.getByRole('button', { name: 'Check the code' }).click()
  await page.getByTestId('invite-password').fill('Alex made up 1')
  await shot('night-invite-details')
  await mode('day')
  await shot('day-invite-details')
} catch (err) {
  problems.push(`stopped: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
  try {
    const page = app && (await app.firstWindow())
    if (page) await page.screenshot({ path: join(shots, 'failure.png') })
  } catch {
    // The window may be gone.
  }
} finally {
  await app?.close().catch(() => undefined)
  rmSync(dataDir, { recursive: true, force: true })
}
if (problems.length) {
  console.error(`auth screenshots: ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`)
  process.exit(1)
}
console.log(`auth screenshots: done, in ${shots}`)
