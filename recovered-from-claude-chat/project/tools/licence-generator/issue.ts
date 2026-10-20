import type { KeyObject } from 'node:crypto'
import { signEd25519 } from '../../src/main/licence/ed25519'
import { assembleKey, cleanFirmName, encodePayload, FORMAT_VERSION, PRODUCT_CRM, signingInput, type KeyType, type Term } from '../../src/main/licence/format'

export function issueKey(o: {
  privateKey: KeyObject
  keyId: number
  serial: number
  type: KeyType
  term: Term
  issuedOn: string
  /** The first day covered; a clock reset key leaves it at the issue date. */
  startsOn?: string
  machine: Uint8Array | null
  /** The licensed firm, as it will show in the app. */
  firm: string
}): string {
  const payload = encodePayload({
    version: FORMAT_VERSION, signingKeyId: o.keyId, product: PRODUCT_CRM, type: o.type, term: o.term,
    serial: o.serial, issuedOn: o.issuedOn, startsOn: o.startsOn ?? o.issuedOn, machine: o.machine, firm: cleanFirmName(o.firm)
  })
  return assembleKey(payload, signEd25519(o.privateKey, signingInput(payload)))
}

/** "12m", "1y", "30d", "18 months" → Term (1–127 months or days). */
export function parseTerm(text: string): Term {
  const m = /^\s*(\d+)\s*(y|yr|yrs|year|years|m|mo|mth|month|months|d|day|days)\s*$/i.exec(text)
  if (!m) throw new Error(`Term "${text}" not understood — use e.g. 12m, 1y or 30d`)
  const n = Number(m[1])
  const u = m[2].toLowerCase()
  const term: Term = u.startsWith('y') ? { unit: 'months', amount: n * 12 } : u.startsWith('d') ? { unit: 'days', amount: n } : { unit: 'months', amount: n }
  if (term.amount < 1 || term.amount > 127) throw new Error('A term runs from 1 to 127 months, or 1 to 127 days')
  return term
}
