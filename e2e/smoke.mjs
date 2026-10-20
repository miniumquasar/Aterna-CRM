/**
 * The smoke test: Playwright drives the built Electron app (out/) with a
 * fresh, empty data folder, the way a new practice meets it —
 *
 *   1. the first-run wizard: the firm's name and the first partner, then the
 *      remaining steps skipped and setup finished;
 *   2. sign out, open the invitation-code page and come back, and sign in
 *      again through the sign-in screen;
 *   3. every route in src/renderer/src/navigation/routes.ts, in Day and in
 *      Night (sidebar routes by clicking the sidebar, the rest by address),
 *      plus Go to… (Ctrl+K);
 *   4. every client-file tab and every settings section;
 *
 * failing on any console error or uncaught page error. Screenshots go to
 * test-results/smoke/. Run it with npm run smoke.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'
import { tsImport } from 'tsx/esm/api'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const electronPath = require('electron')
const shots = join(root, 'test-results', 'smoke')
rmSync(shots, { recursive: true, force: true })
mkdirSync(shots, { recursive: true })

const { ROUTES } = await tsImport('../src/renderer/src/navigation/routes.ts', import.meta.url)
const { CLIENT_FILE_TABS } = await tsImport('../src/renderer/src/screens/clients/clientFileTabs.ts', import.meta.url)
const { SETTINGS_SECTIONS } = await tsImport('../src/renderer/src/screens/settings/sections.ts', import.meta.url)
const routes = ROUTES.filter((r) => !r.devOnly)
const SAMPLE_PARAMS = { clientId: 1 }

const dataDir = mkdtempSync(join(tmpdir(), 'aeterna-smoke-'))
const problems = []
const visited = []
const env = { ...process.env, AETERNA_DATA_DIR: dataDir }
delete env.ELECTRON_RENDERER_URL
delete env.ELECTRON_RUN_AS_NODE

const args = []
if (process.platform === 'linux' && process.getuid?.() === 0) args.push('--no-sandbox')
args.push('--disable-dev-shm-usage', '.')

const step = (text) => console.log(`smoke: ${text}`)
let app
try {
  app = await electron.launch({ executablePath: electronPath, args, cwd: root, env, timeout: 60_000 })
  app.process().stdout?.on('data', (d) => process.env.SMOKE_VERBOSE && process.stdout.write(`[main] ${d}`))
  app.process().stderr?.on('data', (d) => process.env.SMOKE_VERBOSE && process.stderr.write(`[main] ${d}`))
  const page = await app.firstWindow()
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`)
  })
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`))
  page.setDefaultTimeout(20_000)

  // ── 1. First run ────────────────────────────────────────────────────────
  step('first-run wizard')
  // The splash covers the window for under a second at each start.
  await page.getByTestId('splash').waitFor({ state: 'detached' }).catch(() => undefined)
  await page.getByTestId('setup-firm-name').fill('Smoke Test Practice LLP')
  await page.screenshot({ path: join(shots, 'setup-firm.png') })
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByTestId('setup-partner-name').fill('Sam Smoke')
  await page.getByTestId('setup-partner-username').fill('sam.smoke')
  await page.getByTestId('setup-partner-password').fill('a smoke test password')
  await page.getByTestId('setup-partner-confirm').fill('a smoke test password')
  await page.getByRole('button', { name: 'Create partner account' }).click()
  for (const title of ['Recovery sheet', 'Vault passphrase', 'Trial or licence', 'Import']) {
    await page.locator('#setup-step-title', { hasText: title }).waitFor()
    await page.getByRole('button', { name: 'Skip for now' }).click()
  }
  await page.locator('#setup-step-title', { hasText: 'Ready' }).waitFor()
  await page.screenshot({ path: join(shots, 'setup-done.png') })
  await page.getByTestId('setup-finish').click()
  await page.getByTestId('title-bar').waitFor()
  await page.getByTestId('firm-name').filter({ hasText: 'Smoke Test Practice LLP' }).waitFor()

  // ── 2. Sign out, sign in ─────────────────────────────────────────────────
  step('sign out and sign in')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByTestId('sign-in-username').waitFor()
  // The invitation flow's first page, and back.
  await page.getByTestId('sign-in-invite').click()
  await page.getByTestId('invite-code').waitFor()
  await page.screenshot({ path: join(shots, 'invite-code.png') })
  await page.getByRole('button', { name: 'Back to the sign-in page' }).click()
  await page.getByTestId('sign-in-username').waitFor()
  await page.getByTestId('sign-in-username').fill('sam.smoke')
  await page.getByTestId('sign-in-password').fill('not the password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('alert').filter({ hasText: 'don’t match' }).waitFor()
  await page.screenshot({ path: join(shots, 'sign-in.png') })
  await page.getByTestId('sign-in-password').fill('a smoke test password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByTestId('title-bar').waitFor()

  // ── 3. Every route, Day and Night ────────────────────────────────────────
  const sidebar = page.getByRole('navigation', { name: 'Main' })
  for (const mode of ['day', 'night']) {
    step(`every route in ${mode === 'day' ? 'Day' : 'Night'}`)
    await sidebar.getByRole('radio', { name: mode === 'day' ? 'Day' : 'Night', exact: true }).click()
    await page.waitForFunction((m) => document.documentElement.dataset.mode === m, mode)
    for (const route of routes) {
      if (route.group) {
        await sidebar.locator(`[data-nav="${route.id}"]`).click()
      } else {
        const params = route.requiredParams?.length ? SAMPLE_PARAMS : {}
        const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
        await page.evaluate((hash) => {
          window.location.hash = hash
        }, `#/${route.id}${query ? `?${query}` : ''}`)
      }
      await page.locator(`main[data-route="${route.id}"] h1`).first().waitFor()
      await page.waitForFunction(() => !document.querySelector('main [role="status"]'), undefined, { timeout: 8_000 }).catch(() => {
        problems.push(`${route.id} (${mode}) was still loading after 8 seconds`)
      })
      await page.screenshot({ path: join(shots, `${mode}-${route.id}.png`) })
      visited.push(`${mode}:${route.id}`)
    }
  }

  // ── Go to… ───────────────────────────────────────────────────────────────
  step('Go to… (Ctrl+K)')
  await page.keyboard.press('Control+K')
  await page.getByTestId('palette-input').fill('deadl')
  await page.screenshot({ path: join(shots, 'command-palette.png') })
  await page.keyboard.press('Enter')
  await page.locator('main[data-route="deadlines"] h1').waitFor()

  // ── Tabs keep focus while they change the route's params ─────────────────
  step('client file tabs by keyboard')
  await page.evaluate(() => {
    window.location.hash = '#/clientFile?clientId=1'
  })
  await page.getByRole('tab', { name: 'Overview' }).focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'tab' && document.activeElement?.textContent?.includes('Contacts'))
  await page.waitForFunction(() => window.location.hash.includes('tab=contacts'))

  // ── Every client-file tab and settings section ───────────────────────────
  step('every client-file tab and settings section')
  const settled = async (what) => {
    await page.waitForFunction(() => !document.querySelector('main [role="status"]'), undefined, { timeout: 8_000 }).catch(() => {
      problems.push(`${what} was still loading after 8 seconds`)
    })
  }
  for (const tab of CLIENT_FILE_TABS) {
    await page.evaluate((hash) => {
      window.location.hash = hash
    }, `#/clientFile?clientId=1&tab=${tab.id}`)
    await page.getByRole('tab', { name: tab.title, selected: true }).waitFor()
    await settled(`the client file’s ${tab.title} tab`)
    visited.push(`tab:${tab.id}`)
  }
  // Tabs that don't fit can still be reached with the mouse.
  await page.evaluate(() => {
    window.location.hash = '#/clientFile?clientId=1&tab=overview'
  })
  const more = page.getByRole('button', { name: 'Show more tabs' })
  if (await more.count()) {
    await more.click()
    await page.getByRole('button', { name: 'Show earlier tabs' }).waitFor()
  }
  await page.screenshot({ path: join(shots, 'client-file-tabs.png') })
  await sidebar.locator('[data-nav="settings"]').click()
  for (const section of SETTINGS_SECTIONS) {
    await page.locator(`[data-section="${section.id}"]`).click()
    await page.locator('main h2', { hasText: section.title }).first().waitFor()
    await settled(`Settings → ${section.title}`)
    visited.push(`settings:${section.id}`)
  }

  // ── Settings → Appearance changes the theme ─────────────────────────────
  step('Settings → Appearance')
  await page.locator('[data-section="appearance"]').click()
  await page.locator('[data-palette-choice="sapphire"]').click()
  await page.waitForFunction(() => document.documentElement.dataset.palette === 'sapphire')
  await page.screenshot({ path: join(shots, 'appearance-sapphire.png') })
  await page.locator('[data-palette-choice="burgundy"]').click()
  await page.waitForFunction(() => document.documentElement.dataset.palette === 'burgundy')
} catch (err) {
  problems.push(`the run stopped: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
  try {
    const page = app && (await app.firstWindow())
    if (page) await page.screenshot({ path: join(shots, 'failure.png') })
  } catch {
    // The window may already be gone.
  }
} finally {
  await app?.close().catch(() => undefined)
  rmSync(dataDir, { recursive: true, force: true })
}

writeFileSync(join(shots, 'report.json'), JSON.stringify({ visited, problems }, null, 2))
if (problems.length) {
  console.error(`smoke: FAILED with ${problems.length} problem(s):`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
const routeVisits = visited.filter((v) => v.startsWith('day:') || v.startsWith('night:')).length
console.log(
  `smoke: passed — ${routeVisits} route visits (${routes.length} routes × Day and Night), ${CLIENT_FILE_TABS.length} client-file tabs and ` +
    `${SETTINGS_SECTIONS.length} settings sections; screenshots in test-results/smoke/`
)
