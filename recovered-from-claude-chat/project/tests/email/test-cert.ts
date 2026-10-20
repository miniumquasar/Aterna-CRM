/**
 * A throwaway self-signed certificate for 127.0.0.1 and localhost, made fresh
 * for each test run with node:crypto — so no private key lives in the repo and
 * no certificate can expire under the tests.
 */
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto'

const length = (n: number): Buffer => {
  if (n < 128) return Buffer.from([n])
  const bytes: number[] = []
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff)
  return Buffer.from([0x80 | bytes.length, ...bytes])
}
const tlv = (tag: number, content: Buffer): Buffer => Buffer.concat([Buffer.from([tag]), length(content.length), content])
const seq = (...items: Buffer[]): Buffer => tlv(0x30, Buffer.concat(items))
const set = (...items: Buffer[]): Buffer => tlv(0x31, Buffer.concat(items))
const int = (b: Buffer): Buffer => tlv(0x02, b[0] & 0x80 ? Buffer.concat([Buffer.from([0]), b]) : b)
const oid = (dotted: string): Buffer => {
  const [a, b, ...rest] = dotted.split('.').map(Number)
  const out = [40 * a + b]
  for (const n of rest) {
    const chunk: number[] = [n & 0x7f]
    for (let v = Math.floor(n / 128); v > 0; v = Math.floor(v / 128)) chunk.unshift(0x80 | (v & 0x7f))
    out.push(...chunk)
  }
  return tlv(0x06, Buffer.from(out))
}
const utf8 = (s: string): Buffer => tlv(0x0c, Buffer.from(s, 'utf8'))
const utcTime = (d: Date): Buffer => tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'))
const explicit = (n: number, content: Buffer): Buffer => tlv(0xa0 + n, content)

export function selfSignedCertificate(): { key: string; cert: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const name = seq(set(seq(oid('2.5.4.3'), utf8('localhost'))))
  const ecdsaSha256 = seq(oid('1.2.840.10045.4.3.2'))
  const now = Date.now()
  const san = seq(oid('2.5.29.17'), tlv(0x04, seq(tlv(0x82, Buffer.from('localhost')), tlv(0x87, Buffer.from([127, 0, 0, 1])))))
  const serial = randomBytes(8)
  serial[0] &= 0x7f
  const tbs = seq(
    explicit(0, int(Buffer.from([2]))),
    int(serial),
    ecdsaSha256,
    name,
    seq(utcTime(new Date(now - 86_400_000)), utcTime(new Date(now + 7 * 86_400_000))),
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
    explicit(3, seq(san))
  )
  const signature = sign('sha256', tbs, privateKey)
  const der = seq(tbs, ecdsaSha256, tlv(0x03, Buffer.concat([Buffer.from([0]), signature])))
  const pem = `-----BEGIN CERTIFICATE-----\n${der.toString('base64').replace(/(.{64})/g, '$1\n').replace(/\n$/, '')}\n-----END CERTIFICATE-----\n`
  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, cert: pem }
}
