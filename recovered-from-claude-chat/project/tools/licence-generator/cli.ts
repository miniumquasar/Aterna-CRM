/**
 * AETERNA CRM licence tool — for the vendor only. It never ships inside the app.
 *
 *   npm run licence -- init         [--key-id 0]
 *   npm run licence -- issue        --firm "Firm Ltd" [--term 12m] [--starts YYYY-MM-DD] [--machine CODE] [--reference INV-1042]
 *   npm run licence -- renew        --serial 12 [--term 12m] [--starts YYYY-MM-DD] [--reference INV-1101]
 *   npm run licence -- replace      --serial 12 --firm "New Name Ltd" [--reference …]
 *   npm run licence -- revoke       --serial 12 --reason "refund"
 *   npm run licence -- clock-reset  --machine CODE [--serial 12] [--reference …]
 *   npm run licence -- show         --serial 12            (the key and the message again, for a firm that lost it)
 *   npm run licence -- verify       <KEY> [--machine CODE]
 *   npm run licence -- list         [--firm text]
 *   npm run licence -- trust-file   [--write src/main/licence/public-keys.ts]
 *   npm run licence -- public-key   [--key-id 0]
 *
 * Common options: --issued YYYY-MM-DD (default today), --key-id N (default: the newest
 * signing key), --home DIR (default ~/.aeterna-licensing, or LICENCE_HOME).
 *
 * The files live outside the repository so they can never be committed. The passphrase is
 * prompted for, or read from LICENCE_PASSPHRASE for scripted use. See docs/LICENSING.md.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { addDays, daysBetween, isIsoDate, todayIso } from '../../src/main/import/core/rules'
import { fromBase64Url, publicKeyFromRaw, verifyEd25519 } from '../../src/main/licence/ed25519'
import { endOf } from '../../src/main/licence/engine'
import {
  cleanFirmName, decodePayload, firmBytes, formatMachineCode, isLegacyKey, MAX_FIRM_BYTES, parseMachineCode, signingInput, splitKey, termLabel, type Term
} from '../../src/main/licence/format'
import { issueKey, parseTerm } from './issue'
import {
  accountKeys, appendKey, appendRevocation, isKey, isLegacy, nextSerial, readRegister, revocations, type KeyRecord, type RegisterRecord
} from './register'
import { createVault, openVault, type VaultFile } from './vault'

type Opts = Record<string, string | true>

function parseArgs(argv: string[]): { cmd: string; positional: string[]; opt: Opts } {
  const [cmd = 'help', ...rest] = argv
  const opt: Opts = {}
  const positional: string[] = []
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i]
    if (!a.startsWith('--')) {
      positional.push(a)
      continue
    }
    const next = rest[i + 1]
    if (next === undefined || next.startsWith('--')) opt[a.slice(2)] = true
    else {
      opt[a.slice(2)] = next
      i += 1
    }
  }
  return { cmd, positional, opt }
}

const str = (o: Opts, k: string): string | undefined => (typeof o[k] === 'string' ? (o[k] as string) : undefined)

function homeDir(o: Opts): string {
  const dir = str(o, 'home') ?? process.env.LICENCE_HOME ?? join(homedir(), '.aeterna-licensing')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}

const vaultPath = (dir: string, keyId: number): string => join(dir, `signing-key-${keyId}.json`)
const registerPath = (dir: string): string => join(dir, 'register.jsonl')

/** Signing keys present in the folder, by id. */
function signingKeyIds(dir: string): number[] {
  return readdirSync(dir)
    .map((f) => /^signing-key-(\d{1,2})\.json$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .filter((n) => n >= 0 && n <= 15)
    .sort((a, b) => a - b)
}

function keyIdOf(o: Opts, dir: string): number {
  const given = str(o, 'key-id')
  if (given === undefined) {
    const ids = signingKeyIds(dir)
    if (!ids.length) throw new Error(`No signing key in ${dir}. Run "init" first.`)
    return ids[ids.length - 1]
  }
  const id = Number(given)
  if (!Number.isInteger(id) || id < 0 || id > 15) throw new Error('--key-id must be 0–15')
  return id
}

function loadVault(dir: string, keyId: number): VaultFile {
  const p = vaultPath(dir, keyId)
  if (!existsSync(p)) throw new Error(`No signing key ${keyId} in ${dir}. Run "init" first.`)
  return JSON.parse(readFileSync(p, 'utf8')) as VaultFile
}

async function askHidden(question: string): Promise<string> {
  const stdin = process.stdin
  if (!stdin.isTTY) throw new Error('No terminal to ask for the passphrase. Set LICENCE_PASSPHRASE.')
  process.stdout.write(question)
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  return new Promise((resolve) => {
    let value = ''
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          process.stdout.write('\n')
          resolve(value)
          return
        }
        if (ch === '\u0003') {
          process.stdout.write('\n')
          process.exit(130)
        }
        value = ch === '\u007f' || ch === '\b' ? value.slice(0, -1) : value + ch
      }
    }
    stdin.on('data', onData)
  })
}

async function passphrase(confirm: boolean): Promise<string> {
  if (process.env.LICENCE_PASSPHRASE) return process.env.LICENCE_PASSPHRASE
  const first = await askHidden(confirm ? 'New passphrase (12+ characters): ' : 'Passphrase: ')
  if (confirm && (await askHidden('Repeat passphrase: ')) !== first) throw new Error('The passphrases did not match')
  return first
}

// ── Dates and wording ─────────────────────────────────────────────────────────

const longDate = (iso: string): string => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const serialLabel = (keyId: number, serial: number): string => `${keyId ? `${keyId}/` : ''}${String(serial).padStart(6, '0')}`
const lastDay = (startsOn: string, term: Term): string => addDays(endOf(startsOn, term), -1)

function dateOpt(o: Opts, name: string): string | undefined {
  const v = str(o, name)
  if (v !== undefined && !isIsoDate(v)) throw new Error(`--${name} must be a date, YYYY-MM-DD`)
  return v
}

function firmOpt(o: Opts): string {
  const raw = str(o, 'firm') ?? str(o, 'customer') // --customer: the first version's name for it
  const firm = raw ? cleanFirmName(raw) : ''
  if (firm.length < 2) throw new Error('--firm is required: the firm’s name exactly as it should show in the app')
  if (firmBytes(firm) > MAX_FIRM_BYTES) throw new Error(`The firm’s name is too long for a key (${MAX_FIRM_BYTES} bytes at most)`)
  return firm
}

/** The key record with this serial (and signing key, when several share the serial). */
function findKey(records: readonly RegisterRecord[], o: Opts): KeyRecord {
  const serial = Number(str(o, 'serial'))
  if (!Number.isInteger(serial) || serial < 1) throw new Error('--serial is required: the licence number, as `list` shows it')
  const keyId = str(o, 'key-id')
  const matches = records.filter((r): r is KeyRecord => isKey(r) && r.serial === serial && (keyId === undefined || r.keyId === Number(keyId)))
  if (!matches.length) {
    const legacy = records.some((r) => isLegacy(r) && r.serial === serial)
    throw new Error(legacy
      ? `Licence ${serial} is an older-format key. Issue the firm a new key with "issue --firm … --starts …" covering the same dates.`
      : `No licence ${serial} in the register`)
  }
  if (matches.length > 1) throw new Error(`More than one signing key issued serial ${serial}: add --key-id`)
  return matches[0]
}

/** The latest day an account is covered to, ignoring withdrawn keys. */
function accountEnd(records: readonly RegisterRecord[], account: string): string | null {
  const withdrawn = revocations(records)
  return accountKeys(records, account)
    .filter((r) => r.type === 'term' && !withdrawn.has(`${r.keyId}:${r.serial}`))
    .map((r) => r.validUntil)
    .sort()
    .at(-1) ?? null
}

/** The account's current name: the newest key's. */
const accountFirm = (records: readonly RegisterRecord[], account: string): string => accountKeys(records, account).at(-1)?.firm ?? ''

function messageFor(r: KeyRecord): string {
  return [
    '--- message for the firm ---',
    `Your AETERNA CRM licence key for ${r.firm} covers ${longDate(r.startsOn)} to ${longDate(r.validUntil)}.`,
    '',
    'To enter it: open AETERNA CRM, choose Licence in the sidebar, paste the whole key below and press "Activate key".',
    r.machineCode ? `This key works only on the computer with machine code ${r.machineCode}.` : 'Use the same key on every PC in your firm.',
    '',
    r.key,
    '--- end ---'
  ].join('\n')
}

// ── Issuing ──────────────────────────────────────────────────────────────────

interface Issue {
  dir: string
  keyId: number
  type: 'term' | 'clock_reset'
  term: Term
  issuedOn: string
  startsOn: string
  machine: Uint8Array | null
  firm: string
  account: string | null
  replaces: number | null
  reference: string | null
}

/** Signs a key, checks it against the public key, and records it. Nothing is recorded if the check fails. */
async function issue(i: Issue): Promise<KeyRecord> {
  const vault = loadVault(i.dir, i.keyId)
  const privateKey = openVault(vault, await passphrase(false))
  const verifier = publicKeyFromRaw(fromBase64Url(vault.publicKey))
  const records = readRegister(registerPath(i.dir))
  const serial = nextSerial(records, i.keyId)
  const key = issueKey({ privateKey, keyId: i.keyId, serial, type: i.type, term: i.term, issuedOn: i.issuedOn, startsOn: i.startsOn, machine: i.machine, firm: i.firm })
  const parts = splitKey(key)
  const decoded = parts ? decodePayload(parts.payload) : null
  if (!parts || !verifyEd25519(verifier, signingInput(parts.payload), parts.signature) || !decoded || 'problem' in decoded || decoded.payload.firm !== i.firm) {
    throw new Error('Self-check failed: the new key does not verify. Nothing was recorded.')
  }
  return appendKey(registerPath(i.dir), {
    keyId: i.keyId, serial, type: i.type, term: i.term, issuedOn: i.issuedOn, startsOn: i.startsOn,
    validUntil: i.type === 'term' ? lastDay(i.startsOn, i.term) : i.issuedOn,
    machineCode: i.machine ? formatMachineCode(i.machine) : null, firm: i.firm, account: i.account ?? `${i.keyId}:${serial}`,
    replaces: i.replaces, reference: i.reference, key, createdAt: new Date().toISOString()
  })
}

function describe(r: KeyRecord): string {
  const scope = r.machineCode ? `this computer only (${r.machineCode})` : 'any computer'
  return r.type === 'clock_reset'
    ? `Clock reset ${serialLabel(r.keyId, r.serial)} · issued ${r.issuedOn} · ${scope}`
    : `Licence ${serialLabel(r.keyId, r.serial)} for ${r.firm} · ${termLabel(r.term)} · covers ${longDate(r.startsOn)} – ${longDate(r.validUntil)} · ${scope}`
}

function machineOpt(o: Opts): Uint8Array | null {
  const text = str(o, 'machine')
  if (!text) return null
  const m = parseMachineCode(text)
  if (!m) throw new Error('That machine code is not valid — check it against the Licence screen')
  return m
}

const TRUST_HEADER = `/**
 * Trusted licence signing keys, and withdrawn licence keys.
 *
 * Written by the vendor tool:
 *   npm run licence -- trust-file --write src/main/licence/public-keys.ts
 * Only PUBLIC keys belong here — the private key never leaves the computer
 * licences are issued from. A withdrawn key stops working on a firm's PCs once
 * they install a release built with it listed here.
 *
 * Rotating: "init --key-id 1", ship both ids, issue new keys under 1, give
 * every firm a replacement key under 1, and only then drop id 0 (keys signed
 * with a dropped id stop counting, including ones already entered).
 */`

function trustFile(dir: string, records: readonly RegisterRecord[]): string {
  const trusted = signingKeyIds(dir).map((id) => `  ${id}: '${loadVault(dir, id).publicKey}',`)
  const withdrawn = [...revocations(records).entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([id, reason]) => `  '${id}', // ${reason.replace(/[\r\n*/]/g, ' ').slice(0, 80)}`)
  return [
    TRUST_HEADER,
    'export const TRUSTED_KEYS: Readonly<Record<number, string>> = {',
    ...trusted,
    '}',
    '',
    '/** Withdrawn keys (refunds, replaced keys, leaks), as `${signingKeyId}:${serial}`. */',
    `export const REVOKED: ReadonlySet<string> = new Set<string>([${withdrawn.length ? '' : '])'}`,
    ...(withdrawn.length ? [...withdrawn, '])'] : []),
    ''
  ].join('\n')
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { cmd, positional, opt } = parseArgs(process.argv.slice(2))
  if (cmd === 'help') {
    console.log('Commands: init | issue | renew | replace | revoke | clock-reset | show | verify | list | trust-file | public-key   (see docs/LICENSING.md)')
    return
  }
  const dir = homeDir(opt)
  const issuedOn = dateOpt(opt, 'issued') ?? todayIso()
  const reference = str(opt, 'reference') ?? null

  if (cmd === 'init') {
    const given = str(opt, 'key-id')
    const keyId = given === undefined ? 0 : Number(given)
    if (!Number.isInteger(keyId) || keyId < 0 || keyId > 15) throw new Error('--key-id must be 0–15')
    const p = vaultPath(dir, keyId)
    if (existsSync(p)) throw new Error(`Signing key ${keyId} already exists (${p}). To rotate, use a new --key-id.`)
    const vault = createVault(keyId, await passphrase(true))
    writeFileSync(p, JSON.stringify(vault, null, 2), { mode: 0o600, flag: 'wx' })
    console.log(`Signing key ${keyId} created: ${p}\n`)
    console.log('Next, put the public key into the app:')
    console.log('  npm run licence -- trust-file --write src/main/licence/public-keys.ts')
    console.log('then build the release from that.\n')
    console.log('Back up the key file and the passphrase, separately — two offline copies of each.')
    console.log('Without both you cannot issue keys this app accepts.')
    return
  }

  if (cmd === 'public-key') {
    const v = loadVault(dir, keyIdOf(opt, dir))
    console.log(`  ${v.keyId}: '${v.publicKey}',`)
    return
  }

  if (cmd === 'trust-file') {
    const text = trustFile(dir, readRegister(registerPath(dir)))
    const target = str(opt, 'write')
    if (!target) {
      process.stdout.write(text)
      return
    }
    writeFileSync(target, text)
    console.log(`Wrote ${target}: ${signingKeyIds(dir).length} signing key(s), ${revocations(readRegister(registerPath(dir))).size} withdrawn key(s). Build and release the app from this.`)
    return
  }

  if (cmd === 'issue') {
    const firm = firmOpt(opt)
    const records = readRegister(registerPath(dir))
    const existing = records.filter((r): r is KeyRecord => isKey(r) && r.firm.toLowerCase() === firm.toLowerCase())
    if (existing.length && opt['new-account'] !== true) {
      const last = existing.at(-1) as KeyRecord
      throw new Error(`${firm} already has licence ${serialLabel(last.keyId, last.serial)}. To add a year, use: renew --serial ${last.serial}` +
        ' — or add --new-account if this really is a different firm.')
    }
    const term = parseTerm(str(opt, 'term') ?? '12m')
    const startsOn = dateOpt(opt, 'starts') ?? issuedOn
    const r = await issue({ dir, keyId: keyIdOf(opt, dir), type: 'term', term, issuedOn, startsOn, machine: machineOpt(opt), firm, account: null, replaces: null, reference })
    console.log(`\n${describe(r)}\n\n${messageFor(r)}`)
    return
  }

  if (cmd === 'renew') {
    const records = readRegister(registerPath(dir))
    const from = findKey(records, opt)
    if (from.type !== 'term') throw new Error('That is a clock reset key; give the serial of the firm’s licence')
    const end = accountEnd(records, from.account)
    const startsOn = dateOpt(opt, 'starts') ?? (end ? addDays(end, 1) : issuedOn)
    if (!str(opt, 'starts') && end && daysBetween(addDays(end, 1), issuedOn) > 30) {
      console.log(`Note: ${accountFirm(records, from.account)}'s licence ended on ${longDate(end)}. Following the renewal rule, the new year starts the day after;` +
        ' add --starts YYYY-MM-DD to start it on another date.')
    }
    const term = parseTerm(str(opt, 'term') ?? '12m')
    const machine = str(opt, 'machine') ? machineOpt(opt) : from.machineCode ? parseMachineCode(from.machineCode) : null
    const r = await issue({
      dir, keyId: keyIdOf(opt, dir), type: 'term', term, issuedOn, startsOn, machine, firm: accountFirm(records, from.account),
      account: from.account, replaces: null, reference
    })
    console.log(`\n${describe(r)}\n\n${messageFor(r)}`)
    return
  }

  if (cmd === 'replace') {
    const records = readRegister(registerPath(dir))
    const from = findKey(records, opt)
    if (from.type !== 'term') throw new Error('Only a licence key can be replaced')
    const withdrawn = revocations(records)
    if (withdrawn.has(`${from.keyId}:${from.serial}`)) throw new Error(`Licence ${serialLabel(from.keyId, from.serial)} has already been withdrawn`)
    const firm = (str(opt, 'firm') ?? str(opt, 'customer')) !== undefined ? firmOpt(opt) : from.firm
    const keyId = keyIdOf(opt, dir)
    if (firm === from.firm && keyId === from.keyId) throw new Error('Give the firm’s new name with --firm (or a new signing key with --key-id)')
    const r = await issue({
      dir, keyId, type: 'term', term: from.term, issuedOn, startsOn: from.startsOn, machine: from.machineCode ? parseMachineCode(from.machineCode) : null,
      firm, account: from.account, replaces: from.serial, reference
    })
    appendRevocation(registerPath(dir), {
      keyId: from.keyId, serial: from.serial, reason: `replaced by ${serialLabel(r.keyId, r.serial)}`, createdAt: new Date().toISOString()
    })
    console.log(`\n${describe(r)}\nReplaces licence ${serialLabel(from.keyId, from.serial)} — same dates, no extra time.`)
    console.log('The old key is withdrawn in the register; run trust-file --write before the next release so it stops working.')
    console.log(`\n${messageFor(r)}`)
    return
  }

  if (cmd === 'revoke') {
    const records = readRegister(registerPath(dir))
    const from = findKey(records, opt)
    const reason = str(opt, 'reason')?.trim()
    if (!reason) throw new Error('--reason is required (refund, leaked, issued in error…); it goes in the register')
    if (revocations(records).has(`${from.keyId}:${from.serial}`)) throw new Error('That key is already withdrawn')
    appendRevocation(registerPath(dir), { keyId: from.keyId, serial: from.serial, reason, createdAt: new Date().toISOString() })
    console.log(`Withdrew ${describe(from)}.`)
    console.log('It stops working on the firm’s PCs once they install a release built after:')
    console.log('  npm run licence -- trust-file --write src/main/licence/public-keys.ts')
    return
  }

  if (cmd === 'clock-reset') {
    const machine = machineOpt(opt)
    if (!machine) throw new Error('A clock reset key is for one computer: add --machine (from the firm’s Licence screen)')
    const records = readRegister(registerPath(dir))
    const firm = str(opt, 'serial') ? accountFirm(records, findKey(records, opt).account) : str(opt, 'firm') ? firmOpt(opt) : ''
    const r = await issue({
      dir, keyId: keyIdOf(opt, dir), type: 'clock_reset', term: { unit: 'days', amount: 1 }, issuedOn, startsOn: issuedOn, machine, firm,
      account: str(opt, 'serial') ? findKey(records, opt).account : null, replaces: null, reference
    })
    console.log(`\n${describe(r)}\n${r.key}`)
    return
  }

  if (cmd === 'show') {
    const records = readRegister(registerPath(dir))
    const r = findKey(records, opt)
    const withdrawn = revocations(records).get(`${r.keyId}:${r.serial}`)
    console.log(`${describe(r)}${withdrawn ? `\nWITHDRAWN: ${withdrawn} — do not send this key again.` : ''}\n\n${messageFor(r)}`)
    return
  }

  if (cmd === 'verify') {
    const input = positional[0] ?? ''
    if (isLegacyKey(input)) throw new Error('That is an older-format key (format 1). The app no longer accepts it: issue a new key.')
    const parts = splitKey(input)
    if (!parts) throw new Error('That is not a complete key')
    const keyId = parts.payload[0] & 15
    if (!existsSync(vaultPath(dir, keyId))) throw new Error(`No signing key ${keyId} here to verify against`)
    const ok = verifyEd25519(publicKeyFromRaw(fromBase64Url(loadVault(dir, keyId).publicKey)), signingInput(parts.payload), parts.signature)
    const decoded = decodePayload(parts.payload)
    if (!ok || 'problem' in decoded) {
      console.log('INVALID — this key was not issued with this signing key, or it has been altered.')
      process.exitCode = 2
      return
    }
    const p = decoded.payload
    if (p.type === 'term') {
      console.log(`Valid licence ${serialLabel(p.signingKeyId, p.serial)} for ${p.firm} · ${termLabel(p.term)} · covers ${longDate(p.startsOn)} – ${longDate(lastDay(p.startsOn, p.term))} · issued ${p.issuedOn}`)
    } else {
      console.log(`Valid clock reset ${serialLabel(p.signingKeyId, p.serial)} · issued ${p.issuedOn}`)
    }
    console.log(p.machine ? `Locked to machine ${formatMachineCode(p.machine)}` : 'Works on any computer')
    const withdrawn = revocations(readRegister(registerPath(dir))).get(`${p.signingKeyId}:${p.serial}`)
    if (withdrawn) console.log(`WITHDRAWN in the register: ${withdrawn}`)
    const check = str(opt, 'machine')
    if (check && p.machine) {
      const m = parseMachineCode(check)
      console.log(m && m.every((b, i) => b === p.machine![i]) ? 'Matches the machine code given.' : 'Does NOT match the machine code given.')
    }
    return
  }

  if (cmd === 'list') {
    const records = readRegister(registerPath(dir))
    const withdrawn = revocations(records)
    const filter = str(opt, 'firm')?.toLowerCase()
    let shown = 0
    for (const r of records) {
      if (isKey(r)) {
        if (filter && !r.firm.toLowerCase().includes(filter)) continue
        shown += 1
        const status = withdrawn.get(`${r.keyId}:${r.serial}`)
        console.log([
          serialLabel(r.keyId, r.serial).padEnd(9),
          r.type === 'term' ? `${r.startsOn} → ${r.validUntil}` : `clock reset ${r.issuedOn}  `,
          (r.machineCode ?? 'any computer').padEnd(16),
          r.firm,
          r.reference ?? '',
          status ? `[withdrawn: ${status}]` : ''
        ].join('  ').trimEnd())
      } else if (isLegacy(r)) {
        if (filter && !r.customer.toLowerCase().includes(filter)) continue
        shown += 1
        console.log(`${serialLabel(r.keyId, r.serial).padEnd(9)}  issued ${r.issuedOn}  ${r.customer}  [older format: issue a new key]`)
      }
    }
    if (!shown) console.log(filter ? 'No keys for that firm.' : 'No keys issued yet.')
    console.log(`\n${records.length} register line(s) · integrity verified`)
    return
  }

  throw new Error(`Unknown command "${cmd}"`)
}

main().catch((err: unknown) => {
  console.error(`✖ ${(err as Error).message}`)
  process.exit(1)
})
