/**
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
 */
export const TRUSTED_KEYS: Readonly<Record<number, string>> = {
}

/** Withdrawn keys (refunds, replaced keys, leaks), as `${signingKeyId}:${serial}`. */
export const REVOKED: ReadonlySet<string> = new Set<string>([])
