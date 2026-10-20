import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain .mjs script, used here for its two helpers
import { locateInAsar, tamper } from '../../scripts/asar-tamper-check.mjs'

const ROOT = resolve(__dirname, '../..')
const read = (f: string): string => readFileSync(join(ROOT, f), 'utf8')

describe('packaging configuration', () => {
  it('has one source — electron-builder.yml — since a "build" section in package.json would silently replace it', () => {
    const pkg = JSON.parse(read('package.json')) as Record<string, unknown>
    expect(pkg.build).toBeUndefined()
    expect(pkg.productName).toBe('AETERNA CRM') // the data folder's name, in development and installed alike
  })

  it('names the app as the code does, and switches on every anti-tamper fuse', () => {
    const yml = read('electron-builder.yml')
    const appId = /export const APP_ID = '([^']+)'/.exec(read('src/main/index.ts'))?.[1]
    expect(yml).toMatch(new RegExp(`^appId: ${appId?.replace(/\./g, '\\.')}$`, 'm'))
    expect(yml).toMatch(/^productName: AETERNA CRM$/m)
    for (const [fuse, on] of [
      ['runAsNode', false], ['enableNodeOptionsEnvironmentVariable', false], ['enableNodeCliInspectArguments', false],
      ['enableEmbeddedAsarIntegrityValidation', true], ['onlyLoadAppFromAsar', true]
    ] as const) {
      expect(yml, fuse).toMatch(new RegExp(`^\\s+${fuse}: ${on}\\b`, 'm'))
    }
    expect(yml).toMatch(/^asar: true$/m)
  })

  it('packs only the built app: never the sources, tests, documents or the vendor’s licence tool', () => {
    const yml = read('electron-builder.yml')
    const files = /^files:\n((?:\s+- .+\n)+)/m.exec(yml)?.[1].trim().split('\n').map((l) => l.replace(/^\s*-\s*/, '').replace(/['"]/g, ''))
    expect(files).toEqual(['out/**/*', 'resources/**/*'])
    expect(yml).not.toMatch(/example\.com/)
  })
})

describe('the tamper check', () => {
  /** An archive in asar's layout: a size pickle, a header pickle holding the JSON index, then the files. */
  function asar(files: Record<string, string>): Buffer {
    let offset = 0
    const tree: { files: Record<string, unknown> } = { files: {} }
    const data: Buffer[] = []
    for (const [path, text] of Object.entries(files)) {
      const bytes = Buffer.from(text)
      let node = tree
      const parts = path.split('/')
      for (const part of parts.slice(0, -1)) node = ((node.files[part] ??= { files: {} }) as typeof tree)
      node.files[parts.at(-1) as string] = { size: bytes.length, offset: String(offset) }
      offset += bytes.length
      data.push(bytes)
    }
    const json = Buffer.from(JSON.stringify(tree))
    const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4)])
    const headerPickle = Buffer.alloc(8 + padded.length)
    headerPickle.writeUInt32LE(4 + padded.length, 0)
    headerPickle.writeUInt32LE(json.length, 4)
    padded.copy(headerPickle, 8)
    const sizePickle = Buffer.alloc(8)
    sizePickle.writeUInt32LE(4, 0)
    sizePickle.writeUInt32LE(headerPickle.length, 4)
    return Buffer.concat([sizePickle, headerPickle, ...data])
  }

  it('changes one letter inside out/main/index.js, and nothing else', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'asar-')), 'app.asar')
    const original = asar({ 'package.json': '{"main":"out/main/index.js"}', 'out/main/index.js': 'log(`AETERNA CRM ${v} starting`)' })
    writeFileSync(p, original)
    const where = locateInAsar(original)
    expect(original.subarray(where.start, where.start + where.size).toString()).toBe('log(`AETERNA CRM ${v} starting`)')
    const at = tamper(p)
    const edited = readFileSync(p)
    expect(edited.subarray(where.start, where.start + where.size).toString()).toBe('log(`AETERNB CRM ${v} starting`)')
    expect([...edited].filter((b, i) => b !== original[i])).toHaveLength(1)
    expect(at).toBe(where.start + 11)
  })
})

