/**
 * Level 5: the Windows installer, the Mac set-up, the release workflow, the
 * icons, the app's menu and the checksums. Configuration is read as text, as
 * electron-builder reads it; the pictures are checked by their headers.
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { menuTemplate, SUPPORT_MAILTO } from '../../src/main/menu-template'
import { DOWNLOAD_PAGE, PRODUCT_NAME, SUPPORT_EMAIL } from '../../src/shared/product'
// @ts-expect-error — a plain .mjs script, used here for its helper
import { writeChecksums } from '../../scripts/checksums.mjs'

const ROOT = resolve(__dirname, '../..')
const read = (f: string): string => readFileSync(join(ROOT, f), 'utf8')
const bytes = (f: string): Buffer => readFileSync(join(ROOT, f))
const yml = read('electron-builder.yml')

/** The lines of one top-level section of electron-builder.yml. */
const section = (name: string): string => new RegExp(`^${name}:\\n((?:[ #].*\\n|\\n)+)`, 'm').exec(yml)?.[1] ?? ''

describe('the Windows installer', () => {
  const nsis = section('nsis')
  it('asks who it is for (just me by default), where, and starts the app at the end', () => {
    expect(nsis).toMatch(/^\s+oneClick: false$/m)
    expect(nsis).toMatch(/^\s+perMachine: false$/m)
    expect(nsis).toMatch(/^\s+allowToChangeInstallationDirectory: true$/m)
    expect(nsis).toMatch(/^\s+createDesktopShortcut: always$/m)
    expect(nsis).toMatch(/^\s+createStartMenuShortcut: true$/m)
    expect(nsis).toMatch(/^\s+runAfterFinish: true$/m)
  })

  it('keeps the data on uninstall unless asked, through build/installer.nsh, and makes full installers only', () => {
    expect(nsis).toMatch(/^\s+deleteAppDataOnUninstall: false$/m)
    expect(nsis).toMatch(/^\s+include: build\/installer\.nsh$/m)
    expect(nsis).toMatch(/^\s+differentialPackage: false$/m)
    expect(yml).toMatch(/^publish: null$/m)
  })

  it('uses the app’s icon and pictures, all present', () => {
    for (const f of ['build/icon.ico', 'build/installerSidebar.bmp', 'build/uninstallerSidebar.bmp', 'build/installerHeader.bmp']) {
      expect(yml).toContain(f)
      expect(bytes(f).length).toBeGreaterThan(0)
    }
    expect(section('win')).toMatch(/^\s+icon: build\/icon\.ico$/m)
  })

  it('leaves signing to the environment: nothing in the configuration turns it off or forces it', () => {
    expect(yml).not.toMatch(/identity: null/)
    expect(yml).not.toMatch(/forceCodeSigning: true/)
    expect(yml).not.toMatch(/signAndEditExecutable: false/)
  })

  it('ships British and US English only', () => {
    expect(/^electronLanguages:\n\s+- en-GB\n\s+- en-US$/m.test(yml)).toBe(true)
  })
})

describe('build/installer.nsh', () => {
  const nsh = read('build/installer.nsh')
  it('is uninstaller-only, so the installer has no unused functions (warnings are errors)', () => {
    expect(nsh.indexOf('!ifdef BUILD_UNINSTALLER')).toBeLessThan(nsh.indexOf('Var AeternaRemoveData'))
    expect(nsh.trimEnd().endsWith('!endif')).toBe(true)
  })

  it('offers "Also remove my data", unticked, and asks again with No as the default', () => {
    expect(nsh).toMatch(/!macro customUnWelcomePage[\s\S]*MUI_UNPAGE_WELCOME[\s\S]*UninstPage custom un\.aeternaDataPage un\.aeternaDataPageLeave/)
    expect(nsh).toContain('Also remove my data from this computer')
    expect(nsh).not.toMatch(/NSD_Check\b/)
    expect(nsh).toMatch(/MessageBox MB_YESNO\|MB_ICONEXCLAMATION\|MB_DEFBUTTON2/)
  })

  it('never removes data during an upgrade, and removes only the app’s own folder', () => {
    expect(nsh).toMatch(/Function un\.aeternaDataPage[\s\S]*\$\{if\} \$\{isUpdated\}\s+Abort/)
    const removal = /!macro customUnInstall([\s\S]*?)!macroend/.exec(nsh)?.[1] ?? ''
    expect(removal).toMatch(/\$\{ifNot\} \$\{isUpdated\}\s+\$\{andIf\} \$AeternaRemoveData == \$\{BST_CHECKED\}/)
    expect(removal.match(/RMDir \/r "([^"]+)"/g)).toEqual(['RMDir /r "$APPDATA\\${PRODUCT_NAME}"'])
    expect(removal).not.toMatch(/DeleteReg/)
  })
})

describe('the Mac set-up (built when there is an Apple account)', () => {
  const mac = section('mac')
  it('uses the hardened runtime with the entitlements file, and the Mac icon', () => {
    expect(mac).toMatch(/^\s+hardenedRuntime: true$/m)
    expect(mac).toMatch(/^\s+entitlements: build\/entitlements\.mac\.plist$/m)
    expect(mac).toMatch(/^\s+entitlementsInherit: build\/entitlements\.mac\.plist$/m)
    expect(mac).toMatch(/^\s+icon: build\/icon\.icns$/m)
  })

  it('asks for JIT only', () => {
    const keys = [...read('build/entitlements.mac.plist').matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1])
    expect(keys).toEqual(['com.apple.security.cs.allow-jit'])
  })
})

describe('the release workflow', () => {
  const wf = read('.github/workflows/build.yml')
  it('builds Windows on Windows after the checks, with the tamper check and checksums', () => {
    expect(wf).toMatch(/windows:\n\s+name: Windows installer\n\s+needs: checks\n\s+runs-on: windows-latest/)
    expect(wf).toContain('npx electron-builder --win --x64 --publish never')
    expect(wf).toContain('node scripts/asar-tamper-check.mjs release/win-unpacked')
    expect(wf).toContain('node scripts/checksums.mjs release')
    for (const step of ['npm run typecheck', 'npm run lint', 'npm test']) expect(wf).toContain(`- run: ${step}`)
  })

  it('builds the Mac only when asked by hand, and signs only with the secrets', () => {
    expect(wf).toMatch(/mac:\n\s+name: Mac disk images\n\s+needs: checks\n\s+if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.mac \}\}/)
    for (const s of ['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'MAC_CSC_LINK', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) {
      expect(wf).toContain(`\${{ secrets.${s} }}`)
    }
    expect(wf).toMatch(/permissions:\n\s+contents: read/)
  })
})

/** Width and height from a PNG's header. */
const pngSize = (b: Buffer): [number, number] => [b.readUInt32BE(16), b.readUInt32BE(20)]

describe('the icons', () => {
  it('icon.ico holds 16 to 256 px', () => {
    const ico = bytes('build/icon.ico')
    expect(ico.readUInt16LE(2)).toBe(1)
    const count = ico.readUInt16LE(4)
    const sizes = Array.from({ length: count }, (_, i) => ico[6 + i * 16] || 256)
    expect(sizes).toEqual([16, 20, 24, 32, 40, 48, 64, 128, 256])
  })

  it('icon.icns holds every size up to 1024 px', () => {
    const icns = bytes('build/icon.icns')
    expect(icns.subarray(0, 4).toString()).toBe('icns')
    expect(icns.readUInt32BE(4)).toBe(icns.length)
    const kinds: string[] = []
    for (let at = 8; at < icns.length; at += icns.readUInt32BE(at + 4)) kinds.push(icns.subarray(at, at + 4).toString())
    expect(kinds).toEqual(['icp4', 'icp5', 'icp6', 'ic07', 'ic08', 'ic09', 'ic10', 'ic11', 'ic12', 'ic13', 'ic14'])
  })

  it('the PNGs and the installer pictures are the sizes Windows and Linux expect', () => {
    expect(pngSize(bytes('build/icon.png'))).toEqual([1024, 1024])
    expect(pngSize(bytes('resources/icon.png'))).toEqual([512, 512])
    const bmp = (f: string): [number, number, number] => {
      const b = bytes(f)
      return [b.readInt32LE(18), b.readInt32LE(22), b.readUInt16LE(28)]
    }
    expect(bmp('build/installerSidebar.bmp')).toEqual([164, 314, 24])
    expect(bmp('build/uninstallerSidebar.bmp')).toEqual([164, 314, 24])
    expect(bmp('build/installerHeader.bmp')).toEqual([150, 57, 24])
  })
})

describe('package.json for packaging', () => {
  const pkg = JSON.parse(read('package.json')) as { name: string; productName: string; author: { name: string }; dependencies: Record<string, string> }
  it('names the product and its maker', () => {
    expect(pkg.name).toBe('aeterna-crm')
    expect(pkg.productName).toBe(PRODUCT_NAME)
    expect(pkg.author.name).toBe('Bitopi')
  })

  it('ships only what the main process loads: every package it imports, and nothing the screens bundle', () => {
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`
        if (e.isDirectory()) walk(p)
        else if (/\.ts$/.test(e.name)) files.push(p)
      }
    }
    walk('src/main')
    walk('src/preload')
    walk('src/shared')
    const imported = new Set<string>()
    for (const f of files) {
      for (const m of read(f).matchAll(/^import (?!type )[^'"]*?from '([^'.@][^']*|@[^/']+\/[^']+)'/gm)) {
        const name = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0]
        const local = ['@shared', '@main', '@preload', '@renderer'].some((alias) => name.startsWith(`${alias}/`))
        if (!local && !name.startsWith('node:') && !['electron', 'https', 'http', 'events', 'crypto', 'fs', 'path', 'os', 'child_process'].includes(name)) imported.add(name)
      }
    }
    for (const name of imported) expect([name, name in pkg.dependencies]).toEqual([name, true])
    for (const name of ['react', 'react-dom', 'lucide-react', 'framer-motion', 'recharts', 'zustand']) expect(pkg.dependencies[name]).toBeUndefined()
  })
})

/** Every menu item, depth first. */
function items(menu: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return menu.flatMap((m) => [m, ...(Array.isArray(m.submenu) ? items(m.submenu) : [])])
}

describe('the app’s menu', () => {
  const sent: string[] = []
  const opened: string[] = []
  const hooks = { send: (a: string) => sent.push(a), openExternal: (u: string) => opened.push(u) }

  it('has no reload or developer tools in a packaged build, on any platform', () => {
    for (const platform of ['win32', 'darwin', 'linux'] as const) {
      const roles = items(menuTemplate(platform, true, hooks)).map((i) => i.role)
      expect(roles).not.toContain('reload')
      expect(roles).not.toContain('forceReload')
      expect(roles).not.toContain('toggleDevTools')
    }
    expect(items(menuTemplate('win32', false, hooks)).map((i) => i.role)).toContain('toggleDevTools')
  })

  it('is File, Edit, View and Help on Windows, with the app’s own menu first on a Mac', () => {
    expect(menuTemplate('win32', true, hooks).map((m) => m.label?.replace('&', ''))).toEqual(['File', 'Edit', 'View', 'Help'])
    expect(menuTemplate('darwin', true, hooks)[0].label).toBe(PRODUCT_NAME)
  })

  it('leaves Ctrl K to the screens, and sends its actions to them', () => {
    const all = items(menuTemplate('win32', true, hooks))
    const goTo = all.find((i) => i.label === 'Go to…')
    expect(goTo).toMatchObject({ accelerator: 'CmdOrCtrl+K', registerAccelerator: false })
    for (const label of ['Go to…', 'Guides and help', 'Settings', 'Contact support…', 'Download page']) {
      const item = all.find((i) => i.label === label)
      ;(item?.click as unknown as () => void)()
    }
    expect(sent).toEqual(['goto', 'about', 'settings'])
    expect(opened).toEqual([SUPPORT_MAILTO, DOWNLOAD_PAGE])
    expect(SUPPORT_MAILTO.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`)).toBe(true)
    expect(DOWNLOAD_PAGE.startsWith('https://')).toBe(true)
  })
})

describe('the checksums', () => {
  it('lists each installer with its SHA-256, in the format sha256sum checks, and nothing else', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-'))
    writeFileSync(join(dir, 'AETERNA-CRM-5.0.0-setup.exe'), 'installer bytes')
    writeFileSync(join(dir, 'AETERNA-CRM-5.0.0-arm64.dmg'), 'disk image bytes')
    writeFileSync(join(dir, 'builder-debug.yml'), 'not a release file')
    const lines = await writeChecksums(dir)
    const sha = (s: string): string => createHash('sha256').update(s).digest('hex')
    expect(lines).toEqual([`${sha('disk image bytes')}  AETERNA-CRM-5.0.0-arm64.dmg`, `${sha('installer bytes')}  AETERNA-CRM-5.0.0-setup.exe`])
    expect(readFileSync(join(dir, 'SHA256SUMS.txt'), 'utf8')).toBe(`${lines.join('\n')}\n`)
  })
})
