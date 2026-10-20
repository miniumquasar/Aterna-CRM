/**
 * The vault passphrase sheet: the passphrase on paper, printed once when the
 * vault is set up. The app never stores the passphrase, so this is the only
 * time it can print it; afterwards the paper (or the partners' password
 * manager) is the only copy.
 *
 * Printed straight to a printer, never saved as a file. The page has no
 * scripts and no network access.
 */

const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** The passphrase in groups of four, so it can be read back and typed without losing the place. */
export function passphraseGroups(passphrase: string): string[] {
  const chars = [...passphrase.normalize('NFKC')]
  const groups: string[] = []
  for (let i = 0; i < chars.length; i += 4) groups.push(chars.slice(i, i + 4).join(''))
  return groups
}

/** Names the characters a reader could mistake for others. */
function lookalikes(passphrase: string): string[] {
  const notes: string[] = []
  const has = (c: string): boolean => passphrase.includes(c)
  if (has(' ')) notes.push('It contains spaces; each is shown as ␣.')
  if (has('0') || has('O') || has('o')) notes.push('0 is the digit zero; O and o are letters.')
  if (has('1') || has('l') || has('I') || has('|')) notes.push('1 is the digit one; l is a small L; I is a capital i.')
  return notes
}

export function vaultSheetHtml(o: { passphrase: string; firm: string; productName: string; createdFor: string; date: string }): string {
  const shown = passphraseGroups(o.passphrase).map((g) => `<span>${escape(g).replace(/ /g, '␣')}</span>`).join('')
  const notes = lookalikes(o.passphrase).map((n) => `<li>${escape(n)}</li>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escape(o.productName)} vault passphrase</title>
<style>
  @page { size: A4; margin: 18mm }
  body { font: 11pt/1.5 Georgia, 'Times New Roman', serif; color: #111 }
  h1 { font: 600 18pt/1.2 Arial, sans-serif; margin: 0 0 4mm }
  .meta { font: 10pt Arial, sans-serif; color: #444; margin-bottom: 8mm }
  .box { border: 1.5pt solid #111; padding: 6mm; margin: 6mm 0; text-align: center }
  .box span { display: inline-block; font: 600 17pt/1.6 'Courier New', monospace; margin: 0 2.5mm; white-space: pre }
  h2 { font: 600 11pt Arial, sans-serif; margin: 6mm 0 2mm }
  li { margin: 1mm 0 }
  .warn { font-weight: 600 }
</style></head><body>
<h1>${escape(o.productName)} — vault passphrase</h1>
<div class="meta">${escape(o.firm)} · printed ${escape(o.date)} for ${escape(o.createdFor)}</div>
<p class="warn">This passphrase opens the clients’ stored logins and codes. Anyone holding this sheet and a copy of the practice database can read them. Seal it in an envelope and keep it in the safe, apart from the encryption key’s recovery sheet.</p>
<div class="box">${shown}</div>
<p>Groups of four are only to make it easier to read; type it without gaps${o.passphrase.includes(' ') ? ', but with the spaces marked ␣' : ''}.</p>
${notes ? `<ul>${notes}</ul>` : ''}
<h2>Keep it safe</h2>
<ol>
  <li>The app does not keep the passphrase anywhere, and it is not in any backup. If this sheet is lost and nobody remembers it, the stored logins can’t be opened again — even after a restore.</li>
  <li>Make sure at least two partners know where the envelope is.</li>
  <li>If the passphrase is ever changed, destroy this sheet.</li>
</ol>
</body></html>`
}
