import { describe, expect, it } from 'vitest'
import { isAllowedExternalUrl } from '@main/app/external-links'
import { dataPathsFor, resolveDataRoot } from '@main/app/paths'
import { startupErrorHtml } from '@main/startup/error-window'
import { StartupFailure, StartupRunner } from '@main/startup/steps'
import { join, resolve } from 'node:path'

describe('external links', () => {
  it.each([
    ['https://www.gov.uk/log-in-file-self-assessment-tax-return', true],
    ['https://find-and-update.company-information.service.gov.uk/company/01234567', true],
    ['https://www.companieshouse.gov.uk/', true],
    ['https://ollama.com/download', true],
    ['https://bitopi.co.uk/', true],
    ['mailto:client@example.co.uk?subject=Accounts', true],
    ['https://wa.me/447555221010', true],
    ['http://www.gov.uk/', false],
    ['https://gov.uk.evil.example/', false],
    ['https://evilgov.uk/', false],
    ['https://user:pass@www.gov.uk/', false],
    ['file:///C:/Windows/System32/cmd.exe', false],
    ['javascript:alert(1)', false],
    ['https://example.com/', false],
    ['not a url', false]
  ])('%s → %s', (url, allowed) => {
    expect(isAllowedExternalUrl(url)).toBe(allowed)
  })
})

describe('data folder', () => {
  it('lives under appData as AETERNA CRM, unless AETERNA_DATA_DIR says otherwise', () => {
    expect(resolveDataRoot('/home/u/.config', {})).toBe(join('/home/u/.config', 'AETERNA CRM'))
    expect(resolveDataRoot('/x', { AETERNA_DATA_DIR: '/tmp/smoke-1' })).toBe('/tmp/smoke-1')
    expect(resolveDataRoot('/x', { AETERNA_DATA_DIR: 'relative/dir' })).toBe(resolve('relative/dir'))
    const p = dataPathsFor('/data')
    expect(p).toMatchObject({ database: join('/data', 'aeterna.db'), keyFile: join('/data', 'database-key.json'), startupLog: join('/data', 'logs', 'startup.log') })
  })
})

describe('start-up', () => {
  it('logs each step and names the one that failed', async () => {
    const lines: string[] = []
    const runner = new StartupRunner(9, (l) => lines.push(l))
    expect(await runner.run(1, 'First', () => 7)).toBe(7)
    await expect(runner.run(2, 'Second', () => { throw new Error('boom') })).rejects.toBeInstanceOf(StartupFailure)
    expect(lines.join('\n')).toMatch(/step 1\/9 First: started[\s\S]*step 1\/9 First: done[\s\S]*step 2\/9 Second: FAILED/)
  })

  it('shows the problem and the log path, escaped', () => {
    const html = startupErrorHtml('The key <file> is missing.', 'C:\\Users\\a\\AppData\\Roaming\\AETERNA CRM\\logs\\startup.log')
    expect(html).toContain('The key &lt;file&gt; is missing.')
    expect(html).toContain('startup.log')
    expect(html).toContain("default-src 'none'")
  })
})
