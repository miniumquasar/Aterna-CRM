import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { outsideCopy, registrySink, type RegRunner } from '../../src/main/licence/store'
import { clock, makeService, memorySink, vendor } from './helpers'

/** reg.exe as far as these sinks use it: one key, values by name. */
function fakeRegistry(): { run: RegRunner; values: Map<string, string>; calls: string[][] } {
  const values = new Map<string, string>()
  const calls: string[][] = []
  const run: RegRunner = (args) => {
    calls.push(args)
    const [verb, key] = args
    const name = args[args.indexOf('/v') + 1]
    if (verb === 'add') {
      values.set(name, args[args.indexOf('/d') + 1])
      return 'The operation completed successfully.\r\n'
    }
    if (!values.has(name)) throw new Error('ERROR: The system was unable to find the specified registry key or value.')
    return `\r\n${key}\r\n    ${name}    REG_SZ    ${values.get(name)}\r\n\r\n`
  }
  return { run, values, calls }
}

describe('licence state outside the app’s folders', () => {
  it('keeps a copy in the Windows registry, and reads it back', () => {
    const reg = fakeRegistry()
    const sink = registrySink('HKCU\\Software\\Bitopi\\AETERNA CRM', 'LicenceState', reg.run)
    expect(sink.read()).toBeNull() // nothing yet
    sink.write('{"v":1,"data":{"keys":["A"]},"mac":"x"}')
    expect(reg.calls.at(-1)?.slice(0, 2)).toEqual(['add', 'HKCU\\Software\\Bitopi\\AETERNA CRM'])
    expect(reg.values.get('LicenceState')).toMatch(/^[A-Za-z0-9+/=]+$/) // base64: nothing for reg.exe to misread
    expect(sink.read()).toBe('{"v":1,"data":{"keys":["A"]},"mac":"x"}')
    expect(outsideCopy('win32', 'C:\\Users\\a', {}, reg.run).name).toBe('registry')
  })

  it('keeps a copy in the macOS Library and the Linux state folder', () => {
    const home = mkdtempSync(join(tmpdir(), 'home-'))
    const mac = outsideCopy('darwin', home)
    mac.write('mac copy')
    expect(readFileSync(join(home, 'Library', 'Preferences', '.uk.co.bitopi.aeternacrm.licence'), 'utf8')).toBe('mac copy')
    const linux = outsideCopy('linux', home, {})
    linux.write('linux copy')
    expect(readFileSync(join(home, '.local', 'state', 'aeterna-crm', 'licence'), 'utf8')).toBe('linux copy')
    const xdg = outsideCopy('linux', home, { XDG_STATE_HOME: join(home, 'state') })
    xdg.write('xdg copy')
    expect(readFileSync(join(home, 'state', 'aeterna-crm', 'licence'), 'utf8')).toBe('xdg copy')
  })

  it('remembers the trial when the app’s data folder and database are gone', () => {
    const reg = fakeRegistry()
    const c = clock('2026-10-02')
    const outside = registrySink('HKCU\\Software\\Bitopi\\AETERNA CRM', 'LicenceState', reg.run)
    makeService({ sinks: [memorySink('file'), memorySink('database'), outside], trusted: { 0: vendor().publicKey }, clock: c }).status()
    c.days(45)
    // a fresh data folder and database: only the registry copy is left
    const after = makeService({ sinks: [memorySink('file'), memorySink('database'), outside], trusted: { 0: vendor().publicKey }, clock: c }).status()
    expect(after).toMatchObject({ state: 'trial', trialStartedOn: '2026-10-02', daysRemaining: 15 })
  })
})

