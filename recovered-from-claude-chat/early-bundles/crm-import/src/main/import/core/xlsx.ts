/**
 * Minimal, safe spreadsheet reader on ExcelJS (pure JS, MIT).
 *
 * Chosen over the npm `xlsx` package because that registry build is frozen
 * at 0.18.5 with published advisories; ExcelJS reads Excel Tables, dates and
 * cached formula results without evaluating anything.
 *
 * Formula cells yield their cached result. Calculated columns should not be
 * imported anyway (adapters recompute), but lookups such as CLIENT_NAME on a
 * child sheet are read from cache when an adapter chooses to.
 */

import ExcelJS from 'exceljs'
import type { CellValue } from './normalise'

export interface SheetRecord {
  /** 1-based worksheet row number, for provenance. */
  row: number
  values: Record<string, CellValue>
}

export interface SheetData {
  name: string
  headers: string[]
  records: SheetRecord[]
}

export async function readWorkbook(path: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  return wb
}

function flatten(v: ExcelJS.CellValue | undefined): CellValue {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (typeof v === 'object') {
    if ('result' in v) return flatten(v.result as ExcelJS.CellValue)
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('hyperlink' in v && 'text' in v) return flatten(v.text as ExcelJS.CellValue)
    if ('error' in v) return null
  }
  return null
}

/**
 * Reads a worksheet as records keyed by header text. The header row is the
 * first row (within the first 10) that contains `keyColumn`, which copes with
 * banner rows such as the security warning above the Credentials table.
 */
export function readSheet(wb: ExcelJS.Workbook, sheetName: string, keyColumn: string): SheetData | null {
  const ws = wb.getWorksheet(sheetName)
  if (!ws) return null

  let headerRow = 0
  let headers: string[] = []
  for (let r = 1; r <= Math.min(10, ws.rowCount); r += 1) {
    const vals = (ws.getRow(r).values as ExcelJS.CellValue[]).map((v) => String(flatten(v) ?? '').trim())
    if (vals.includes(keyColumn)) {
      headerRow = r
      headers = vals
      break
    }
  }
  if (!headerRow) return null

  const records: SheetRecord[] = []
  for (let r = headerRow + 1; r <= ws.rowCount; r += 1) {
    const raw = ws.getRow(r).values as ExcelJS.CellValue[]
    const values: Record<string, CellValue> = {}
    let any = false
    headers.forEach((h, idx) => {
      if (!h) return
      const v = flatten(raw[idx])
      values[h] = v
      if (v !== null && v !== '') any = true
    })
    if (any) records.push({ row: r, values })
  }
  return { name: sheetName, headers: headers.filter(Boolean), records }
}
