/**
 * Cells copied from Excel or Google Sheets arrive as text: one row per line,
 * cells separated by tabs. Text from a CSV file uses commas instead. A cell
 * that holds the separator, a line break or a quote mark comes wrapped in
 * double quotes, with any quote mark inside doubled ("Smith, Jones & Co").
 *
 * The first row with anything in it is the headings; blank rows are dropped.
 * Cells are trimmed.
 */
export function parsePastedCells(raw: string): { headers: string[]; rows: string[][] } {
  const text = raw.replace(/\r\n?/g, '\n')
  if (!text.trim()) return { headers: [], rows: [] }
  const firstLine = text.split('\n').find((l) => l.trim() !== '') ?? ''
  const sep = firstLine.includes('\t') ? '\t' : ','

  const all: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let wasQuoted = false
  const endCell = (): void => {
    row.push(wasQuoted ? cell : cell.trim())
    cell = ''
    wasQuoted = false
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"' && cell.trim() === '' && !wasQuoted) {
      quoted = true
      wasQuoted = true
      cell = ''
    } else if (ch === sep) endCell()
    else if (ch === '\n') {
      endCell()
      all.push(row)
      row = []
    } else if (!wasQuoted) cell += ch
    // Anything after a closing quote and before the separator is ignored.
  }
  endCell()
  all.push(row)

  const kept = all.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
  return { headers: kept[0] ?? [], rows: kept.slice(1) }
}
