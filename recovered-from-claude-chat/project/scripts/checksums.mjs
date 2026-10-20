#!/usr/bin/env node
/**
 * Writes SHA256SUMS.txt beside the release files: one line per installer or
 * disk image, in the format `sha256sum -c` and PowerShell can check. The
 * download page lists the same values, so a firm can confirm the file it
 * downloaded is the one released (docs/INSTALLING.md shows how).
 *
 *   node scripts/checksums.mjs [release-folder]
 */
import { createHash } from 'node:crypto'
import { createReadStream, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const RELEASE_FILES = /\.(exe|dmg|zip|AppImage|deb)$/i

export function sha256(file) {
  return new Promise((done, fail) => {
    const hash = createHash('sha256')
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => done(hash.digest('hex')))
      .on('error', fail)
  })
}

export async function writeChecksums(folder) {
  const files = readdirSync(folder)
    .filter((f) => RELEASE_FILES.test(f) && statSync(join(folder, f)).isFile())
    .sort()
  const lines = []
  for (const f of files) lines.push(`${await sha256(join(folder, f))}  ${f}`)
  writeFileSync(join(folder, 'SHA256SUMS.txt'), lines.length ? `${lines.join('\n')}\n` : '')
  return lines
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('checksums.mjs')) {
  const folder = resolve(process.argv[2] ?? 'release')
  const lines = await writeChecksums(folder)
  if (!lines.length) {
    console.error(`No installers found in ${folder}.`)
    process.exit(1)
  }
  console.log(`SHA256SUMS.txt in ${folder}:\n${lines.join('\n')}`)
}
